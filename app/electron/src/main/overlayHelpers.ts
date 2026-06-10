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
  fontWeight?: number
  textShadow?: string
  imageUrl?: string
  /** flow = top-aligned pre-wrap with scroll for large structured text */
  layout?: 'flow' | 'center'
}

export interface OverlayStyle {
  alpha: number
  fontSize: number
  theme: 'dark' | 'light'
}

export interface RegionStats {
  r: number
  g: number
  b: number
  luminance: number
  decisionLuminance: number
  spread: number
  variance: number
}

const TEXT_LUM_THRESHOLD = 0.62
const DARK_UI_LUM = 0.52

const DEFAULT_OVERLAY_STYLE: OverlayStyle = {
  alpha: 0.94,
  fontSize: 14,
  theme: 'dark'
}

function channelLuminance(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

function mix(a: number, b: number, t: number): number {
  return Math.round(a * (1 - t) + b * t)
}

export function sampleRegionStats(
  image: Jimp,
  x: number,
  y: number,
  w: number,
  h: number
): RegionStats {
  const x1 = Math.max(0, Math.floor(x))
  const y1 = Math.max(0, Math.floor(y))
  const x2 = Math.min(image.bitmap.width, Math.ceil(x + w))
  const y2 = Math.min(image.bitmap.height, Math.ceil(y + h))

  let bgR = 0
  let bgG = 0
  let bgB = 0
  let bgCount = 0
  let count = 0
  let lumMin = 1
  let lumMax = 0
  const allLums: number[] = []

  for (let py = y1; py < y2; py += 2) {
    for (let px = x1; px < x2; px += 2) {
      const color = Jimp.intToRGBA(image.getPixelColor(px, py))
      const lum = relativeLuminance(color.r, color.g, color.b)
      allLums.push(lum)
      lumMin = Math.min(lumMin, lum)
      lumMax = Math.max(lumMax, lum)
      count++

      if (lum < TEXT_LUM_THRESHOLD) {
        bgR += color.r
        bgG += color.g
        bgB += color.b
        bgCount++
      }
    }
  }

  if (count === 0) {
    return {
      r: 30,
      g: 30,
      b: 46,
      luminance: 0.08,
      decisionLuminance: 0.08,
      spread: 0,
      variance: 0
    }
  }

  if (bgCount < Math.max(4, Math.floor(count / 8))) {
    for (let py = y1; py < y2; py += 2) {
      for (let px = x1; px < x2; px += 2) {
        const color = Jimp.intToRGBA(image.getPixelColor(px, py))
        bgR += color.r
        bgG += color.g
        bgB += color.b
        bgCount++
      }
    }
  }

  const avgR = bgR / bgCount
  const avgG = bgG / bgCount
  const avgB = bgB / bgCount

  allLums.sort((a, b) => a - b)
  const p25 = allLums[Math.floor(allLums.length * 0.25)] ?? lumMin

  let varSum = 0
  for (let py = y1; py < y2; py += 2) {
    for (let px = x1; px < x2; px += 2) {
      const color = Jimp.intToRGBA(image.getPixelColor(px, py))
      if (relativeLuminance(color.r, color.g, color.b) >= TEXT_LUM_THRESHOLD) continue
      varSum += (color.r - avgR) ** 2 + (color.g - avgG) ** 2 + (color.b - avgB) ** 2
    }
  }

  return {
    r: Math.round(avgR),
    g: Math.round(avgG),
    b: Math.round(avgB),
    luminance: relativeLuminance(avgR, avgG, avgB),
    decisionLuminance: p25,
    spread: lumMax - lumMin,
    variance: varSum / Math.max(1, bgCount)
  }
}

/** @deprecated use sampleRegionStats */
export function sampleBgColor(
  image: Jimp,
  x: number,
  y: number,
  w: number,
  h: number
): { r: number; g: number; b: number } {
  const stats = sampleRegionStats(image, x, y, w, h)
  return { r: stats.r, g: stats.g, b: stats.b }
}

function isBusyBackground(stats: RegionStats): boolean {
  return stats.spread > 0.28 || stats.variance > 900
}

function readableTextColors(stats: RegionStats): { text: string; stroke: string; light: boolean } {
  const decisionLum = stats.decisionLuminance

  let light = decisionLum < DARK_UI_LUM
  let text = light ? '#ffffff' : '#121212'
  let stroke = light ? '#000000' : '#ffffff'

  const textLum = light ? 1 : relativeLuminance(18, 18, 18)
  if (contrastRatio(decisionLum, textLum) < 4.5) {
    light = decisionLum < 0.5
    text = light ? '#ffffff' : '#121212'
    stroke = light ? '#000000' : '#ffffff'
  }

  return { text, stroke, light }
}

function adaptiveBgColor(stats: RegionStats, lightText: boolean, alpha: number): string {
  const { r, g, b } = stats
  const busy = isBusyBackground(stats)
  const darkUi = stats.decisionLuminance < DARK_UI_LUM
  const a = Math.max(0.82, Math.min(0.98, alpha + (busy || darkUi ? 0.08 : 0.04)))

  if (lightText) {
    return `rgba(${mix(r, 0, 0.72)}, ${mix(g, 0, 0.72)}, ${mix(b, 0, 0.72)}, ${a})`
  }
  return `rgba(${mix(r, 255, 0.55)}, ${mix(g, 255, 0.55)}, ${mix(b, 255, 0.55)}, ${a})`
}

function adaptiveTextShadow(_lightText: boolean, _stats: RegionStats): string | undefined {
  return undefined
}

function adaptiveFontWeight(lightText: boolean, stats: RegionStats): number {
  if (lightText) return stats.decisionLuminance < 0.25 ? 700 : 600
  return stats.decisionLuminance > 0.75 ? 700 : 600
}

const MIN_UNIFIED_CHARS = 40

function bboxOfLines(lines: OcrLine[]): OcrLine {
  const x = Math.min(...lines.map((l) => l.x))
  const y = Math.min(...lines.map((l) => l.y))
  const x2 = Math.max(...lines.map((l) => l.x + l.w))
  const y2 = Math.max(...lines.map((l) => l.y + l.h))
  return { text: '', x, y, w: x2 - x, h: y2 - y }
}

function shouldUseUnifiedBlock(lines: OcrLine[], translatedText: string): boolean {
  if (lines.length === 0) return true
  // Несколько строк OCR — всегда одна панель на всю выделенную область.
  if (lines.length > 1) return true
  if (translatedText.includes('\n')) return true
  if (translatedText.length >= MIN_UNIFIED_CHARS) return true
  return false
}

function fontSizeForFlowBlock(boxW: number, text: string, style: OverlayStyle): number {
  const lineCount = Math.max(1, text.split('\n').length)
  const avgChars = text.length / lineCount
  let size = style.fontSize
  const byWidth = Math.floor((boxW - 20) / Math.max(avgChars * 0.48, 10))
  if (byWidth > 0 && byWidth < size) size = byWidth
  return Math.max(10, Math.min(20, size))
}

/** Map Windows OCR line height (px) to CSS/PIL font size. */
export function fontSizeFromOcrLine(
  ocrHeightPx: number,
  text: string,
  boxWidthPx: number,
  lineCount = 1
): number {
  const lines = text.split('\n').filter(Boolean)
  const count = Math.max(1, lineCount, lines.length)
  // Cap height ≈ font size / 0.88 for Segoe UI
  let size = Math.round((ocrHeightPx * 0.88) / count)
  const longest = Math.max(...lines.map((l) => l.length), 1)
  const maxByWidth = Math.floor((boxWidthPx - 4) / Math.max(1, longest * 0.5))
  if (maxByWidth > 0 && maxByWidth < size) {
    size = maxByWidth
  }
  return Math.max(10, Math.min(64, size))
}

function fitFontSize(
  text: string,
  ocrHeightPx: number,
  boxW: number,
  lineCount: number,
  style: OverlayStyle
): number {
  const size = fontSizeFromOcrLine(ocrHeightPx, text, boxW, lineCount)
  return Math.max(size, style.fontSize)
}

function buildAdaptiveBlock(
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  image: Jimp,
  sampleX: number,
  sampleY: number,
  sampleW: number,
  sampleH: number,
  ocrHeightPx: number,
  style: OverlayStyle,
  layout: 'flow' | 'center' = 'center'
): OverlayBlock {
  const stats = sampleRegionStats(image, sampleX, sampleY, sampleW, sampleH)
  const colors = readableTextColors(stats)
  const lineCount = Math.max(1, text.split('\n').filter(Boolean).length)
  const fontSize =
    layout === 'flow'
      ? fontSizeForFlowBlock(w, text, style)
      : fitFontSize(text, ocrHeightPx, w, lineCount, style)

  return {
    x,
    y,
    w,
    h,
    text,
    bgColor: adaptiveBgColor(stats, colors.light, style.alpha),
    textColor: colors.text,
    fontSize,
    fontWeight: adaptiveFontWeight(colors.light, stats),
    textShadow: adaptiveTextShadow(colors.light, stats),
    layout
  }
}

export function buildOverlayBlocks(
  lines: OcrLine[],
  translatedText: string,
  image: Jimp,
  style: OverlayStyle = DEFAULT_OVERLAY_STYLE,
  displayText?: string,
  regionW?: number,
  regionH?: number
): OverlayBlock[] {
  if (lines.length === 0) return []

  const text = displayText ?? translatedText
  const rw = Math.max(1, regionW ?? bboxOfLines(lines).w)
  const rh = Math.max(1, regionH ?? bboxOfLines(lines).h)

  if (shouldUseUnifiedBlock(lines, translatedText)) {
    return buildFullRegionBlock(rw, rh, text, image, style)
  }

  // Одна строка OCR — компактный блок поверх исходной строки.
  const line = lines[0]
  const pad = 3
  const blockText = translatedText.trim() || text
  return [
    buildAdaptiveBlock(
      Math.max(0, line.x - pad),
      Math.max(0, line.y - pad),
      line.w + pad * 2,
      line.h + pad * 2,
      blockText,
      image,
      line.x,
      line.y,
      line.w,
      line.h,
      line.h,
      style,
      blockText.includes('\n') ? 'flow' : 'center'
    )
  ]
}

export function buildFullRegionBlock(
  width: number,
  height: number,
  text: string,
  image: Jimp,
  style: OverlayStyle = DEFAULT_OVERLAY_STYLE
): OverlayBlock[] {
  return [
    buildAdaptiveBlock(
      0,
      0,
      width,
      height,
      text,
      image,
      0,
      0,
      width,
      height,
      height,
      style,
      'flow'
    )
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
    fontSize: Math.max(10, Math.round(block.fontSize / scaleFactor))
  }))
}

export function buildLoadingBlock(
  width: number,
  height: number,
  message = 'Перевод…',
  style: OverlayStyle = DEFAULT_OVERLAY_STYLE
): OverlayBlock[] {
  return [
    {
      x: 0,
      y: 0,
      w: width,
      h: Math.max(Math.min(height, 56), 36),
      text: message,
      bgColor: `rgba(30, 30, 46, ${style.alpha})`,
      textColor: '#89b4fa',
      fontSize: Math.max(12, style.fontSize),
      fontWeight: 500
    }
  ]
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
      bgColor: `rgba(46, 26, 26, ${style.alpha})`,
      textColor: '#f38ba8',
      fontSize: Math.max(11, style.fontSize),
      fontWeight: 600
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
