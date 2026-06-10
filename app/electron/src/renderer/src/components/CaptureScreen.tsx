import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

interface PreviewState {
  loading: boolean
  translated: string
  error: string | null
}

const MIN_PREVIEW_SIZE = 24

export default function CaptureScreen() {
  const [searchParams] = useSearchParams()
  const offsetX = Number(searchParams.get('ox') ?? 0)
  const offsetY = Number(searchParams.get('oy') ?? 0)
  const livePreviewEnabled = searchParams.get('lp') !== '0'
  const livePreviewDebounceMs = Math.min(
    2000,
    Math.max(300, Number(searchParams.get('lpd') ?? 750))
  )
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null)
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const previewSeqRef = useRef(0)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.electron.ipcRenderer.send('close-capture')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!livePreviewEnabled) return

    const handler = (
      _event: unknown,
      data: {
        seq?: number
        loading?: boolean
        translated?: string
        error?: string | null
      }
    ): void => {
      if (data.seq !== previewSeqRef.current) return
      if (data.loading) {
        setPreview({ loading: true, translated: '', error: null })
        return
      }
      setPreview({
        loading: false,
        translated: data.translated ?? '',
        error: data.error ?? null
      })
    }

    window.electron.ipcRenderer.on('preview-result', handler)
    return () => {
      window.electron.ipcRenderer.removeListener('preview-result', handler)
    }
  }, [livePreviewEnabled])

  const selectionRect = useCallback(() => {
    if (!startPos || !currentPos) return null
    const x = Math.min(startPos.x, currentPos.x)
    const y = Math.min(startPos.y, currentPos.y)
    const width = Math.abs(currentPos.x - startPos.x)
    const height = Math.abs(currentPos.y - startPos.y)
    return { x, y, width, height }
  }, [startPos, currentPos])

  useEffect(() => {
    if (!livePreviewEnabled) {
      setPreview(null)
      return
    }

    const rect = selectionRect()
    if (!rect || rect.width < MIN_PREVIEW_SIZE || rect.height < MIN_PREVIEW_SIZE) {
      setPreview(null)
      return
    }

    const seq = ++previewSeqRef.current
    const timer = window.setTimeout(() => {
      window.electron.ipcRenderer.send('preview-region', {
        x: offsetX + rect.x,
        y: offsetY + rect.y,
        width: rect.width,
        height: rect.height,
        seq
      })
    }, livePreviewDebounceMs)

    return () => window.clearTimeout(timer)
  }, [selectionRect, offsetX, offsetY, livePreviewEnabled, livePreviewDebounceMs])

  const handleMouseDown = (e: React.MouseEvent) => {
    previewSeqRef.current += 1
    setPreview(null)
    setStartPos({ x: e.clientX, y: e.clientY })
    setCurrentPos({ x: e.clientX, y: e.clientY })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!startPos) return
    setCurrentPos({ x: e.clientX, y: e.clientY })
  }

  const handleMouseUp = () => {
    if (!startPos || !currentPos) return

    const x = Math.min(startPos.x, currentPos.x)
    const y = Math.min(startPos.y, currentPos.y)
    const width = Math.abs(currentPos.x - startPos.x)
    const height = Math.abs(currentPos.y - startPos.y)

    if (width > 10 && height > 10) {
      window.electron.ipcRenderer.send('process-region', {
        x: offsetX + x,
        y: offsetY + y,
        width,
        height
      })
    } else {
      window.electron.ipcRenderer.send('close-capture')
    }

    setStartPos(null)
    setCurrentPos(null)
    setPreview(null)
  }

  const rect = selectionRect()

  return (
    <div
      className="capture-root absolute inset-0 w-full h-full bg-black/10 cursor-crosshair"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {rect && (
        <div
          className="capture-selection absolute border border-[#D1536D] bg-[#D1536D]/20 pointer-events-none overflow-hidden flex flex-col"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height
          }}
        >
          {livePreviewEnabled && preview?.loading && (
            <div className="capture-preview-status capture-preview-loading">Перевод…</div>
          )}
          {livePreviewEnabled && !preview?.loading && preview?.error && (
            <div className="capture-preview-status capture-preview-error">{preview.error}</div>
          )}
          {livePreviewEnabled && !preview?.loading && preview?.translated && !preview.error && (
            <div className="capture-preview-text">{preview.translated}</div>
          )}
        </div>
      )}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-900/80 backdrop-blur-md text-white px-4 py-2 rounded-full shadow-lg text-sm pointer-events-none select-none">
        {livePreviewEnabled
          ? 'Выделите область — перевод появится онлайн (ESC — отмена)'
          : 'Выделите область для перевода (ESC — отмена)'}
      </div>
    </div>
  )
}
