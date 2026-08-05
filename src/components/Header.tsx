import React, { useState, useEffect } from 'react';
import { Plus, Smartphone } from 'lucide-react';

interface HeaderProps {
  onOpenAddModal: () => void;
  totalVehiclesCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenAddModal,
  totalVehiclesCount
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      if (isStandalone) {
        setIsInstalled(true);
      }
    };

    checkStandalone();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      alert(
        'Для установки приложения "Подмена" на экран устройства:\n\n' +
        '• На Android / Chrome: нажмите меню браузера (⋮) -> "Добавить на главный экран" или "Установить приложение".\n' +
        '• На iPhone / Safari: нажмите кнопку "Поделиться" (квадрат со стрелкой) -> "На экран Домой".'
      );
    }
  };

  return (
    <header className="bg-[#0A0A0D] border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
        {/* Logo & Title */}
        <div className="flex items-center space-x-2.5">
          <img
            src="/logo.png"
            alt="Подмена"
            className="w-9 h-9 object-contain shrink-0"
            referrerPolicy="no-referrer"
          />
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-white leading-tight">
              Подмена
            </h1>
            <p className="text-[10px] text-slate-400 hidden sm:block">
              Справочник подменного водителя
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {!isInstalled && (
            <button
              onClick={handleInstallClick}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shrink-0"
              title="Установить приложение Подмена"
            >
              <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Установить приложение</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
