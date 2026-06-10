"""Translation engines.

Google free   : Windows OCR -> deep-translator (text-only).
Local NLLB    : Windows OCR -> on-device NLLB (fastest, no network).
GCP local     : Windows OCR -> NLLB on Cloud Run (network latency).
Gemini API key: Gemini Vision (image -> translation in one shot).
Gemini OAuth  : Same, via OAuth bearer token.
"""
import base64
import io
import json
import os
import urllib.request
import urllib.error

from . import api_validation, config


class TranslationError(Exception):
    pass


_LANG_NAMES = {
    'ru': 'Russian', 'en': 'English', 'de': 'German', 'fr': 'French',
    'es': 'Spanish', 'it': 'Italian', 'pt': 'Portuguese', 'pl': 'Polish',
    'uk': 'Ukrainian', 'zh-CN': 'Simplified Chinese', 'ja': 'Japanese',
    'ko': 'Korean', 'tr': 'Turkish', 'ar': 'Arabic',
}


def _lang_name(code):
    return _LANG_NAMES.get(code, code)


# ── Local NLLB (on-device) ────────────────────────────────────────────────
def _translate_local_nllb_text(text, source, target, ocr_lang=None):
    from . import nllb_local
    try:
        return nllb_local.translate(text, source, target, ocr_lang)
    except Exception as e:
        raise TranslationError(f'Local NLLB: {e}')


# ── GCP local (NLLB on Cloud Run) ─────────────────────────────────────────
def _translate_gcp_local_text(text, source, target, ocr_lang=None):
    base_url = (config.get('gcp_local_url') or '').strip().rstrip('/')
    if not base_url:
        raise TranslationError('Не задан URL GCP Translate (Настройки → Языки).')

    api_key = (config.get('gcp_local_api_key') or '').strip()
    body = json.dumps({
        'text': text,
        'source_lang': source or 'auto',
        'target_lang': target,
        'ocr_lang': ocr_lang,
    }).encode('utf-8')

    headers = {'Content-Type': 'application/json'}
    if api_key:
        headers['X-API-Key'] = api_key

    req = urllib.request.Request(f'{base_url}/v1/translate', data=body, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise TranslationError('GCP Translate: неверный API-ключ')
        err = e.read().decode('utf-8', errors='ignore')
        raise TranslationError(f'GCP HTTP {e.code}: {err[:400]}')
    except Exception as e:
        raise TranslationError(f'GCP Translate: {e}')

    translated = (data.get('translated') or '').strip()
    if not translated:
        raise TranslationError('GCP Translate: пустой ответ')
    return translated


# ── Google free ────────────────────────────────────────────────────────────
def _translate_google_text(text, source, target):
    from deep_translator import GoogleTranslator
    try:
        return GoogleTranslator(source=source or 'auto', target=target).translate(text)
    except Exception as e:
        raise TranslationError(f'Google: {e}')


# ── Gemini Vision (single-shot OCR + translation) ──────────────────────────
_VISION_PROMPT = (
    'You are a translator. The image contains text. '
    'Extract all text from the image, then translate it to {target}. '
    'Return ONLY the translated text — no original, no labels, no quotes, '
    'no commentary. Preserve line breaks where natural.'
)

_VISION_PROMPT_WITH_ORIGINAL = (
    'You are a translator. The image contains text. '
    'Extract all text from the image and translate it to {target}. '
    'Return the result as two blocks separated by a line containing only "---":\n'
    'ORIGINAL\n---\nTRANSLATION\n'
    'Do not add any other text, labels, or commentary.'
)


def _image_to_b64(pil_image):
    buf = io.BytesIO()
    pil_image.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode('ascii')


def _gemini_request_body(prompt, b64):
    return json.dumps({
        'contents': [{
            'parts': [
                {'text': prompt},
                {'inline_data': {'mime_type': 'image/png', 'data': b64}},
            ]
        }],
        'generationConfig': {'temperature': 0.2},
    }).encode('utf-8')


def _gemini_call(url, headers, body):
    req = urllib.request.Request(url, data=body, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        err = e.read().decode('utf-8', errors='ignore')
        raise TranslationError(f'Gemini HTTP {e.code}: {err[:400]}')
    except Exception as e:
        raise TranslationError(f'Gemini: {e}')

    try:
        return data['candidates'][0]['content']['parts'][0]['text'].strip()
    except (KeyError, IndexError):
        raise TranslationError(f'Gemini: пустой ответ\n{json.dumps(data)[:400]}')


def _translate_gemini_vision_api(pil_image, target, with_original):
    api_key = config.get('gemini_api_key').strip()
    if not api_key:
        raise TranslationError('Не задан API-ключ Google AI Studio (Настройки → Языки).')

    model = api_validation.resolve_gemini_model()
    if not model:
        model = 'gemini-2.5-flash-lite'
    url = (f'https://generativelanguage.googleapis.com/v1beta/'
           f'models/{model}:generateContent?key={api_key}')

    prompt_t = _VISION_PROMPT_WITH_ORIGINAL if with_original else _VISION_PROMPT
    body = _gemini_request_body(
        prompt_t.format(target=_lang_name(target)),
        _image_to_b64(pil_image))

    return _gemini_call(url, {'Content-Type': 'application/json'}, body)


def _get_oauth_token():
    if not os.path.exists(config.TOKEN_PATH):
        raise TranslationError(
            'OAuth не настроен. Откройте Настройки → Перевод → "Войти через Google".')

    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
    except ImportError:
        raise TranslationError('Не установлены пакеты google-auth.')

    creds = Credentials.from_authorized_user_file(config.TOKEN_PATH)
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(config.TOKEN_PATH, 'w', encoding='utf-8') as f:
                f.write(creds.to_json())
        else:
            raise TranslationError('OAuth токен невалиден, войдите заново.')
    return creds.token


def _translate_gemini_vision_oauth(pil_image, target, with_original):
    token = _get_oauth_token()
    model = api_validation.resolve_gemini_model() or 'gemini-2.5-flash-lite'
    url = (f'https://generativelanguage.googleapis.com/v1beta/'
           f'models/{model}:generateContent')

    prompt_t = _VISION_PROMPT_WITH_ORIGINAL if with_original else _VISION_PROMPT
    body = _gemini_request_body(
        prompt_t.format(target=_lang_name(target)),
        _image_to_b64(pil_image))

    return _gemini_call(url, {
        'Content-Type':  'application/json',
        'Authorization': f'Bearer {token}',
    }, body)


# ── Public dispatcher ──────────────────────────────────────────────────────
def _lines_to_text(lines):
    if not lines:
        return ''
    return '\n'.join(l['text'] for l in lines if l.get('text'))


def translate_image(pil_image, lines=None):
    """Returns (translated_text_or_image, original_text_or_None).

    lines: optional precomputed OCR boxes from recognize_with_boxes(); when
    provided, OCR is not run again inside this function.
    """
    engine = config.get('engine')
    target = config.get('target_lang') or 'ru'
    show_original = bool(config.get('show_original'))
    seamless = bool(config.get('overlay_seamless'))
    ocr_lang = config.get('ocr_lang') or 'en-US'

    lines_data = lines
    if seamless and lines_data is None:
        from . import ocr
        try:
            lines_data = ocr.recognize_with_boxes(pil_image, ocr_lang)
        except Exception:
            lines_data = []

    if engine in ('gemini_api', 'gemini_oauth'):
        fn = (_translate_gemini_vision_api
              if engine == 'gemini_api' else _translate_gemini_vision_oauth)
        result = fn(pil_image, target, show_original)

        translated, original = result, None
        if show_original and '---' in result:
            parts = [p.strip() for p in result.split('---', 1)]
            if len(parts) == 2:
                translated, original = parts[1], parts[0]

        if seamless and lines_data:
            from .inpainting import draw_translated_seamless
            return draw_translated_seamless(pil_image, lines_data, translated), original

        return translated, original

    # OCR + text route: google (free) or gcp_local (Cloud Run NLLB)
    if lines is not None:
        original = _lines_to_text(lines)
    elif seamless and lines_data is not None:
        original = _lines_to_text(lines_data)
    else:
        from . import ocr
        try:
            original = ocr.recognize(pil_image, ocr_lang)
        except Exception as e:
            raise TranslationError(f'Windows OCR: {e}')

    if not original:
        return '', None

    source = config.get('source_lang') or 'auto'
    if engine == 'local_nllb':
        translated = _translate_local_nllb_text(original, source, target, ocr_lang)
    elif engine == 'gcp_local':
        translated = _translate_gcp_local_text(original, source, target, ocr_lang)
    else:
        translated = _translate_google_text(original, source, target)

    if seamless and lines_data:
        from .inpainting import draw_translated_seamless
        return draw_translated_seamless(pil_image, lines_data, translated), (original if show_original else None)

    return translated, (original if show_original else None)
