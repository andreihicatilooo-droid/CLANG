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
  fontWeight?: number
  textShadow?: string
  imageUrl?: string
  layout?: 'flow' | 'center'
}

export default function OverlayScreen(): React.JSX.Element {
  const [blocks, setBlocks] = useState<OverlayBlock[]>([])
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onData = (_event: unknown, data: { blocks: OverlayBlock[] }): void => {
      setBlocks(data.blocks)
      setVisible(true)
    }

    window.electron.ipcRenderer.on('overlay-data', onData)
    window.electron.ipcRenderer.send('overlay-ready')
    return () => {
      window.electron.ipcRenderer.removeListener('overlay-data', onData)
    }
  }, [])

  return (
    <div className="overlay-root">
      <div className="overlay-canvas">
        {blocks.map((block, index) =>
          block.imageUrl ? (
            <img
              key={`img-${index}`}
              src={block.imageUrl}
              alt=""
              className="overlay-block overlay-image"
              style={{
                left: block.x,
                top: block.y,
                width: block.w,
                height: block.h,
                opacity: visible ? 1 : 0
              }}
            />
          ) : (
            <div
              key={`${block.x}-${block.y}-${index}`}
              className={
                block.layout === 'flow' ? 'overlay-block overlay-block--flow' : 'overlay-block'
              }
              style={{
                left: block.x,
                top: block.y,
                width: block.w,
                height: block.h,
                backgroundColor: block.bgColor,
                color: block.textColor,
                fontSize: block.fontSize,
                fontWeight: block.fontWeight ?? 500,
                textShadow: block.textShadow,
                opacity: visible ? 1 : 0
              }}
            >
              {block.text}
            </div>
          )
        )}
      </div>
    </div>
  )
}
