import React, { useState } from 'react';
import { Search } from 'lucide-react';

interface SearchPadProps {
  searchTerm: string;
  onSearchChange: (val: string) => void;
}

export const SearchPad: React.FC<SearchPadProps> = ({
  searchTerm,
  onSearchChange
}) => {
  const [showNumpad, setShowNumpad] = useState(false);

  const handleInputFocusOrClick = () => {
    if (searchTerm) {
      onSearchChange('');
    }
    setShowNumpad(true);
  };

  const handleInputChange = (val: string) => {
    onSearchChange(val);
    if (val.length >= 4) {
      setShowNumpad(false);
    }
  };

  const handleNumpadClick = (digit: string) => {
    const nextVal = searchTerm + digit;
    onSearchChange(nextVal);
    if (nextVal.length >= 4) {
      setShowNumpad(false);
    }
  };

  const handleNumpadClear = () => {
    onSearchChange('');
  };

  const handleNumpadBackspace = () => {
    onSearchChange(searchTerm.slice(0, -1));
  };

  return (
    <div className="bg-[#0F0F12] rounded-2xl border border-slate-800 p-4 mb-5 text-slate-100 shadow-xl">
      {/* Search Input Bar */}
      <div className="space-y-2.5">
        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
          🔍 Поиск машины (Гаражный номер или Госномер):
        </label>
        <div className="relative flex items-center">
          <Search className="w-5 h-5 absolute left-3.5 text-blue-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={handleInputFocusOrClick}
            onClick={handleInputFocusOrClick}
            inputMode="none"
            placeholder="Введите гаражный номер..."
            className="w-full pl-11 pr-12 py-2.5 bg-[#16161D] border border-slate-700/80 rounded-xl text-base font-bold text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono shadow-inner cursor-pointer"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                setShowNumpad(true);
              }}
              className="absolute right-3 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold"
              title="Очистить"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Numeric Touchpad */}
      {showNumpad && (
        <div className="mt-3 p-3 bg-[#08080A] rounded-xl text-white max-w-xs mx-auto border border-slate-800 animate-fadeIn shadow-2xl">
          <div className="flex items-center justify-end mb-2 px-1">
            <button
              type="button"
              onClick={() => setShowNumpad(false)}
              className="text-xs text-slate-400 hover:text-white px-2.5 py-0.5 rounded-md bg-slate-800/80 border border-slate-700"
            >
              Скрыть
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((btn) => (
              <button
                type="button"
                key={btn}
                onClick={() => {
                  if (btn === 'C') handleNumpadClear();
                  else if (btn === '⌫') handleNumpadBackspace();
                  else handleNumpadClick(btn);
                }}
                className={`py-2.5 rounded-xl text-base font-bold font-mono transition-transform active:scale-95 ${
                  btn === 'C'
                    ? 'bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800'
                    : btn === '⌫'
                    ? 'bg-amber-950 hover:bg-amber-900 text-amber-200 border border-amber-800'
                    : 'bg-[#16161D] hover:bg-[#22222E] text-white border border-slate-800'
                }`}
              >
                {btn}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

