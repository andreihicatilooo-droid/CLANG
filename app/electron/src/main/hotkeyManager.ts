import { globalShortcut } from 'electron'
import type { ScreenTranslatorConfig } from '../shared/config'
import { hotkeyToAccelerator } from '../shared/config'

let captureAccelerator: string | null = null

export function registerCaptureHotkey(
  config: ScreenTranslatorConfig,
  onTrigger: () => void
): void {
  unregisterCaptureHotkey()

  const accelerator = hotkeyToAccelerator(config)
  const ok = globalShortcut.register(accelerator, onTrigger)
  if (!ok) {
    console.warn(`[hotkey] Failed to register ${accelerator}`)
    return
  }
  captureAccelerator = accelerator
}

export function unregisterCaptureHotkey(): void {
  if (captureAccelerator) {
    globalShortcut.unregister(captureAccelerator)
    captureAccelerator = null
  }
}
