import Jimp from 'jimp'
import type { ScreenTranslatorConfig } from '../shared/config'
import type { TranslateRegionResult } from './backendClient'
import {
  buildErrorBlock,
  buildFullRegionBlock,
  buildOverlayBlocks,
  buildSeamlessImageBlock,
  scaleBlocksToDip,
  type OverlayBlock,
  type OverlayStyle
} from './overlayHelpers'
import type { CapturedRegion } from './displayCapture'

export interface ProcessedCapture {
  imageBase64: string
  image: Jimp
  safeCropW: number
  safeCropH: number
  scaleFactor: number
}

export function makeRegionKey(x: number, y: number, w: number, h: number): string {
  return `${Math.round(x)}:${Math.round(y)}:${Math.round(w)}:${Math.round(h)}`
}

const FAST_MAX_DIM = 1280
const FAST_JPEG_QUALITY = 82

export async function processCapturedRegion(
  captured: CapturedRegion,
  options?: { fast?: boolean }
): Promise<ProcessedCapture> {
  const { imageBuffer, cropX, cropY, cropW, cropH, scaleFactor } = captured
  const image = await Jimp.read(imageBuffer)

  const safeCropW = Math.max(1, Math.min(cropW, image.bitmap.width - cropX))
  const safeCropH = Math.max(1, Math.min(cropH, image.bitmap.height - cropY))

  image.crop(cropX, cropY, safeCropW, safeCropH)

  if (options?.fast) {
    const maxDim = Math.max(safeCropW, safeCropH)
    if (maxDim > FAST_MAX_DIM) {
      image.scale(FAST_MAX_DIM / maxDim)
    }
  }

  const croppedBuffer = options?.fast
    ? await image.quality(FAST_JPEG_QUALITY).getBufferAsync(Jimp.MIME_JPEG)
    : await image.getBufferAsync(Jimp.MIME_PNG)

  return {
    imageBase64: croppedBuffer.toString('base64'),
    image,
    safeCropW,
    safeCropH,
    scaleFactor
  }
}

export function blocksFromTranslateResult(
  result: TranslateRegionResult,
  image: Jimp,
  safeCropW: number,
  safeCropH: number,
  scaleFactor: number,
  overlayWidth: number,
  overlayHeight: number,
  config: ScreenTranslatorConfig,
  overlayStyle: OverlayStyle
): OverlayBlock[] {
  if (result.error) {
    return buildErrorBlock(overlayWidth, overlayHeight, result.error, overlayStyle)
  }

  if (result.seamless_image_base64) {
    const dataUrl = `data:image/png;base64,${result.seamless_image_base64}`
    return scaleBlocksToDip(
      buildSeamlessImageBlock(safeCropW, safeCropH, dataUrl),
      scaleFactor
    )
  }

  const displayText =
    config.show_original && result.original
      ? `${result.original}\n\n──\n${result.translated}`
      : result.translated

  let blocks =
    result.lines.length > 0
      ? buildOverlayBlocks(
        result.lines,
        result.translated,
        image,
        overlayStyle,
        displayText,
        safeCropW,
        safeCropH
      )
      : buildFullRegionBlock(safeCropW, safeCropH, displayText, image, overlayStyle)

  return scaleBlocksToDip(blocks, scaleFactor)
}
