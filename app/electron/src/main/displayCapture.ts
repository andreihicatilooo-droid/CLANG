import { screen, type Display } from 'electron'
import screenshot from 'screenshot-desktop'

export interface VirtualBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface RegionSelection {
  /** DIP coords relative to virtual desktop origin */
  globalX: number
  globalY: number
  width: number
  height: number
  display: Display
}

export interface CapturedRegion {
  imageBuffer: Buffer
  cropX: number
  cropY: number
  cropW: number
  cropH: number
  scaleFactor: number
}

interface ScreenshotDisplay {
  id: string
  left: number
  top: number
  width: number
  height: number
  dpiScale: number
}

export function getVirtualDesktopBounds(): VirtualBounds {
  const displays = screen.getAllDisplays()
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const display of displays) {
    minX = Math.min(minX, display.bounds.x)
    minY = Math.min(minY, display.bounds.y)
    maxX = Math.max(maxX, display.bounds.x + display.bounds.width)
    maxY = Math.max(maxY, display.bounds.y + display.bounds.height)
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function resolveRegionSelection(
  virtualBounds: VirtualBounds,
  x: number,
  y: number,
  width: number,
  height: number
): RegionSelection {
  const globalX = virtualBounds.x + x
  const globalY = virtualBounds.y + y
  const display = screen.getDisplayNearestPoint({
    x: globalX + width / 2,
    y: globalY + height / 2
  })

  return { globalX, globalY, width, height, display }
}

async function listScreenshotDisplays(): Promise<ScreenshotDisplay[]> {
  const listFn = (
    screenshot as unknown as { listDisplays?: () => Promise<ScreenshotDisplay[]> }
  ).listDisplays
  if (!listFn) {
    throw new Error('screenshot-desktop listDisplays is unavailable')
  }
  return listFn()
}

const MATCH_TOLERANCE_PX = 4

function sortElectronDisplays(displays: Display[]): Display[] {
  return [...displays].sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
}

function sortScreenshotDisplays(displays: ScreenshotDisplay[]): ScreenshotDisplay[] {
  return [...displays].sort((a, b) => a.left - b.left || a.top - b.top)
}

export function matchScreenshotDisplay(
  display: Display,
  shotDisplays: ScreenshotDisplay[]
): ScreenshotDisplay {
  if (shotDisplays.length === 0) {
    throw new Error('No displays reported by screenshot-desktop')
  }

  const targetLeft = Math.round(display.bounds.x * display.scaleFactor)
  const targetTop = Math.round(display.bounds.y * display.scaleFactor)
  const targetW = Math.round(display.bounds.width * display.scaleFactor)
  const targetH = Math.round(display.bounds.height * display.scaleFactor)

  const within = (value: number, target: number): boolean =>
    Math.abs(value - target) <= MATCH_TOLERANCE_PX

  const exact = shotDisplays.find(
    (d) =>
      within(d.left, targetLeft) &&
      within(d.top, targetTop) &&
      within(d.width, targetW) &&
      within(d.height, targetH)
  )
  if (exact) return exact

  const byPosition = shotDisplays.find(
    (d) => within(d.left, targetLeft) && within(d.top, targetTop)
  )
  if (byPosition) return byPosition

  const bySize = shotDisplays.filter(
    (d) => within(d.width, targetW) && within(d.height, targetH)
  )
  if (bySize.length === 1) return bySize[0]

  const electronDisplays = sortElectronDisplays(screen.getAllDisplays())
  const sortedShots = sortScreenshotDisplays(shotDisplays)
  const displayIndex = electronDisplays.findIndex((d) => d.id === display.id)
  if (displayIndex >= 0 && displayIndex < sortedShots.length) {
    return sortedShots[displayIndex]
  }

  throw new Error(
    `Cannot match Electron display ${display.id} (${targetLeft},${targetTop} ${targetW}x${targetH})`
  )
}

export async function captureDisplayRegion(region: RegionSelection): Promise<CapturedRegion> {
  const { display, globalX, globalY, width, height } = region
  const shotDisplays = await listScreenshotDisplays()
  const shotDisplay = matchScreenshotDisplay(display, shotDisplays)

  const imageBuffer = (await screenshot({ screen: shotDisplay.id })) as Buffer
  const scaleFactor = display.scaleFactor

  const localX = globalX - display.bounds.x
  const localY = globalY - display.bounds.y

  const cropX = Math.max(0, Math.round(localX * scaleFactor))
  const cropY = Math.max(0, Math.round(localY * scaleFactor))
  const cropW = Math.round(width * scaleFactor)
  const cropH = Math.round(height * scaleFactor)

  return { imageBuffer, cropX, cropY, cropW, cropH, scaleFactor }
}
