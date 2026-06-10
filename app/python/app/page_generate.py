"""Экспериментальная генерация HTML-страницы перевода через Gemini."""
import json
import urllib.error
import urllib.request

from . import api_validation, config
from .translators import TranslationError, _lang_name

_HTML_MODEL = 'gemini-2.5-flash-lite'

_PROMPT = """Create a minimal standalone HTML page for this translation.
Target language: {target}.
Requirements:
- Complete HTML document with embedded CSS (dark theme, readable typography)
- Preserve paragraph structure and line breaks from the original
- Show original text in a muted section and translation prominently
- No external scripts or CDN links
- Return ONLY raw HTML starting with <!DOCTYPE html>

ORIGINAL:
{original}

TRANSLATION:
{translated}
"""


def generate_html_page(original, translated, target_lang=None):
    api_key = (config.get('gemini_api_key') or '').strip()
    if not api_key:
        raise TranslationError('Для генерации страницы нужен API-ключ Google AI Studio.')

    target = _lang_name(target_lang or config.get('target_lang') or 'ru')
    model = api_validation.resolve_gemini_model() or _HTML_MODEL
    prompt = _PROMPT.format(
        target=target,
        original=(original or '').strip() or '(empty)',
        translated=(translated or '').strip(),
    )

    url = (
        f'https://generativelanguage.googleapis.com/v1beta/'
        f'models/{model}:generateContent?key={api_key}'
    )
    body = json.dumps({
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {'temperature': 0.3, 'maxOutputTokens': 8192},
    }).encode('utf-8')

    req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        err = e.read().decode('utf-8', errors='ignore')
        raise TranslationError(f'HTML page HTTP {e.code}: {err[:400]}') from e

    try:
        raw = data['candidates'][0]['content']['parts'][0]['text'].strip()
    except (KeyError, IndexError) as e:
        raise TranslationError('Пустой ответ при генерации HTML') from e

    if '```' in raw:
        for chunk in raw.split('```'):
            chunk = chunk.strip()
            if chunk.lower().startswith('html'):
                chunk = chunk[4:].strip()
            if chunk.lower().startswith('<!doctype') or chunk.lower().startswith('<html'):
                return chunk

    start = raw.lower().find('<!doctype')
    if start < 0:
        start = raw.lower().find('<html')
    if start >= 0:
        return raw[start:].strip()

    raise TranslationError('Модель не вернула валидный HTML')
