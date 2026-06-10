"""JSON-RPC method handlers — reuses existing app modules."""
import base64
import io
import threading

from PIL import Image

from app import api_validation, config, oauth, ocr, translators

VERSION = '1.0.0'
OAUTH_TIMEOUT_SEC = 120

_oauth_lock = threading.Lock()
_oauth_in_progress = False
_oauth_timeout_timer: threading.Timer | None = None
_oauth_result = {'done': True, 'success': False, 'message': ''}


def _clear_oauth_timeout():
    global _oauth_timeout_timer
    if _oauth_timeout_timer is not None:
        _oauth_timeout_timer.cancel()
        _oauth_timeout_timer = None


def _finish_oauth(success: bool, msg: str):
    global _oauth_in_progress
    with _oauth_lock:
        _clear_oauth_timeout()
        _oauth_in_progress = False
        _oauth_result['done'] = True
        _oauth_result['success'] = success
        _oauth_result['message'] = msg


def _oauth_timed_out():
    _finish_oauth(False, 'OAuth timed out')


def handle_health(_params):
    return {'status': 'ok', 'version': VERSION}


def handle_shutdown(_params):
    from . import server
    server.request_shutdown()
    return {'status': 'shutting_down'}


def handle_get_config(_params):
    return config.load()


def handle_save_config(params):
    updates = params.get('updates') or {}
    return config.save(updates)


def handle_get_ocr_languages(_params):
    return {'languages': ocr.available_languages()}


def handle_oauth_status(_params):
    return {'authorized': oauth.is_authorized()}


def handle_oauth_logout(_params):
    oauth.logout()
    return {'authorized': False}


def handle_oauth_start(_params):
    global _oauth_in_progress, _oauth_timeout_timer

    with _oauth_lock:
        if _oauth_in_progress:
            return {'started': False, 'message': 'OAuth already in progress'}

        _oauth_in_progress = True
        _oauth_result['done'] = False
        _oauth_result['success'] = False
        _oauth_result['message'] = ''
        _clear_oauth_timeout()
        _oauth_timeout_timer = threading.Timer(OAUTH_TIMEOUT_SEC, _oauth_timed_out)
        _oauth_timeout_timer.daemon = True
        _oauth_timeout_timer.start()

        def on_done(success, msg):
            _finish_oauth(success, msg)

        oauth.run_oauth_flow(on_done)
        return {'started': True}


def handle_oauth_poll(_params):
    with _oauth_lock:
        if not _oauth_result['done']:
            return {'done': False, 'authorized': oauth.is_authorized()}
        return {
            'done': True,
            'success': _oauth_result['success'],
            'message': _oauth_result['message'],
            'authorized': oauth.is_authorized(),
        }


def handle_list_gemini_models(params):
    api_key = params.get('api_key', '')
    return api_validation.list_ai_studio_models(api_key)


def handle_scan_ai_studio(params):
    api_key = params.get('api_key', '')
    current_model = params.get('current_model')
    model_auto = params.get('model_auto', True)
    return api_validation.scan_ai_studio(api_key, current_model, model_auto)


def handle_validate_gemini_api_key(params):
    api_key = params.get('api_key', '')
    model = params.get('model')
    return api_validation.validate_gemini_api_key(api_key, model)


def handle_translate_region(params):
    image_b64 = params.get('image_base64')
    if not image_b64:
        return {'error': 'image_base64 required'}

    try:
        img = Image.open(io.BytesIO(base64.b64decode(image_b64)))
    except Exception as e:
        return {'error': f'Invalid image: {e}'}

    ocr_lang = config.get('ocr_lang') or 'en-US'
    lines = []
    try:
        lines = ocr.recognize_with_boxes(img, ocr_lang)
    except Exception:
        lines = []

    try:
        translated, original = translators.translate_image(img, lines=lines)
    except translators.TranslationError as e:
        return {'error': str(e), 'lines': lines}
    except Exception as e:
        return {'error': f'Ошибка: {e}', 'lines': lines}

    if isinstance(translated, Image.Image):
        buf = io.BytesIO()
        translated.save(buf, format='PNG')
        return {
            'translated': '',
            'original': original,
            'lines': lines,
            'seamless_image_base64': base64.b64encode(buf.getvalue()).decode('ascii'),
            'error': None,
        }

    if not translated:
        return {'error': 'Текст не найден в этой области', 'lines': lines}

    return {
        'translated': translated,
        'original': original,
        'lines': lines,
        'seamless_image_base64': None,
        'error': None,
    }


METHODS = {
    'health': handle_health,
    'shutdown': handle_shutdown,
    'get_config': handle_get_config,
    'save_config': handle_save_config,
    'get_ocr_languages': handle_get_ocr_languages,
    'translate_region': handle_translate_region,
    'oauth_start': handle_oauth_start,
    'oauth_poll': handle_oauth_poll,
    'oauth_status': handle_oauth_status,
    'oauth_logout': handle_oauth_logout,
    'validate_gemini_api_key': handle_validate_gemini_api_key,
    'list_gemini_models': handle_list_gemini_models,
    'scan_ai_studio': handle_scan_ai_studio,
}
