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
}

interface TesseractBbox {
  x0?: number
  y0?: number
  x1?: number
  y1?: number
  left?: number
  top?: number
  width?: number
  height?: number
}

interface TesseractLine {
  text: string
  bbox: TesseractBbox
}

interface TesseractParagraph {
  lines?: TesseractLine[]
}

interface TesseractBlock {
  paragraphs?: TesseractParagraph[]
}

interface TesseractPage {
  text: string
  blocks?: TesseractBlock[] | null
  lines?: TesseractLine[]
}

function normalizeBbox(bbox: TesseractBbox): { x: number; y: number; w: number; h: number } | null {
  if (
    bbox.x0 != null &&
    bbox.y0 != null &&
    bbox.x1 != null &&
    bbox.y1 != null
  ) {
    const w = bbox.x1 - bbox.x0
    const h = bbox.y1 - bbox.y0
    return w >= 2 && h >= 2 ? { x: bbox.x0, y: bbox.y0, w, h } : null
  }

  if (
    bbox.left != null &&
    bbox.top != null &&
    bbox.width != null &&
    bbox.height != null &&
    bbox.width >= 2 &&
    bbox.height >= 2
  ) {
    return { x: bbox.left, y: bbox.top, w: bbox.width, h: bbox.height }
  }

  return null
}

function lineFromBbox(text: string, bbox: TesseractBbox): OcrLine | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const box = normalizeBbox(bbox)
  if (!box) return null
  return { text: trimmed, ...box }
}

export function extractOcrLines(page: TesseractPage): OcrLine[] {
  const lines: OcrLine[] = []

  if (Array.isArray(page.lines)) {
    for (const line of page.lines) {
      const entry = lineFromBbox(line.text, line.bbox)
      if (entry) lines.push(entry)
    }
    if (lines.length > 0) return lines
  }

  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const entry = lineFromBbox(line.text, line.bbox)
        if (entry) lines.push(entry)
      }
    }
  }

  return lines
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function contrastTextColor(r: number, g: number, b: number): string {
  return luminance(r, g, b) > 140 ? '#1a1a1a' : '#f5f5f5'
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

  if (count === 0) return { r: 30, g: 30, b: 30 }

  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count)
  }
}

function fitFontSize(text: string, boxW: number, boxH: number): number {
  const lineCount = Math.max(1, text.split('\n').length)
  const maxByHeight = Math.floor((boxH - 4) / (lineCount * 1.25))
  const maxByWidth = Math.floor(boxW / Math.max(4, text.length / lineCount / 1.8))
  return Math.max(9, Math.min(22, maxByHeight, maxByWidth))
}

export function buildOverlayBlocks(
  lines: OcrLine[],
  translatedText: string,
  image: Jimp
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
      const fontSize = fitFontSize(text, line.w + pad * 2, line.h + pad * 2)

      return {
        x: Math.max(0, line.x - pad),
        y: Math.max(0, line.y - pad),
        w: line.w + pad * 2,
        h: line.h + pad * 2,
        text,
        bgColor: `rgba(${bg.r}, ${bg.g}, ${bg.b}, 0.96)`,
        textColor: contrastTextColor(bg.r, bg.g, bg.b),
        fontSize
      }
    })
}

export function buildFullRegionBlock(
  width: number,
  height: number,
  text: string,
  image: Jimp
): OverlayBlock[] {
  const bg = sampleBgColor(image, 0, 0, width, height)
  const fontSize = fitFontSize(text, width, height)

  return [
    {
      x: 0,
      y: 0,
      w: width,
      h: height,
      text,
      bgColor: `rgba(${bg.r}, ${bg.g}, ${bg.b}, 0.96)`,
      textColor: contrastTextColor(bg.r, bg.g, bg.b),
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

export function buildErrorBlock(width: number, height: number, message: string): OverlayBlock[] {
  return [
    {
      x: 0,
      y: 0,
      w: width,
      h: Math.min(height, 80),
      text: message,
      bgColor: 'rgba(46, 26, 26, 0.94)',
      textColor: '#f38ba8',
      fontSize: 13
    }
  ]
}
