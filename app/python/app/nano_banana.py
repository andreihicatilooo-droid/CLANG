"""Nano Banana Pro — перевод через генерацию страницы (Gemini image models)."""
import base64
import io
import json
import urllib.error
import urllib.request

from PIL import Image

from . import config


def _translation_error():
    from .translators import TranslationError
    return TranslationError

# Nano Banana Pro = Gemini 3 Pro Image; fallback = Gemini 2.5 Flash Image
MODELS = (
    'gemini-3-pro-image',
    'gemini-3-pro-image-preview',
    'gemini-2.5-flash-image',
)

_PAGE_PROMPT = (
    'You are a professional UI/localization designer. The image is a screenshot fragment '
    'with text. Recreate it as a clean translated page in {target}: same layout, colors, '
    'typography and structure, but ALL visible text translated accurately. '
    'Preserve lists, headings, paragraphs and spacing. Output ONE image of the full page.'
)

_TRANSLATE_PROMPT = (
    'Translate all visible text in this screenshot to {target}. '
    'Redraw the image with translated text in place, matching the original style.'
)


def _parse_image_response(data):
    """Extract first image and optional caption from Gemini generateContent response."""
    TranslationError = _translation_error()
    candidates = data.get('candidates') or []
    if not candidates:
        raise TranslationError(f'Nano Banana: нет candidates\n{json.dumps(data)[:400]}')

    parts = (candidates[0].get('content') or {}).get('parts') or []
    image_bytes = None
    mime = 'image/png'
    texts = []

    for part in parts:
        if part.get('text'):
            texts.append(part['text'].strip())
        inline = part.get('inlineData') or part.get('inline_data')
        if inline and inline.get('data'):
            image_bytes = base64.b64decode(inline['data'])
            mime = inline.get('mimeType') or inline.get('mime_type') or mime

    if not image_bytes:
        raise TranslationError(
            'Nano Banana: модель не вернула изображение. '
            'Проверьте API-ключ и доступ к image-моделям.'
        )

    pil = Image.open(io.BytesIO(image_bytes))
    if pil.mode not in ('RGB', 'RGBA'):
        pil = pil.convert('RGB')
    return pil, '\n'.join(t for t in texts if t)


def _request_model(model, api_key, body, timeout=120):
    TranslationError = _translation_error()
    url = (
        f'https://generativelanguage.googleapis.com/v1beta/'
        f'models/{model}:generateContent?key={api_key}'
    )
    req = urllib.request.Request(
        url,
        data=body,
        headers={'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        err = e.read().decode('utf-8', errors='ignore')
        raise TranslationError(f'Nano Banana HTTP {e.code}: {err[:500]}') from e


def translate_page(pil_image, target_lang, page_generate=True, fast=False):
    """Return (PIL.Image page, optional caption text)."""
    from .translators import TranslationError, _image_to_b64, _lang_name

    api_key = (config.get('gemini_api_key') or '').strip()
    if not api_key:
        raise TranslationError(
            'Nano Banana Pro требует API-ключ Google AI Studio (Настройки → Языки).')

    target = _lang_name(target_lang or config.get('target_lang') or 'ru')
    prompt = (_PAGE_PROMPT if page_generate else _TRANSLATE_PROMPT).format(target=target)
    b64, mime = _image_to_b64(pil_image, fast=fast)

    gen_cfg = {'responseModalities': ['TEXT', 'IMAGE']}
    if fast:
        gen_cfg['responseModalities'] = ['IMAGE']

    body = json.dumps({
        'contents': [{
            'parts': [
                {'text': prompt},
                {'inline_data': {'mime_type': mime, 'data': b64}},
            ]
        }],
        'generationConfig': gen_cfg,
    }).encode('utf-8')

    timeout = 90 if fast else 150
    models = (MODELS[2:], MODELS) if fast else MODELS
    last_err = None

    for model in models:
        try:
            data = _request_model(model, api_key, body, timeout=timeout)
            return _parse_image_response(data)
        except TranslationError as e:
            last_err = e
            if '404' in str(e) or 'not found' in str(e).lower():
                continue
            raise

    raise last_err or TranslationError('Nano Banana: ни одна image-модель не доступна')
