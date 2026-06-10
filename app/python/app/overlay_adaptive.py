"""Adaptive overlay text styling from background colors."""
import numpy as np
from PIL import Image

# Pixels brighter than this are treated as foreground text, not background.
_TEXT_LUM_THRESHOLD = 0.62
# Below this → light text on dark UI (VS Code, etc.)
_DARK_UI_LUM = 0.52


def _relative_luminance(r, g, b):
    def channel(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def _contrast_ratio(l1, l2):
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def _mix(a, b, t):
    return int(round(a * (1 - t) + b * t))


def sample_region_stats(pil_image, x, y, w, h, step=2):
    """Return background RGB and luminance (ignoring bright text pixels)."""
    img = pil_image.convert('RGB')
    width, height = img.size
    x1 = max(0, int(x))
    y1 = max(0, int(y))
    x2 = min(width, int(x + w))
    y2 = min(height, int(y + h))
    if x2 <= x1 or y2 <= y1:
        return {
            'r': 30, 'g': 30, 'b': 46,
            'luminance': 0.08, 'decision_luminance': 0.08,
            'spread': 0.0, 'variance': 0.0,
        }

    pixels = []
    luminances = []
    bg_pixels = []

    for py in range(y1, y2, step):
        for px in range(x1, x2, step):
            r, g, b = img.getpixel((px, py))
            lum = _relative_luminance(r, g, b)
            pixels.append((r, g, b))
            luminances.append(lum)
            if lum < _TEXT_LUM_THRESHOLD:
                bg_pixels.append((r, g, b))

    if not pixels:
        return {
            'r': 30, 'g': 30, 'b': 46,
            'luminance': 0.08, 'decision_luminance': 0.08,
            'spread': 0.0, 'variance': 0.0,
        }

    if len(bg_pixels) < max(4, len(pixels) // 8):
        bg_pixels = pixels

    arr = np.array(bg_pixels, dtype=np.float32)
    lum_arr = np.array(luminances, dtype=np.float32)
    decision_lum = float(np.percentile(lum_arr, 25))

    return {
        'r': int(round(arr[:, 0].mean())),
        'g': int(round(arr[:, 1].mean())),
        'b': int(round(arr[:, 2].mean())),
        'luminance': float(_relative_luminance(
            int(round(arr[:, 0].mean())),
            int(round(arr[:, 1].mean())),
            int(round(arr[:, 2].mean())),
        )),
        'decision_luminance': decision_lum,
        'spread': float(lum_arr.max() - lum_arr.min()),
        'variance': float(arr.var()),
    }


def _readable_pair(decision_lum):
    """Return (fill, stroke) RGB with guaranteed contrast."""
    if decision_lum < _DARK_UI_LUM:
        fill = (255, 255, 255)
        stroke = (0, 0, 0)
    else:
        fill = (18, 18, 18)
        stroke = (255, 255, 255)

    fill_lum = _relative_luminance(*fill)
    if _contrast_ratio(decision_lum, fill_lum) < 4.5:
        if decision_lum < 0.5:
            fill = (255, 255, 255)
            stroke = (0, 0, 0)
        else:
            fill = (18, 18, 18)
            stroke = (255, 255, 255)

    return fill, stroke


def font_size_from_ocr_line(ocr_height_px, text, box_width_px, line_count=1):
    """Match original on-screen text size from OCR bounding box height."""
    lines = [ln for ln in (text or '').split('\n') if ln.strip()]
    count = max(1, line_count, len(lines))
    size = round((ocr_height_px * 0.88) / count)
    longest = max((len(ln) for ln in lines), default=1)
    max_by_width = int((box_width_px - 4) / max(1, longest * 0.5))
    if 0 < max_by_width < size:
        size = max_by_width
    return max(10, min(64, size))


def adaptive_text_style(stats, box_w, box_h, text, base_font_size=11, ocr_height_px=None):
    """Pick text/stroke colors and font size for a region."""
    decision_lum = stats.get('decision_luminance', stats['luminance'])
    busy = stats['spread'] > 0.22 or stats['variance'] > 700

    fill, stroke = _readable_pair(decision_lum)
    light_text = fill[0] > 200

    ocr_h = ocr_height_px if ocr_height_px is not None else box_h
    line_count = max(1, len([ln for ln in text.split('\n') if ln.strip()]))
    font_size = font_size_from_ocr_line(ocr_h, text, box_w, line_count)
    font_size = max(font_size, int(base_font_size))

    stroke_width = 0

    return {
        'fill': fill,
        'stroke_fill': stroke,
        'stroke_width': stroke_width,
        'font_size': font_size,
        'busy': busy,
        'light_text': light_text,
    }


def adaptive_overlay_colors(stats, alpha=0.94):
    """Background/text colors for boxed overlay (tkinter / HTML)."""
    style = adaptive_text_style(stats, 200, 40, 'Sample', 11)
    decision_lum = stats.get('decision_luminance', stats['luminance'])
    r, g, b = stats['r'], stats['g'], stats['b']
    busy = style['busy']

    if style['light_text']:
        bg = (_mix(r, 0, 0.72), _mix(g, 0, 0.72), _mix(b, 0, 0.72))
        fg = '#ffffff'
    else:
        bg = (_mix(r, 255, 0.55), _mix(g, 255, 0.55), _mix(b, 255, 0.55))
        fg = '#121212'

    scrim_alpha = min(0.98, max(0.82, alpha + (0.08 if busy or decision_lum < _DARK_UI_LUM else 0.04)))

    return {
        'bg': bg,
        'fg': fg,
        'alpha': scrim_alpha,
        'font_size': style['font_size'],
        'text_shadow': None,
    }
