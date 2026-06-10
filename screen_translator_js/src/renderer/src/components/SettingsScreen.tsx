import React, { useState } from 'react';
import { Settings, Globe, Keyboard, History, Monitor } from 'lucide-react';

export default function SettingsScreen() {
  const [activeTab, setActiveTab] = useState('languages');

  return (
    <div className="flex h-screen bg-slate-900 text-slate-200">
      {/* Sidebar */}
      <div className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold flex items-center gap-2 text-slate-100">
            <Monitor className="w-6 h-6 text-blue-500" />
            Экранный Переводчик
          </h1>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          <button 
            onClick={() => setActiveTab('languages')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${activeTab === 'languages' ? 'bg-blue-900/50 text-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
            <Globe className="w-5 h-5" />
            Языки
          </button>
          <button 
            onClick={() => setActiveTab('hotkeys')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${activeTab === 'hotkeys' ? 'bg-blue-900/50 text-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
            <Keyboard className="w-5 h-5" />
            Горячие клавиши
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${activeTab === 'history' ? 'bg-blue-900/50 text-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
            <History className="w-5 h-5" />
            История
          </button>
          <button 
            onClick={() => setActiveTab('general')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${activeTab === 'general' ? 'bg-blue-900/50 text-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
            <Settings className="w-5 h-5" />
            Основные
          </button>
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 p-8 overflow-auto custom-scrollbar">
        <div className="max-w-2xl">
          {activeTab === 'languages' && (
            <div>
              <h2 className="text-2xl font-semibold mb-6 text-slate-100">Настройки языков</h2>
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 space-y-6 shadow-sm">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Язык текста (Распознавание)</label>
                  <select className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="eng">Английский (English)</option>
                    <option value="rus">Русский (Russian)</option>
                    <option value="jpn">Японский (Japanese)</option>
                    <option value="kor">Корейский (Korean)</option>
                  </select>
                  <p className="mt-1 text-sm text-slate-500">Язык текста, который находится на вашем экране.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Язык перевода</label>
                  <select className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="ru">Русский</option>
                    <option value="en">Английский</option>
                  </select>
                  <p className="mt-1 text-sm text-slate-500">На какой язык нужно перевести текст.</p>
                </div>

                <div className="pt-4 border-t border-slate-700">
                  <label className="block text-sm font-medium text-slate-300 mb-1">Сервис перевода</label>
                  <select className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option>Google Translate</option>
                    <option>DeepL (в разработке)</option>
                    <option>Yandex (в разработке)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'hotkeys' && (
            <div>
              <h2 className="text-2xl font-semibold mb-6 text-slate-100">Горячие клавиши</h2>
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 shadow-sm flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="block text-sm font-medium text-slate-300">Захват экрана</span>
                    <span className="text-xs text-slate-500">Выделить область — перевод появится прямо на экране</span>
                  </div>
                  <kbd className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-slate-300 font-mono text-sm">Ctrl + Shift + E</kbd>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <span className="block text-sm font-medium text-slate-300">Закрыть оверлей</span>
                    <span className="text-xs text-slate-500">Убрать перевод с экрана</span>
                  </div>
                  <kbd className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-slate-300 font-mono text-sm">Esc</kbd>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              <h2 className="text-2xl font-semibold mb-6 text-slate-100">История переводов</h2>
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 shadow-sm text-center text-slate-500">
                История пока пуста. Сделайте свой первый перевод!
              </div>
            </div>
          )}

          {activeTab === 'general' && (
            <div>
              <h2 className="text-2xl font-semibold mb-6 text-slate-100">Основные настройки</h2>
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 shadow-sm">
                 <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500" defaultChecked />
                    <span className="text-sm font-medium text-slate-300">Запускать вместе с Windows</span>
                 </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
