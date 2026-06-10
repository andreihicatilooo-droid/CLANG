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

from PIL import Image

from . import api_validation, config, text_chunking


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
def _translate_local_nllb_text(text, source, target, ocr_lang=None, fast=False):
    from . import nllb_local
    try:
        return nllb_local.translate(text, source, target, ocr_lang, fast=fast)
    except Exception as e:
        raise TranslationError(f'Local NLLB: {e}')


# ── GCP local (NLLB on Cloud Run) ─────────────────────────────────────────
def _translate_gcp_local_text(text, source, target, ocr_lang=None, fast=False):
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
    timeout = 12 if fast else 20
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
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

_VISION_PROMPT_FAST = (
    'Translate all visible text in this image to {target}. '
    'Return ONLY the translation. Preserve line breaks and paragraph spacing.'
)

_VISION_PROMPT_STRUCTURED = (
    'You are a translator. The image contains text (possibly multiple paragraphs, '
    'columns, or list items). Extract ALL text, then translate it to {target}. '
    'Return ONLY the translated text. Preserve the original structure: line breaks, '
    'blank lines between paragraphs, bullet/number prefixes where present. '
    'No commentary or labels.'
)

_FAST_VISION_MAX_DIM = 1280

_VISION_PROMPT_WITH_ORIGINAL = (
    'You are a translator. The image contains text. '
    'Extract all text from the image and translate it to {target}. '
    'Return the result as two blocks separated by a line containing only "---":\n'
    'ORIGINAL\n---\nTRANSLATION\n'
    'Do not add any other text, labels, or commentary.'
)


def _prepare_vision_image(pil_image, fast=False):
    img = pil_image
    if not fast:
        return img
    w, h = img.size
    max_dim = max(w, h)
    if max_dim <= _FAST_VISION_MAX_DIM:
        return img
    scale = _FAST_VISION_MAX_DIM / max_dim
    return img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)


def _image_to_b64(pil_image, fast=False):
    img = _prepare_vision_image(pil_image, fast)
    buf = io.BytesIO()
    if fast:
        if img.mode != 'RGB':
            img = img.convert('RGB')
        img.save(buf, format='JPEG', quality=82, optimize=True)
        mime = 'image/jpeg'
    else:
        img.save(buf, format='PNG')
        mime = 'image/png'
    return base64.b64encode(buf.getvalue()).decode('ascii'), mime


def _gemini_request_body(prompt, b64, mime='image/png', fast=False):
    gen_cfg = {'temperature': 0.1 if fast else 0.2}
    gen_cfg['maxOutputTokens'] = 1024 if fast else 8192
    return json.dumps({
        'contents': [{
            'parts': [
                {'text': prompt},
                {'inline_data': {'mime_type': mime, 'data': b64}},
            ]
        }],
        'generationConfig': gen_cfg,
    }).encode('utf-8')


def _gemini_call(url, headers, body, fast=False):
    req = urllib.request.Request(url, data=body, headers=headers)
    timeout = 25 if fast else 45
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
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


def _translate_gemini_vision_api(pil_image, target, with_original, fast=False):
    api_key = config.get('gemini_api_key').strip()
    if not api_key:
        raise TranslationError('Не задан API-ключ Google AI Studio (Настройки → Языки).')

    model = api_validation.resolve_gemini_model()
    if not model:
        model = 'gemini-2.5-flash-lite'
    if fast and 'flash-lite' not in model.lower():
        model = 'gemini-2.5-flash-lite'
    url = (f'https://generativelanguage.googleapis.com/v1beta/'
           f'models/{model}:generateContent?key={api_key}')

    if fast:
        prompt_t = _VISION_PROMPT_FAST
    elif with_original:
        prompt_t = _VISION_PROMPT_WITH_ORIGINAL
    else:
        prompt_t = _VISION_PROMPT_STRUCTURED
    b64, mime = _image_to_b64(pil_image, fast=fast)
    body = _gemini_request_body(
        prompt_t.format(target=_lang_name(target)),
        b64,
        mime=mime,
        fast=fast)

    return _gemini_call(url, {'Content-Type': 'application/json'}, body, fast=fast)


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


def _translate_gemini_vision_oauth(pil_image, target, with_original, fast=False):
    token = _get_oauth_token()
    model = api_validation.resolve_gemini_model() or 'gemini-2.5-flash-lite'
    if fast and 'flash-lite' not in model.lower():
        model = 'gemini-2.5-flash-lite'
    url = (f'https://generativelanguage.googleapis.com/v1beta/'
           f'models/{model}:generateContent')

    if fast:
        prompt_t = _VISION_PROMPT_FAST
    elif with_original:
        prompt_t = _VISION_PROMPT_WITH_ORIGINAL
    else:
        prompt_t = _VISION_PROMPT_STRUCTURED
    b64, mime = _image_to_b64(pil_image, fast=fast)
    body = _gemini_request_body(
        prompt_t.format(target=_lang_name(target)),
        b64,
        mime=mime,
        fast=fast)

    return _gemini_call(url, {
        'Content-Type':  'application/json',
        'Authorization': f'Bearer {token}',
    }, body, fast=fast)


# ── Public dispatcher ──────────────────────────────────────────────────────
def _lines_to_text(lines):
    if not lines:
        return ''
    return '\n'.join(l['text'] for l in lines if l.get('text'))


def _effective_engine(fast=False):
    """For live preview, prefer on-device NLLB when already loaded."""
    engine = config.get('engine')
    if not fast or engine != 'google':
        return engine
    from . import nllb_local
    if nllb_local.status().get('ready'):
        return 'local_nllb'
    return engine


def translate_image(pil_image, lines=None, fast=False, precomputed_text=None):
    """Returns (translated_text_or_image, original_text_or_None).

    lines: optional precomputed OCR boxes from recognize_with_boxes(); when
    provided, OCR is not run again inside this function.
    fast: live-preview optimizations (skip seamless, shorter prompts, etc.).
    precomputed_text: plain OCR text from recognize() in fast mode.
    """
    engine = _effective_engine(fast=fast)
    target = config.get('target_lang') or 'ru'
    show_original = bool(config.get('show_original')) and not fast
    seamless = bool(config.get('overlay_seamless')) and not fast
    ocr_lang = config.get('ocr_lang') or 'en-US'

    lines_data = lines
    if seamless and lines_data is None:
        from . import ocr
        try:
            lines_data = ocr.recognize_with_boxes(pil_image, ocr_lang)
        except Exception:
            lines_data = []

    if engine == 'nano_banana_pro':
        if not config.get('experimental_enabled'):
            raise TranslationError(
                'Nano Banana Pro: включите экспериментальные функции в настройках.')
        from . import nano_banana
        page_gen = bool(config.get('experimental_page_generate', True))
        img, caption = nano_banana.translate_page(
            pil_image, target, page_generate=page_gen, fast=fast)
        return img, (caption if show_original else None)

    if engine in ('gemini_api', 'gemini_oauth'):
        fn = (_translate_gemini_vision_api
              if engine == 'gemini_api' else _translate_gemini_vision_oauth)
        result = fn(pil_image, target, show_original, fast=fast)

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
    if precomputed_text is not None:
        original = precomputed_text
    elif lines is not None:
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
        translated = text_chunking.translate_in_chunks(
            original,
            lambda t: _translate_local_nllb_text(t, source, target, ocr_lang, fast=fast),
            engine='local_nllb',
            fast=fast,
        )
    elif engine == 'gcp_local':
        translated = text_chunking.translate_in_chunks(
            original,
            lambda t: _translate_gcp_local_text(t, source, target, ocr_lang, fast=fast),
            engine='gcp_local',
            fast=fast,
        )
    else:
        translated = text_chunking.translate_in_chunks(
            original,
            lambda t: _translate_google_text(t, source, target),
            engine='google',
            fast=fast,
        )

    if seamless and lines_data:
        from .inpainting import draw_translated_seamless
        return draw_translated_seamless(pil_image, lines_data, translated), (original if show_original else None)

    return translated, (original if show_original else None)
