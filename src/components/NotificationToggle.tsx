import React, { useState, useEffect } from 'react';
import { Bell, BellOff, BellRing, CheckCircle2, AlertCircle, Sparkles, Send, Clock, ShieldCheck, X } from 'lucide-react';
import {
  NotificationSettings,
  getNotificationSettings,
  saveNotificationSettings,
  getNotificationPermissionState,
  requestNotificationPermission,
  sendSystemNotification,
  playNotificationSound,
  extractVehicleTimePoints,
  checkVehicleNotifications,
  ParsedTimePoint
} from '../lib/notifications';
import { Vehicle } from '../types';
import { getSavedShiftForVehicle, getStoredVehicles, getLastVehicleId } from '../lib/storage';

interface NotificationToggleProps {
  selectedVehicle: Vehicle | null;
  activeShift?: '1' | '2';
}

export const NotificationToggle: React.FC<NotificationToggleProps> = ({ selectedVehicle, activeShift }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>(getNotificationSettings());
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    getNotificationPermissionState()
  );
  const [testSent, setTestSent] = useState(false);
  const [upcomingPoint, setUpcomingPoint] = useState<{ point: ParsedTimePoint; minLeft: number } | null>(null);

  // Refresh permission & settings state on mount & periodically / on event
  useEffect(() => {
    const syncState = () => {
      setPermission(getNotificationPermissionState());
      setSettings(getNotificationSettings());
    };
    syncState();

    window.addEventListener('storage', syncState);
    window.addEventListener('notification_settings_changed', syncState);
    window.addEventListener('vehicle_shift_changed', syncState);
    return () => {
      window.removeEventListener('storage', syncState);
      window.removeEventListener('notification_settings_changed', syncState);
      window.removeEventListener('vehicle_shift_changed', syncState);
    };
  }, []);

  // Check upcoming points & auto-disable if return time / last point passed
  useEffect(() => {
    // Resolve target vehicle (selected or last stored)
    let targetVehicle = selectedVehicle;
    if (!targetVehicle && typeof window !== 'undefined') {
      const vehicles = getStoredVehicles();
      const lastId = getLastVehicleId();
      if (lastId) {
        targetVehicle = vehicles.find((v) => v.id === lastId) || vehicles[0] || null;
      } else if (vehicles.length > 0) {
        targetVehicle = vehicles[0];
      }
    }

    if (!targetVehicle) {
      setUpcomingPoint(null);
      return;
    }

    const checkUpcoming = () => {
      const currentSettings = getNotificationSettings();
      const effectiveShift =
        activeShift ||
        (targetVehicle.shiftType === '2-сменка'
          ? getSavedShiftForVehicle(targetVehicle.id)
          : undefined);

      const res = checkVehicleNotifications(targetVehicle, currentSettings, effectiveShift);

      if (res.upcomingPoint && res.minutesLeft !== undefined) {
        setUpcomingPoint({ point: res.upcomingPoint, minLeft: res.minutesLeft });
      } else {
        const points = extractVehicleTimePoints(targetVehicle, effectiveShift);
        if (points.length > 0) {
          const now = new Date();
          const currentMin = now.getHours() * 60 + now.getMinutes();
          const firstPoint = points[0];
          const lastPoint = points[points.length - 1];
          const depMins = firstPoint.minutesFromMidnight;
          const retMins = lastPoint.minutesFromMidnight;
          const isOvernight = retMins > 1440 || depMins > 1000;
          let effNow = currentMin;
          if (isOvernight) {
            const retMinsDay = retMins > 1440 ? retMins - 1440 : retMins;
            if (currentMin < depMins - 180 && currentMin <= retMinsDay + 180) {
              effNow = currentMin + 1440;
            }
          }

          let found: { point: ParsedTimePoint; minLeft: number } | null = null;
          for (const p of points) {
            const diff = p.minutesFromMidnight - effNow;
            if (diff >= 0) {
              if (!found || diff < found.minLeft) {
                found = { point: p, minLeft: diff };
              }
            }
          }
          setUpcomingPoint(found);
        } else {
          setUpcomingPoint(null);
        }
      }
    };

    checkUpcoming();
    const interval = setInterval(checkUpcoming, 1000); // refresh every 1 second for live real-time countdown

    const handleShiftChange = () => checkUpcoming();
    window.addEventListener('vehicle_shift_changed', handleShiftChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('vehicle_shift_changed', handleShiftChange);
    };
  }, [selectedVehicle, activeShift]);

  const handleToggle = async () => {
    if (!settings.enabled) {
      // Trying to enable
      let perm = permission;
      if (perm !== 'granted') {
        const granted = await requestNotificationPermission();
        perm = getNotificationPermissionState();
        setPermission(perm);
        if (!granted) {
          alert(
            'Для получения уведомлений необходимо разрешить их в всплывающем окне браузера или в настройках браузера/сайта.'
          );
          return;
        }
      }
      const next = { ...settings, enabled: true };
      setSettings(next);
      saveNotificationSettings(next);
    } else {
      const next = { ...settings, enabled: false };
      setSettings(next);
      saveNotificationSettings(next);
    }
  };

  const handleSendTest = async () => {
    let perm = permission;
    if (perm !== 'granted') {
      const granted = await requestNotificationPermission();
      perm = getNotificationPermissionState();
      setPermission(perm);
      if (!granted) {
        alert('Разрешение на уведомления не получено.');
        return;
      }
    }

    let title = 'Подмена - через 15 минут';
    let body = 'В 18:00 : передать показания';

    if (selectedVehicle) {
      const points = extractVehicleTimePoints(selectedVehicle, activeShift);
      const samplePoint = upcomingPoint?.point || points[0];
      const minLeft = upcomingPoint?.minLeft || 15;

      title = `${selectedVehicle.garageNumber} - через ${minLeft} минут`;
      if (samplePoint) {
        body = `В ${samplePoint.timeStr} : ${samplePoint.label}`;
      } else {
        body = `В ${selectedVehicle.departureTime || '06:00'} : Выезд из АТП`;
      }
    }

    const success = await sendSystemNotification(title, body);
    playNotificationSound();

    if (success) {
      setTestSent(true);
      setTimeout(() => setTestSent(false), 4000);
    } else {
      alert(
        'Не удалось отправить системное уведомление. Проверьте настройки уведомлений в браузере или операционной системе.'
      );
    }
  };

  const isEnabledAndGranted = settings.enabled && permission === 'granted';

  return (
    <div className="relative">
      {/* Trigger Button in Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm shrink-0 ${
          isEnabledAndGranted
            ? 'bg-emerald-950/90 hover:bg-emerald-900 border-emerald-500 text-emerald-200 shadow-emerald-900/40 ring-1 ring-emerald-500/50'
            : 'bg-blue-950/80 hover:bg-blue-900 border-blue-600 text-blue-200 shadow-blue-950/40'
        }`}
        title="Настройки уведомлений за 15 минут до выезда"
      >
        <div className="relative">
          {isEnabledAndGranted ? (
            <BellRing className="w-4 h-4 text-emerald-400 animate-pulse" />
          ) : (
            <Bell className="w-4 h-4 text-blue-400" />
          )}
          {isEnabledAndGranted && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full ring-2 ring-[#0A0A0D]" />
          )}
        </div>
        <span className="whitespace-nowrap">
          {isEnabledAndGranted ? 'Уведомления: Вкл' : 'Уведомления'}
        </span>
      </button>

      {/* Popover / Modal Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop on mobile */}
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs sm:hidden"
            onClick={() => setIsOpen(false)}
          />

          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] max-w-md sm:absolute sm:top-full sm:left-auto sm:right-0 sm:translate-x-0 sm:translate-y-0 sm:mt-2 sm:w-96 max-h-[90vh] overflow-y-auto bg-[#121218] border border-slate-700 rounded-2xl shadow-2xl z-50 p-4 text-slate-100 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-950 text-blue-400 rounded-xl border border-blue-800">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Уведомления на часы и телефон</h3>
                  <p className="text-[11px] text-slate-400">За 15 минут до точки сбора или выезда</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Toggle Switch Box */}
            <div className="bg-[#181822] border border-slate-800 rounded-xl p-3 flex items-center justify-between mb-3">
              <div>
                <span className="text-xs font-bold text-white block">Напоминания за 15 минут</span>
                <span className="text-[11px] text-slate-400 block">
                  {settings.enabled ? 'Включены для выезда и точек' : 'Выключены'}
                </span>
              </div>
              <button
                onClick={handleToggle}
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 border ${
                  settings.enabled
                    ? 'bg-emerald-600 border-emerald-500'
                    : 'bg-slate-800 border-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform transform ${
                    settings.enabled ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Permission Status */}
            <div className="mb-3 text-xs">
              {permission === 'granted' ? (
                <div className="flex items-center gap-2 p-2 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Разрешение браузера получено. Уведомления разрешены.</span>
                </div>
              ) : permission === 'denied' ? (
                <div className="flex items-start gap-2 p-2 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-300">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Уведомления заблокированы браузером.</span>
                    <span className="text-[11px] text-rose-200">
                      Нажмите на замочек или иконку настроек возле URL сайта в строке браузера и разрешите «Уведомления».
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-2 bg-amber-950/60 border border-amber-800/80 rounded-xl text-amber-300 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Требуется подтверждение браузера</span>
                  </div>
                  <button
                    onClick={async () => {
                      const granted = await requestNotificationPermission();
                      setPermission(getNotificationPermissionState());
                      if (granted) {
                        const next = { ...settings, enabled: true };
                        setSettings(next);
                        saveNotificationSettings(next);
                      }
                    }}
                    className="w-full py-1 px-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-lg transition-colors"
                  >
                    Запросить разрешение
                  </button>
                </div>
              )}
            </div>

            {/* Selected Vehicle Tracking info */}
            <div className="bg-[#181822] border border-slate-800 rounded-xl p-3 mb-3 text-xs">
              <span className="text-slate-400 font-medium block text-[11px] uppercase tracking-wider mb-1">
                Отслеживаемый автомобиль:
              </span>
              {selectedVehicle ? (
                <div>
                  <div className="flex items-center gap-2 font-bold text-white">
                    <span className="px-1.5 py-0.5 bg-blue-600 rounded text-xs font-mono">
                      {selectedVehicle.garageNumber}
                    </span>
                    <span>{selectedVehicle.brandModel}</span>
                  </div>
                  {upcomingPoint ? (
                    <div className="mt-2 p-2 bg-blue-950/50 border border-blue-800/80 rounded-lg text-blue-200 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-400 shrink-0" />
                      <div>
                        <span className="font-bold block">
                          Следующая точка: {upcomingPoint.point.timeStr}
                        </span>
                        <span className="text-[11px] text-blue-300">
                          {upcomingPoint.point.label} (через {upcomingPoint.minLeft} мин)
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-1">
                      На сегодня все точки пройдены или не указано время.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-slate-400 italic">
                  Выберите автомобиль в поиске или списке, чтобы получать по нему уведомления.
                </p>
              )}
            </div>

            {/* Test Notification Button */}
            <button
              onClick={handleSendTest}
              className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-600/30"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{testSent ? '✓ Уведомление отправлено!' : 'Проверить уведомление (Тест)'}</span>
            </button>

            <p className="text-[10px] text-slate-500 mt-2 text-center">
              Уведомления приходят в панель управления устройства и дублируются на подключенные смарт-часы.
            </p>
          </div>
        </>
      )}
    </div>
  );
};
