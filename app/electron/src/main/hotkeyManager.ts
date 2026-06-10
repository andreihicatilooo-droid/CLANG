import { globalShortcut } from 'electron'
import type { HotkeyMode, ScreenTranslatorConfig } from '../shared/config'
import { getHotkeyBindings, hotkeyBindingToAccelerator } from '../shared/config'

let captureAccelerators: string[] = []

export function registerCaptureHotkey(
  config: ScreenTranslatorConfig,
  onTrigger: (mode?: HotkeyMode) => void
): void {
  unregisterCaptureHotkey()

  const seen = new Set<string>()
  for (const binding of getHotkeyBindings(config)) {
    const accelerator = hotkeyBindingToAccelerator(binding)
    if (seen.has(accelerator)) continue
    seen.add(accelerator)

    const ok = globalShortcut.register(accelerator, () => onTrigger(binding.mode))
    if (!ok) {
      console.warn(`[hotkey] Failed to register ${accelerator}`)
      continue
    }
    captureAccelerators.push(accelerator)
  }
}

export function unregisterCaptureHotkey(): void {
  for (const accelerator of captureAccelerators) {
    globalShortcut.unregister(accelerator)
  }
  captureAccelerators = []
}
