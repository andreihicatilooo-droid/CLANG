"""Health check for GCP local translation endpoint."""
import json
import urllib.error
import urllib.request

from . import config


def _headers():
    headers = {'Content-Type': 'application/json'}
    api_key = (config.get('gcp_local_api_key') or '').strip()
    if api_key:
        headers['X-API-Key'] = api_key
    return headers


def validate_gcp_local(base_url=None, api_key=None):
    """Ping /health on the GCP translation service."""
    url_base = (base_url or config.get('gcp_local_url') or '').strip().rstrip('/')
    if not url_base:
        return {'valid': False, 'message': 'Укажите URL сервиса GCP Translate'}

    key = api_key if api_key is not None else (config.get('gcp_local_api_key') or '').strip()
    headers = {'Content-Type': 'application/json'}
    if key:
        headers['X-API-Key'] = key

    req = urllib.request.Request(f'{url_base}/health', headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return {'valid': False, 'message': 'Неверный API-ключ'}
        err = e.read().decode('utf-8', errors='ignore')[:200]
        return {'valid': False, 'message': f'HTTP {e.code}: {err}'}
    except Exception as e:
        return {'valid': False, 'message': str(e)}

    if data.get('status') != 'ok' or not data.get('ready'):
        return {'valid': False, 'message': 'Сервис ещё загружает модель, повторите через минуту'}

    model = data.get('model', 'unknown')
    return {'valid': True, 'message': f'Подключено · {model}', 'model': model}
