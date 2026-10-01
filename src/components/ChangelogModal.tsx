import React, { useState } from 'react';
import { X, History, FileText, Sparkles, Calendar, Tag } from 'lucide-react';
import changelogRaw from '../../CHANGELOG.md?raw';
import { APP_VERSION } from '../version';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose }) => {
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');

  if (!isOpen) return null;

  // Simple parsing of markdown into versions for formatted view
  const versionBlocks = changelogRaw
    .split(/##\s+\[(.*?)\]\s+—\s+(.*?)\n/)
    .slice(1);

  const parsedReleases = [];
  for (let i = 0; i < versionBlocks.length; i += 3) {
    parsedReleases.push({
      version: versionBlocks[i],
      date: versionBlocks[i + 1],
      content: versionBlocks[i + 2] || '',
    });
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-[#121218] border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-[#161620]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 border border-blue-500/30 rounded-xl text-blue-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  История изменений
                </h2>
                <span className="text-[10px] font-mono font-bold bg-blue-950 border border-blue-800 text-blue-300 px-2 py-0.5 rounded-full">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Хронология обновлений проекта с момента основания
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            title="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* View Switcher */}
        <div className="px-4 py-2 border-b border-slate-800/80 bg-[#14141B] flex items-center justify-between">
          <div className="flex items-center gap-1.5 bg-[#0D0D12] p-1 rounded-xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setViewMode('formatted')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'formatted'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Хронология</span>
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'raw'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Текст CHANGELOG.md</span>
            </button>
          </div>

          <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
            УТТиСТ Подменный Водитель
          </span>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-slate-300 text-xs sm:text-sm">
          {viewMode === 'formatted' ? (
            <div className="space-y-4">
              {parsedReleases.map((rel, idx) => (
                <div 
                  key={idx}
                  className="bg-[#171720] border border-slate-800 rounded-xl p-4 space-y-2.5 relative overflow-hidden"
                >
                  {/* Top release bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 bg-blue-950 border border-blue-700 font-mono font-bold text-blue-300 rounded-lg text-xs">
                        v{rel.version}
                      </span>
                      {idx === 0 && (
                        <span className="px-2 py-0.5 bg-emerald-950 border border-emerald-800 text-emerald-300 text-[10px] font-bold rounded-md">
                          Текущая версия
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-slate-400 font-mono text-[11px]">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>{rel.date}</span>
                    </div>
                  </div>

                  {/* Body lines */}
                  <div className="text-slate-300 space-y-1.5 leading-relaxed font-sans text-xs">
                    {rel.content
                      .trim()
                      .split('\n')
                      .filter((line) => line.trim().length > 0)
                      .map((line, lIdx) => {
                        const isSubHeader = line.startsWith('###');
                        const isBullet = line.startsWith('-');
                        const isSubBullet = line.startsWith('  -');

                        if (isSubHeader) {
                          return (
                            <h4 key={lIdx} className="font-bold text-white text-xs pt-1.5 text-blue-400">
                              {line.replace(/^###\s+/, '')}
                            </h4>
                          );
                        }

                        if (isBullet) {
                          const boldMatch = line.match(/^-\s+\*\*(.*?)\*\*:(.*)/);
                          if (boldMatch) {
                            return (
                              <div key={lIdx} className="font-semibold text-slate-200 pl-1 mt-1">
                                • <span className="text-white font-bold">{boldMatch[1]}:</span>
                                <span className="font-normal text-slate-300">{boldMatch[2]}</span>
                              </div>
                            );
                          }
                          return (
                            <div key={lIdx} className="pl-1 text-slate-300 font-medium">
                              • {line.replace(/^-\s+/, '')}
                            </div>
                          );
                        }

                        if (isSubBullet) {
                          return (
                            <div key={lIdx} className="pl-5 text-slate-400 text-[11px]">
                              – {line.replace(/^\s+-\s+/, '')}
                            </div>
                          );
                        }

                        return (
                          <p key={lIdx} className="text-slate-400 text-xs">
                            {line}
                          </p>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-[#171720] rounded-xl p-4 border border-slate-800 font-mono text-[11px] sm:text-xs whitespace-pre-wrap leading-relaxed text-slate-300 select-text">
              {changelogRaw}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-800 bg-[#161620] flex items-center justify-between">
          <span className="text-[11px] font-mono text-slate-500">
            CHANGELOG.md (корень проекта)
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
