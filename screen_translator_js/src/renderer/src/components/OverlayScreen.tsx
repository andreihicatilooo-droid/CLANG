import React, { useEffect, useState } from 'react'

interface OverlayBlock {
  x: number
  y: number
  w: number
  h: number
  text: string
  bgColor: string
  textColor: string
  fontSize: number
}

export default function OverlayScreen(): React.JSX.Element {
  const [blocks, setBlocks] = useState<OverlayBlock[]>([])
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onData = (_event: unknown, data: { blocks: OverlayBlock[] }): void => {
      setVisible(false)
      setBlocks(data.blocks)
      requestAnimationFrame(() => setVisible(true))
    }

    window.electron.ipcRenderer.on('overlay-data', onData)
    return () => {
      window.electron.ipcRenderer.removeListener('overlay-data', onData)
    }
  }, [])

  return (
    <div className="overlay-canvas">
      {blocks.map((block, index) => (
        <div
          key={`${block.x}-${block.y}-${index}`}
          className="overlay-block"
          style={{
            left: block.x,
            top: block.y,
            width: block.w,
            height: block.h,
            backgroundColor: block.bgColor,
            color: block.textColor,
            fontSize: block.fontSize,
            opacity: visible ? 1 : 0
          }}
        >
          {block.text}
        </div>
      ))}
    </div>
  )
}
