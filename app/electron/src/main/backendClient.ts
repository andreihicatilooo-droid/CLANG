import type { ScreenTranslatorConfig } from '../shared/config'

const DEFAULT_PORT = 17890

export interface OcrLine {
  text: string
  x: number
  y: number
  w: number
  h: number
}

export interface TranslateRegionResult {
  translated: string
  original: string | null
  lines: OcrLine[]
  seamless_image_base64: string | null
  error: string | null
}

export interface OAuthPollResult {
  done: boolean
  success?: boolean
  message?: string
  authorized: boolean
}

let backendPort = DEFAULT_PORT

export function setBackendPort(port: number): void {
  backendPort = port
}

async function rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${backendPort}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() })
  })

  if (!res.ok) {
    throw new Error(`Backend HTTP ${res.status}`)
  }

  const body = (await res.json()) as {
    result?: T
    error?: { message: string }
  }

  if (body.error) {
    throw new Error(body.error.message)
  }

  return body.result as T
}

export async function waitForBackend(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError = 'Backend not reachable'

  while (Date.now() < deadline) {
    try {
      await rpc<{ status: string }>('health')
      return
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      await new Promise((r) => setTimeout(r, 400))
    }
  }

  throw new Error(lastError)
}

export async function getConfig(): Promise<ScreenTranslatorConfig> {
  return rpc<ScreenTranslatorConfig>('get_config')
}

export async function saveConfig(
  updates: Partial<ScreenTranslatorConfig>
): Promise<ScreenTranslatorConfig> {
  return rpc<ScreenTranslatorConfig>('save_config', { updates })
}

export async function getOcrLanguages(): Promise<string[]> {
  const res = await rpc<{ languages: string[] }>('get_ocr_languages')
  return res.languages
}

export async function translateRegion(imageBase64: string): Promise<TranslateRegionResult> {
  return rpc<TranslateRegionResult>('translate_region', { image_base64: imageBase64 })
}

export async function oauthStart(): Promise<{ started: boolean; message?: string }> {
  return rpc('oauth_start')
}

export async function oauthPoll(): Promise<OAuthPollResult> {
  return rpc('oauth_poll')
}

export async function oauthStatus(): Promise<{ authorized: boolean }> {
  return rpc('oauth_status')
}

export async function oauthLogout(): Promise<{ authorized: boolean }> {
  return rpc('oauth_logout')
}
