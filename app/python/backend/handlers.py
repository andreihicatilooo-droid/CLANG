"""JSON-RPC method handlers — reuses existing app modules."""
import base64
import io
import threading

from PIL import Image

from app import config, oauth, ocr, translators

VERSION = '1.0.0'

_oauth_lock = threading.Lock()
_oauth_result = {'done': False, 'success': False, 'message': ''}


def _reset_oauth_result():
    _oauth_result['done'] = False
    _oauth_result['success'] = False
    _oauth_result['message'] = ''


def handle_health(_params):
    return {'status': 'ok', 'version': VERSION}


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
    with _oauth_lock:
        if not _oauth_result['done']:
            return {'started': False, 'message': 'OAuth already in progress'}

        _reset_oauth_result()

        def on_done(success, msg):
            _oauth_result['done'] = True
            _oauth_result['success'] = success
            _oauth_result['message'] = msg

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
        translated, original = translators.translate_image(img)
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
    'get_config': handle_get_config,
    'save_config': handle_save_config,
    'get_ocr_languages': handle_get_ocr_languages,
    'translate_region': handle_translate_region,
    'oauth_start': handle_oauth_start,
    'oauth_poll': handle_oauth_poll,
    'oauth_status': handle_oauth_status,
    'oauth_logout': handle_oauth_logout,
}
