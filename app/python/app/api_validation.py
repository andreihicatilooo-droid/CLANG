"""Validate external API credentials and query Google AI Studio (Gemini API)."""
import json
import time
import urllib.error
import urllib.request

AI_STUDIO_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
AI_STUDIO_KEY_URL = 'https://aistudio.google.com/apikey'
FALLBACK_MODEL = 'gemini-2.5-flash-lite'
_MODEL_CACHE_TTL_SEC = 300

_model_cache = {'api_key': '', 'expires_at': 0.0, 'payload': None}


def _model_short_name(name):
    if not name:
        return ''
    return name.split('/', 1)[-1] if name.startswith('models/') else name


def _is_vision_model(model_id):
    lower = (model_id or '').lower()
    blocked = (
        'embed', 'aqa', 'learnlm', 'robotics', 'tts',
        'image-generation', 'imagen', 'gemma',
    )
    return not any(token in lower for token in blocked)


def pick_recommended_model(models):
    """Pick the fastest Gemini model suitable for screen translation (vision)."""
    candidates = [m for m in models if _is_vision_model(m.get('id', ''))]
    if not candidates:
        candidates = list(models)
    if not candidates:
        return FALLBACK_MODEL

    def score(entry):
        model_id = entry.get('id', '').lower()
        points = 0
        if 'flash-lite' in model_id or ('flash' in model_id and 'lite' in model_id):
            points += 200
        elif 'lite' in model_id:
            points += 180
        elif 'flash' in model_id:
            points += 120
        if 'pro' in model_id:
            points -= 80
        if '2.5' in model_id:
            points += 40
        elif '2.0' in model_id:
            points += 25
        elif '1.5' in model_id:
            points += 10
        if 'preview' in model_id or '-exp' in model_id:
            points -= 15
        return points

    return max(candidates, key=score)['id']


def _fetch_models_raw(api_key):
    url = f'{AI_STUDIO_API_BASE}/models?key={api_key}'
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode('utf-8'))


def _parse_models(data):
    models = []
    for entry in data.get('models', []):
        short = _model_short_name(entry.get('name', ''))
        if not short.startswith('gemini'):
            continue
        if 'generateContent' not in entry.get('supportedGenerationMethods', []):
            continue
        if not _is_vision_model(short):
            continue
        models.append({
            'id': short,
            'label': entry.get('displayName') or short,
        })
    models.sort(key=lambda m: m['id'])
    return models


def list_ai_studio_models(api_key, use_cache=True):
    """Return {models, recommended, error} from Google AI Studio."""
    api_key = (api_key or '').strip()
    if not api_key:
        return {'models': [], 'recommended': FALLBACK_MODEL, 'error': 'API ключ не задан'}

    now = time.monotonic()
    if (
        use_cache
        and _model_cache['payload'] is not None
        and _model_cache['api_key'] == api_key
        and now < _model_cache['expires_at']
    ):
        return dict(_model_cache['payload'])

    try:
        data = _fetch_models_raw(api_key)
        models = _parse_models(data)
        if not models:
            payload = {
                'models': [],
                'recommended': FALLBACK_MODEL,
                'error': 'Список моделей пуст',
            }
        else:
            recommended = pick_recommended_model(models)
            payload = {'models': models, 'recommended': recommended, 'error': None}

        if use_cache and not payload['error']:
            _model_cache['api_key'] = api_key
            _model_cache['expires_at'] = now + _MODEL_CACHE_TTL_SEC
            _model_cache['payload'] = payload
        return payload
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', errors='ignore')
        try:
            msg = json.loads(detail).get('error', {}).get('message', detail)
        except Exception:
            msg = detail[:200] or f'HTTP {e.code}'
        if e.code in (401, 403):
            return {'models': [], 'recommended': FALLBACK_MODEL, 'error': f'Неверный API ключ: {msg}'}
        return {'models': [], 'recommended': FALLBACK_MODEL, 'error': f'Ошибка AI Studio ({e.code}): {msg}'}
    except Exception as e:
        return {'models': [], 'recommended': FALLBACK_MODEL, 'error': f'Не удалось загрузить модели: {e}'}


def scan_ai_studio(api_key, current_model=None, model_auto=True):
    """Validate key, scan models, pick selected model."""
    api_key = (api_key or '').strip()
    current_model = (current_model or '').strip()

    listed = list_ai_studio_models(api_key, use_cache=False)
    if listed['error']:
        return {
            'valid': False,
            'models': [],
            'recommended': listed['recommended'],
            'selected': current_model or listed['recommended'],
            'message': listed['error'],
        }

    model_ids = [m['id'] for m in listed['models']]
    recommended = listed['recommended']

    if model_auto or not current_model or current_model not in model_ids:
        selected = recommended
    else:
        selected = current_model

    return {
        'valid': True,
        'models': listed['models'],
        'recommended': recommended,
        'selected': selected,
        'message': (
            f'Найдено моделей: {len(listed["models"])}. '
            f'Самая быстрая: {recommended}'
        ),
    }


def resolve_gemini_model(api_key=None, configured_model=None, model_auto=None):
    """Resolve model id for translation (respects auto mode + cache)."""
    from . import config

    api_key = (api_key if api_key is not None else config.get('gemini_api_key') or '').strip()
    configured_model = (
        configured_model if configured_model is not None else config.get('gemini_model')
    ) or FALLBACK_MODEL
    if model_auto is None:
        model_auto = bool(config.get('gemini_model_auto', True))

    if not model_auto:
        return configured_model

    if not api_key:
        return configured_model or FALLBACK_MODEL

    listed = list_ai_studio_models(api_key)
    if listed['error'] or not listed['models']:
        return configured_model or listed['recommended'] or FALLBACK_MODEL

    if not model_auto:
        model_ids = [m['id'] for m in listed['models']]
        if configured_model in model_ids:
            return configured_model
        return configured_model or listed['recommended'] or FALLBACK_MODEL

    return listed['recommended']


def validate_gemini_api_key(api_key, model=None):
    """Return {valid: bool, message: str} for a Google AI Studio API key."""
    api_key = (api_key or '').strip()
    if not api_key:
        return {'valid': False, 'message': 'API ключ не задан'}

    scan = scan_ai_studio(api_key, current_model=model, model_auto=False)
    if not scan['valid']:
        return {'valid': False, 'message': scan['message']}

    model = (model or scan['recommended'] or FALLBACK_MODEL).strip()
    if model not in [m['id'] for m in scan['models']]:
        model = scan['recommended']

    url = f'{AI_STUDIO_API_BASE}/models/{model}:generateContent?key={api_key}'
    body = json.dumps({
        'contents': [{'parts': [{'text': 'Reply with OK'}]}],
        'generationConfig': {'maxOutputTokens': 8, 'temperature': 0},
    }).encode('utf-8')

    try:
        req = urllib.request.Request(
            url, data=body, headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            json.loads(resp.read().decode('utf-8'))
        return {
            'valid': True,
            'message': f'Ключ действителен. Модель: {model}',
        }
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', errors='ignore')
        try:
            msg = json.loads(detail).get('error', {}).get('message', detail)
        except Exception:
            msg = detail[:200] or f'HTTP {e.code}'
        if e.code in (401, 403):
            return {'valid': False, 'message': f'Неверный API ключ: {msg}'}
        if e.code == 404:
            return {'valid': False, 'message': f'Модель не найдена: {model}'}
        return {'valid': False, 'message': f'Ошибка Gemini ({e.code}): {msg}'}
    except Exception as e:
        return {'valid': False, 'message': f'Не удалось проверить ключ: {e}'}
