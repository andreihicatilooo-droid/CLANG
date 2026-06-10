import Jimp from 'jimp'

export interface OcrLine {
  text: string
  x: number
  y: number
  w: number
  h: number
}

export interface OverlayBlock {
  x: number
  y: number
  w: number
  h: number
  text: string
  bgColor: string
  textColor: string
  fontSize: number
  imageUrl?: string
}

export interface OverlayStyle {
  alpha: number
  fontSize: number
  theme: 'dark' | 'light'
}

const DEFAULT_OVERLAY_STYLE: OverlayStyle = {
  alpha: 0.94,
  fontSize: 11,
  theme: 'dark'
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function contrastTextColor(r: number, g: number, b: number, theme: OverlayStyle['theme']): string {
  if (theme === 'light') {
    return luminance(r, g, b) > 180 ? '#1e1e2e' : '#f9f9fb'
  }
  return luminance(r, g, b) > 140 ? '#1a1a1a' : '#cdd6f4'
}

function rgbaBg(r: number, g: number, b: number, alpha: number): string {
  const a = Math.max(0.1, Math.min(1, alpha))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export function sampleBgColor(
  image: Jimp,
  x: number,
  y: number,
  w: number,
  h: number
): { r: number; g: number; b: number } {
  const x1 = Math.max(0, Math.floor(x))
  const y1 = Math.max(0, Math.floor(y))
  const x2 = Math.min(image.bitmap.width, Math.ceil(x + w))
  const y2 = Math.min(image.bitmap.height, Math.ceil(y + h))

  let r = 0
  let g = 0
  let b = 0
  let count = 0

  for (let py = y1; py < y2; py += 2) {
    for (let px = x1; px < x2; px += 2) {
      const color = Jimp.intToRGBA(image.getPixelColor(px, py))
      r += color.r
      g += color.g
      b += color.b
      count++
    }
  }

  if (count === 0) {
    return DEFAULT_OVERLAY_STYLE.theme === 'light'
      ? { r: 249, g: 249, b: 251 }
      : { r: 30, g: 30, b: 46 }
  }

  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count)
  }
}

function fitFontSize(text: string, boxW: number, boxH: number, style: OverlayStyle): number {
  const lineCount = Math.max(1, text.split('\n').length)
  const maxByHeight = Math.floor((boxH - 4) / (lineCount * 1.25))
  const maxByWidth = Math.floor(boxW / Math.max(4, text.length / lineCount / 1.8))
  const cap = Math.max(style.fontSize, Math.min(22, style.fontSize * 2))
  return Math.max(9, Math.min(cap, maxByHeight, maxByWidth))
}

export function buildOverlayBlocks(
  lines: OcrLine[],
  translatedText: string,
  image: Jimp,
  style: OverlayStyle = DEFAULT_OVERLAY_STYLE
): OverlayBlock[] {
  if (lines.length === 0) return []

  const transLines = translatedText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  type Mapping = { line: OcrLine; text: string }

  let mapping: Mapping[]

  if (transLines.length === lines.length) {
    mapping = lines.map((line, i) => ({ line, text: transLines[i] ?? '' }))
  } else if (transLines.length === 1) {
    const x = Math.min(...lines.map((l) => l.x))
    const y = Math.min(...lines.map((l) => l.y))
    const x2 = Math.max(...lines.map((l) => l.x + l.w))
    const y2 = Math.max(...lines.map((l) => l.y + l.h))
    mapping = [{ line: { text: '', x, y, w: x2 - x, h: y2 - y }, text: transLines[0] }]
  } else {
    mapping = lines.map((line, i) => ({
      line,
      text: transLines[i] ?? transLines.join(' ')
    }))
  }

  const pad = 3

  return mapping
    .filter((m) => m.text)
    .map(({ line, text }) => {
      const bg = sampleBgColor(image, line.x, line.y, line.w, line.h)
      const fontSize = fitFontSize(text, line.w + pad * 2, line.h + pad * 2, style)

      return {
        x: Math.max(0, line.x - pad),
        y: Math.max(0, line.y - pad),
        w: line.w + pad * 2,
        h: line.h + pad * 2,
        text,
        bgColor: rgbaBg(bg.r, bg.g, bg.b, style.alpha),
        textColor: contrastTextColor(bg.r, bg.g, bg.b, style.theme),
        fontSize
      }
    })
}

export function buildFullRegionBlock(
  width: number,
  height: number,
  text: string,
  image: Jimp,
  style: OverlayStyle = DEFAULT_OVERLAY_STYLE
): OverlayBlock[] {
  const bg = sampleBgColor(image, 0, 0, width, height)
  const fontSize = fitFontSize(text, width, height, style)

  return [
    {
      x: 0,
      y: 0,
      w: width,
      h: height,
      text,
      bgColor: rgbaBg(bg.r, bg.g, bg.b, style.alpha),
      textColor: contrastTextColor(bg.r, bg.g, bg.b, style.theme),
      fontSize
    }
  ]
}

export function scaleBlocksToDip(blocks: OverlayBlock[], scaleFactor: number): OverlayBlock[] {
  if (scaleFactor <= 1) return blocks

  return blocks.map((block) => ({
    ...block,
    x: Math.round(block.x / scaleFactor),
    y: Math.round(block.y / scaleFactor),
    w: Math.round(block.w / scaleFactor),
    h: Math.round(block.h / scaleFactor),
    fontSize: Math.max(9, Math.round(block.fontSize / scaleFactor))
  }))
}

export function buildErrorBlock(
  width: number,
  height: number,
  message: string,
  style: OverlayStyle = DEFAULT_OVERLAY_STYLE
): OverlayBlock[] {
  return [
    {
      x: 0,
      y: 0,
      w: width,
      h: Math.min(height, 80),
      text: message,
      bgColor: rgbaBg(46, 26, 26, style.alpha),
      textColor: '#f38ba8',
      fontSize: Math.max(11, style.fontSize)
    }
  ]
}

export function buildSeamlessImageBlock(
  width: number,
  height: number,
  imageDataUrl: string
): OverlayBlock[] {
  return [
    {
      x: 0,
      y: 0,
      w: width,
      h: height,
      text: '',
      bgColor: 'transparent',
      textColor: '#000000',
      fontSize: 0,
      imageUrl: imageDataUrl
    }
  ]
}

export function overlayStyleFromConfig(cfg: {
  overlay_alpha?: number
  overlay_font_size?: number
  overlay_theme?: 'dark' | 'light'
}): OverlayStyle {
  return {
    alpha: cfg.overlay_alpha ?? DEFAULT_OVERLAY_STYLE.alpha,
    fontSize: cfg.overlay_font_size ?? DEFAULT_OVERLAY_STYLE.fontSize,
    theme: cfg.overlay_theme ?? DEFAULT_OVERLAY_STYLE.theme
  }
}
