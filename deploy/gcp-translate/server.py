"""Fast translation API for Screen Translator (NLLB + CTranslate2)."""
import os
import time
from contextlib import asynccontextmanager

import ctranslate2
import uvicorn
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from transformers import AutoTokenizer

from lang_codes import resolve_source, resolve_target

MODEL_ID = os.environ.get('MODEL_REPO', 'JustFrederik/nllb-200-distilled-600M-ct2-int8')
MODEL_DIR = os.environ.get('MODEL_DIR', '/app/model')
API_KEY = os.environ.get('API_KEY', '').strip()
PORT = int(os.environ.get('PORT', '8080'))

_tokenizer = None
_translator = None
_ready_at = 0.0


def _load_model():
    global _tokenizer, _translator, _ready_at
    _tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
    _translator = ctranslate2.Translator(MODEL_DIR, device='cpu', compute_type='int8')
    _ready_at = time.time()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _load_model()
    yield


app = FastAPI(title='Screen Translator GCP', version='1.0.0', lifespan=lifespan)


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)
    source_lang: str = 'auto'
    target_lang: str = 'ru'
    ocr_lang: str | None = None


class TranslateResponse(BaseModel):
    translated: str
    source_nllb: str
    target_nllb: str
    latency_ms: int


def _check_key(header_key: str | None):
    if API_KEY and header_key != API_KEY:
        raise HTTPException(status_code=401, detail='Invalid API key')


@app.get('/health')
def health():
    return {
        'status': 'ok' if _translator else 'loading',
        'model': MODEL_ID,
        'ready': _translator is not None,
        'uptime_sec': int(time.time() - _ready_at) if _ready_at else 0,
    }


@app.post('/v1/translate', response_model=TranslateResponse)
def translate(
    body: TranslateRequest,
    x_api_key: str | None = Header(default=None),
):
    _check_key(x_api_key)
    if not _translator or not _tokenizer:
        raise HTTPException(status_code=503, detail='Model not loaded')

    src = resolve_source(body.source_lang, body.ocr_lang)
    tgt = resolve_target(body.target_lang)
    _tokenizer.src_lang = src

    t0 = time.perf_counter()
    tokens = _tokenizer.convert_ids_to_tokens(_tokenizer.encode(body.text))
    result = _translator.translate_batch(
        [tokens],
        target_prefix=[[tgt]],
        beam_size=1,
        max_decoding_length=256,
    )[0]
    out_tokens = result.hypotheses[0]
    if tgt in out_tokens:
        out_tokens = [t for t in out_tokens if t != tgt]
    translated = _tokenizer.decode(
        _tokenizer.convert_tokens_to_ids(out_tokens)
    ).strip()
    latency_ms = int((time.perf_counter() - t0) * 1000)

    return TranslateResponse(
        translated=translated,
        source_nllb=src,
        target_nllb=tgt,
        latency_ms=latency_ms,
    )


if __name__ == '__main__':
    uvicorn.run(app, host='0.0.0.0', port=PORT, log_level='info')
