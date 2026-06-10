import React, { useEffect, useState } from 'react';
import { Loader2, Languages, Copy, Check } from 'lucide-react';

export default function ResultScreen() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{original?: string, translated?: string, error?: string} | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.electron.ipcRenderer.on('translation-loading', () => {
      setLoading(true);
      setData(null);
      setCopied(false);
    });

    window.electron.ipcRenderer.on('translation-result', (_event, result) => {
      setLoading(false);
      setData(result);
    });
  }, []);

  const handleCopy = () => {
    if (data?.translated) {
      navigator.clipboard.writeText(data.translated);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-900/90 text-white overflow-hidden p-4 rounded-xl border border-slate-700 shadow-2xl backdrop-blur-xl">
      
      {/* Drag handle */}
      <div className="absolute top-0 left-0 w-full h-6 cursor-move style-app-region-drag" />

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <span className="text-sm font-medium text-slate-300">Переводим...</span>
        </div>
      ) : data?.error ? (
        <div className="flex-1 flex flex-col items-center justify-center text-red-400 text-sm text-center px-2">
          {data.error === 'No text detected in this area.' ? 'В этой области текст не найден.' : data.error}
        </div>
      ) : (
        <div className="flex flex-col h-full mt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold uppercase tracking-wider">
              <Languages className="w-4 h-4" />
              Перевод
            </div>
            <button 
              onClick={handleCopy}
              className="p-1.5 hover:bg-slate-800 rounded-md transition-colors text-slate-400 hover:text-white"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          
          <div className="flex-1 overflow-auto custom-scrollbar">
            <p className="text-base text-slate-100 leading-relaxed font-medium mb-3">
              {data?.translated}
            </p>
            <div className="w-full h-px bg-slate-800 my-3" />
            <p className="text-xs text-slate-500 leading-relaxed font-mono">
              {data?.original}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
