"""Localhost HTTP JSON-RPC server for Electron integration."""
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .handlers import METHODS

DEFAULT_PORT = 17890
HOST = '127.0.0.1'
MAX_BODY_BYTES = 64 * 1024 * 1024
_AUTH_TOKEN = os.environ.get('SCREEN_TRANSLATOR_BACKEND_TOKEN', '')

_httpd = None

class JsonRpcHandler(BaseHTTPRequestHandler):
    server_version = 'ScreenTranslatorBackend/1.0'

    def log_message(self, fmt, *args):
        if os.environ.get('SCREEN_TRANSLATOR_BACKEND_QUIET') != '1':
            super().log_message(fmt, *args)

    def _authorized(self) -> bool:
        origin = self.headers.get('Origin')
        if origin and origin not in ('null', 'file://'):
            return False

        if not _AUTH_TOKEN:
            return True

        auth = self.headers.get('Authorization', '')
        if auth == f'Bearer {_AUTH_TOKEN}':
            return True
        return self.headers.get('X-Backend-Token') == _AUTH_TOKEN

    def _reject_unauthorized(self):
        self._send_json(401, {
            'jsonrpc': '2.0',
            'error': {'code': -32001, 'message': 'Unauthorized'},
            'id': None,
        })

    def _send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self._authorized():
            self._reject_unauthorized()
            return
        if self.path.rstrip('/') in ('', '/health', '/rpc'):
            self._send_json(200, METHODS['health']({}))
            return
        self._send_json(404, {'error': 'not found'})

    def do_POST(self):
        if not self._authorized():
            self._reject_unauthorized()
            return
        if self.path.rstrip('/') not in ('', '/rpc'):
            self._send_json(404, {'error': 'not found'})
            return

        raw_length = self.headers.get('Content-Length', '0')
        try:
            length = int(raw_length)
        except ValueError:
            self._send_json(400, {
                'jsonrpc': '2.0',
                'error': {'code': -32700, 'message': 'Invalid Content-Length'},
                'id': None,
            })
            return

        if length < 0 or length > MAX_BODY_BYTES:
            self._send_json(413, {
                'jsonrpc': '2.0',
                'error': {'code': -32700, 'message': 'Request body too large'},
                'id': None,
            })
            return

        raw = self.rfile.read(length) if length else b'{}'

        try:
            req = json.loads(raw.decode('utf-8'))
        except json.JSONDecodeError:
            self._send_json(400, {
                'jsonrpc': '2.0',
                'error': {'code': -32700, 'message': 'Parse error'},
                'id': None,
            })
            return

        req_id = req.get('id')
        method = req.get('method')
        params = req.get('params') or {}

        if not method or method not in METHODS:
            self._send_json(200, {
                'jsonrpc': '2.0',
                'error': {'code': -32601, 'message': f'Unknown method: {method}'},
                'id': req_id,
            })
            return

        try:
            result = METHODS[method](params)
            self._send_json(200, {
                'jsonrpc': '2.0',
                'result': result,
                'id': req_id,
            })
        except Exception as e:
            self._send_json(200, {
                'jsonrpc': '2.0',
                'error': {'code': -32000, 'message': str(e)},
                'id': req_id,
            })


def request_shutdown():
    """Stop the HTTP server from another thread (e.g. shutdown RPC)."""
    httpd = _httpd
    if httpd is None:
        return
    threading.Thread(target=httpd.shutdown, daemon=True).start()


def _write_port_file(port):
    port_file = os.environ.get('SCREEN_TRANSLATOR_PORT_FILE')
    if not port_file:
        return
    try:
        os.makedirs(os.path.dirname(port_file), exist_ok=True)
        with open(port_file, 'w', encoding='utf-8') as f:
            f.write(str(port))
    except Exception:
        pass


def main():
    global _httpd
    port = int(os.environ.get('SCREEN_TRANSLATOR_BACKEND_PORT', DEFAULT_PORT))

    # Ensure imports resolve when launched as script.
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if root not in sys.path:
        sys.path.insert(0, root)

    from app import config
    cfg = config.load()
    if cfg.get('engine') == 'local_nllb':
        try:
            from app import nllb_local
            nllb_local.warmup(async_=True)
            print('[backend] warming up local NLLB model…', flush=True)
        except Exception:
            pass

    httpd = ThreadingHTTPServer((HOST, port), JsonRpcHandler)
    _httpd = httpd
    _write_port_file(port)
    print(f'[backend] listening on http://{HOST}:{port}', flush=True)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        _httpd = None


if __name__ == '__main__':
    main()
