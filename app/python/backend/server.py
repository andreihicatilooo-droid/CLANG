"""Localhost HTTP JSON-RPC server for Electron integration."""
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .handlers import METHODS

DEFAULT_PORT = 17890
HOST = '127.0.0.1'


class JsonRpcHandler(BaseHTTPRequestHandler):
    server_version = 'ScreenTranslatorBackend/1.0'

    def log_message(self, fmt, *args):
        if os.environ.get('SCREEN_TRANSLATOR_BACKEND_QUIET') != '1':
            super().log_message(fmt, *args)

    def _send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path.rstrip('/') in ('', '/health', '/rpc'):
            self._send_json(200, METHODS['health']({}))
            return
        self._send_json(404, {'error': 'not found'})

    def do_POST(self):
        if self.path.rstrip('/') not in ('', '/rpc'):
            self._send_json(404, {'error': 'not found'})
            return

        length = int(self.headers.get('Content-Length', 0))
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
    port = int(os.environ.get('SCREEN_TRANSLATOR_BACKEND_PORT', DEFAULT_PORT))

    # Ensure imports resolve when launched as script.
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if root not in sys.path:
        sys.path.insert(0, root)

    from app import config
    config.load()

    httpd = ThreadingHTTPServer((HOST, port), JsonRpcHandler)
    _write_port_file(port)
    print(f'[backend] listening on http://{HOST}:{port}', flush=True)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == '__main__':
    main()
