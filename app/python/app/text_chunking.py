"""Split long OCR text for translation while preserving structure."""
import re

# Conservative limits per engine (characters).
_CHUNK_LIMITS = {
    'google': 4500,
    'local_nllb': 480,
    'gcp_local': 480,
    'default': 2000,
}


def chunk_limit(engine=None, fast=False):
    key = engine if engine in _CHUNK_LIMITS else 'default'
    limit = _CHUNK_LIMITS.get(key, _CHUNK_LIMITS['default'])
    if fast and key in ('local_nllb', 'gcp_local'):
        return min(limit, 320)
    return limit


def _split_long_paragraph(paragraph, max_chars):
    """Break a single paragraph by lines, then sentences."""
    if len(paragraph) <= max_chars:
        return [paragraph]

    parts = []
    buf = []
    buf_len = 0

    for line in paragraph.split('\n'):
        line = line.rstrip()
        add_len = len(line) + (1 if buf else 0)
        if buf and buf_len + add_len > max_chars:
            parts.append('\n'.join(buf))
            buf = [line] if line else []
            buf_len = len(line)
        else:
            if line or buf:
                buf.append(line)
                buf_len += add_len
        if not line and not buf:
            continue

    if buf:
        parts.append('\n'.join(buf))

    out = []
    for part in parts:
        if len(part) <= max_chars:
            out.append(part)
            continue
        sentences = re.split(r'(?<=[.!?…])\s+', part)
        sent_buf = []
        sent_len = 0
        for sent in sentences:
            if not sent:
                continue
            add = len(sent) + (1 if sent_buf else 0)
            if sent_buf and sent_len + add > max_chars:
                out.append(' '.join(sent_buf))
                sent_buf = [sent]
                sent_len = len(sent)
            else:
                sent_buf.append(sent)
                sent_len += add
        if sent_buf:
            out.append(' '.join(sent_buf))

    return out or [paragraph[:max_chars]]


def split_for_translation(text, max_chars=480):
    """Return chunks that rejoin to the original layout (paragraphs/lines)."""
    text = (text or '').replace('\r\n', '\n').replace('\r', '\n')
    if not text.strip():
        return []

    if len(text) <= max_chars:
        return [text]

    paragraphs = re.split(r'\n\n+', text)
    chunks = []

    for para in paragraphs:
        if not para.strip():
            chunks.append('')
            continue
        for piece in _split_long_paragraph(para, max_chars):
            chunks.append(piece)

    return chunks or [text]


def translate_in_chunks(text, translate_fn, engine=None, fast=False):
    """Translate long text chunk-by-chunk; translate_fn receives one chunk string."""
    text = (text or '').replace('\r\n', '\n').replace('\r', '\n')
    if not text.strip():
        return ''

    limit = chunk_limit(engine, fast=fast)
    if len(text) <= limit:
        return translate_fn(text)

    paragraphs = re.split(r'\n\n+', text)
    translated_paras = []

    for para in paragraphs:
        if not para.strip():
            translated_paras.append('')
            continue
        subchunks = split_for_translation(para, max_chars=limit)
        if len(subchunks) == 1:
            translated_paras.append(translate_fn(subchunks[0]))
        else:
            pieces = [translate_fn(c) if c.strip() else '' for c in subchunks]
            translated_paras.append('\n'.join(pieces))

    return '\n\n'.join(translated_paras)
