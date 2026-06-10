"""Windows.Media.Ocr — built-in OCR engine, no external dependencies."""
import asyncio
import io
import threading


# Cache imports — winrt has startup cost
_runtime_ready = False


def _ensure_runtime():
    global _runtime_ready
    if _runtime_ready:
        return
    import winrt
    _runtime_ready = True


async def _ocr_async(png_bytes, lang_tag):
    from winrt.windows.media.ocr import OcrEngine
    from winrt.windows.graphics.imaging import BitmapDecoder
    from winrt.windows.storage.streams import (
        InMemoryRandomAccessStream, DataWriter)
    from winrt.windows.globalization import Language

    stream = InMemoryRandomAccessStream()
    writer = DataWriter(stream.get_output_stream_at(0))
    writer.write_bytes(png_bytes)
    await writer.store_async()
    await writer.flush_async()
    writer.detach_stream()
    stream.seek(0)

    decoder = await BitmapDecoder.create_async(stream)
    bitmap = await decoder.get_software_bitmap_async()

    engine = None
    if lang_tag and lang_tag != 'auto':
        try:
            engine = OcrEngine.try_create_from_language(Language(lang_tag))
        except Exception:
            engine = None
    if engine is None:
        engine = OcrEngine.try_create_from_user_profile_languages()
    if engine is None:
        raise RuntimeError(
            'Windows OCR не поддерживает выбранный язык.\n'
            'Установите языковой пакет: Параметры → Время и язык → Язык → '
            '«Добавить язык» → выбрать с пометкой "Распознавание текста".')

    result = await engine.recognize_async(bitmap)
    return (result.text or '').strip()


async def _ocr_lines_async(png_bytes, lang_tag):
    from winrt.windows.media.ocr import OcrEngine
    from winrt.windows.graphics.imaging import BitmapDecoder
    from winrt.windows.storage.streams import (
        InMemoryRandomAccessStream, DataWriter)
    from winrt.windows.globalization import Language

    stream = InMemoryRandomAccessStream()
    writer = DataWriter(stream.get_output_stream_at(0))
    writer.write_bytes(png_bytes)
    await writer.store_async()
    await writer.flush_async()
    writer.detach_stream()
    stream.seek(0)

    decoder = await BitmapDecoder.create_async(stream)
    bitmap = await decoder.get_software_bitmap_async()

    engine = None
    if lang_tag and lang_tag != 'auto':
        try:
            engine = OcrEngine.try_create_from_language(Language(lang_tag))
        except Exception:
            engine = None
    if engine is None:
        engine = OcrEngine.try_create_from_user_profile_languages()
    if engine is None:
        raise RuntimeError('Windows OCR engine failed.')

    result = await engine.recognize_async(bitmap)
    
    lines_data = []
    for line in result.lines:
        text = line.text
        if not text.strip():
            continue
        # calculate bounding box of the line
        words = list(line.words)
        if not words:
            continue
            
        x_min = min(w.bounding_rect.x for w in words)
        y_min = min(w.bounding_rect.y for w in words)
        x_max = max(w.bounding_rect.x + w.bounding_rect.width for w in words)
        y_max = max(w.bounding_rect.y + w.bounding_rect.height for w in words)
        
        lines_data.append({
            'text': text,
            'x': int(x_min),
            'y': int(y_min),
            'w': int(x_max - x_min),
            'h': int(y_max - y_min)
        })
        
    return lines_data


def available_languages():
    """Return list of BCP-47 tags of languages with installed OCR support."""
    try:
        _ensure_runtime()
        from winrt.windows.media.ocr import OcrEngine
        langs = OcrEngine.available_recognizer_languages
        return [l.language_tag for l in langs]
    except Exception:
        return []


def recognize(pil_image, lang_tag='en'):
    """Sync wrapper. Run async OCR on a dedicated event loop in this thread."""
    _ensure_runtime()
    buf = io.BytesIO()
    pil_image.save(buf, format='PNG')
    png_bytes = bytes(buf.getvalue())

    # Each call gets a fresh loop — winrt async tasks complete fully here.
    result = {'text': None, 'error': None}

    def runner():
        try:
            result['text'] = asyncio.run(_ocr_async(png_bytes, lang_tag))
        except Exception as e:
            result['error'] = e

    t = threading.Thread(target=runner)
    t.start()
    t.join()

    if result['error']:
        raise result['error']
    return result['text']


def recognize_with_boxes(pil_image, lang_tag='en'):
    """Sync wrapper to run async OCR and return lines with bounding boxes."""
    _ensure_runtime()
    buf = io.BytesIO()
    pil_image.save(buf, format='PNG')
    png_bytes = bytes(buf.getvalue())

    result = {'data': None, 'error': None}

    def runner():
        try:
            result['data'] = asyncio.run(_ocr_lines_async(png_bytes, lang_tag))
        except Exception as e:
            result['error'] = e

    t = threading.Thread(target=runner)
    t.start()
    t.join()

    if result['error']:
        raise result['error']
    return result['data']
