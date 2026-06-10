import React, { useState, useEffect } from 'react';

export default function CaptureScreen() {
  const [startPos, setStartPos] = useState<{x: number, y: number} | null>(null);
  const [currentPos, setCurrentPos] = useState<{x: number, y: number} | null>(null);

  useEffect(() => {
    // Add escape key listener to close capture
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.electron.ipcRenderer.send('close-capture');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setStartPos({ x: e.clientX, y: e.clientY });
    setCurrentPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!startPos) return;
    setCurrentPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    if (!startPos || !currentPos) return;
    
    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);
    const width = Math.abs(currentPos.x - startPos.x);
    const height = Math.abs(currentPos.y - startPos.y);

    if (width > 10 && height > 10) {
      window.electron.ipcRenderer.send('process-region', { x, y, width, height });
    } else {
      window.electron.ipcRenderer.send('close-capture');
    }
    
    // reset
    setStartPos(null);
    setCurrentPos(null);
  };

  return (
    <div 
      className="w-screen h-screen bg-black/10 cursor-crosshair fixed top-0 left-0"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {startPos && currentPos && (
        <div 
          className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none"
          style={{
            left: Math.min(startPos.x, currentPos.x),
            top: Math.min(startPos.y, currentPos.y),
            width: Math.abs(currentPos.x - startPos.x),
            height: Math.abs(currentPos.y - startPos.y)
          }}
        />
      )}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-900/80 backdrop-blur-md text-white px-4 py-2 rounded-full shadow-lg text-sm pointer-events-none select-none">
        Выделите область текста (ESC для отмены)
      </div>
    </div>
  );
}
