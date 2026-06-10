"""On-device NLLB translation via CTranslate2 (no network)."""
import os
import threading
import time

from . import config
from .nllb_langs import resolve_source, resolve_target

MODEL_REPO = 'JustFrederik/nllb-200-distilled-600M-ct2-int8'

_lock = threading.Lock()
_tokenizer = None
_translator = None
_ready = False
_loading = False
_error = None


def model_dir():
    return os.path.join(config.CONFIG_DIR, 'models', 'nllb-ct2-int8')


def _model_present():
    return os.path.isfile(os.path.join(model_dir(), 'model.bin'))


def _download_model():
    os.makedirs(model_dir(), exist_ok=True)
    if _model_present():
        return
    from huggingface_hub import snapshot_download
    snapshot_download(MODEL_REPO, local_dir=model_dir())


def _wait_for_load():
    while True:
        with _lock:
            if _ready or _error or not _loading:
                return
        time.sleep(0.05)


def _load_sync():
    global _tokenizer, _translator, _ready, _loading, _error

    with _lock:
        if _ready:
            return
        if _loading:
            _wait_for_load()
            return
        _loading = True
        _error = None

    try:
        _download_model()
        import ctranslate2
        from transformers import AutoTokenizer

        path = model_dir()
        tok = AutoTokenizer.from_pretrained(path)
        tr = ctranslate2.Translator(
            path,
            device='cpu',
            compute_type='int8',
            inter_threads=4,
            intra_threads=1,
        )
        with _lock:
            _tokenizer = tok
            _translator = tr
            _ready = True
    except Exception as exc:
        with _lock:
            _error = str(exc)
    finally:
        with _lock:
            _loading = False


def warmup(async_=True):
    if _ready:
        return
    if async_:
        threading.Thread(target=_load_sync, daemon=True, name='nllb-warmup').start()
    else:
        _load_sync()


def status():
    return {
        'ready': _ready,
        'loading': _loading,
        'model': MODEL_REPO,
        'path': model_dir(),
        'downloaded': _model_present(),
        'error': _error,
    }


def translate(text, source, target, ocr_lang=None):
    if not _ready:
        _load_sync()
    with _lock:
        if _error:
            raise RuntimeError(_error)
        if not _ready or not _tokenizer or not _translator:
            raise RuntimeError('Локальная модель NLLB ещё загружается')
        tok = _tokenizer
        tr = _translator

    src = resolve_source(source, ocr_lang)
    tgt = resolve_target(target)
    tok.src_lang = src
    tokens = tok.convert_ids_to_tokens(tok.encode(text))
    result = tr.translate_batch(
        [tokens],
        target_prefix=[[tgt]],
        beam_size=1,
        max_decoding_length=256,
    )[0]
    out_tokens = result.hypotheses[0]
    if tgt in out_tokens:
        out_tokens = [t for t in out_tokens if t != tgt]
    return tok.decode(tok.convert_tokens_to_ids(out_tokens)).strip()
