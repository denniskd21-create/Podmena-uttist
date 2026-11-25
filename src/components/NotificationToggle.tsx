import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  BellRing,
  CheckCircle2,
  AlertCircle,
  Send,
  Clock,
  ShieldCheck,
  X,
  Lock,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Wifi
} from 'lucide-react';
import {
  NotificationSettings,
  getNotificationSettings,
  saveNotificationSettings,
  getNotificationPermissionState,
  requestNotificationPermission,
  sendSystemNotification,
  playNotificationSound,
  extractVehicleTimePoints,
  formatPointCountdown,
  getPointTargetTimestamp,
  updateNotificationSchedule,
  ensurePushSubscription,
  sendImmediateServerPushTest,
  sendDelayedServerPushTest,
  fetchPushDiagnostics,
  PushDiagnostics,
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
  const [statusMessage, setStatusMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [testSent, setTestSent] = useState(false);
  const [isTestingNow, setIsTestingNow] = useState(false);
  const [delayedCountdown, setDelayedCountdown] = useState<number | null>(null);
  const [pushDiag, setPushDiag] = useState<PushDiagnostics | null>(null);
  const [isConnectingPush, setIsConnectingPush] = useState(false);
  const [showCronGuide, setShowCronGuide] = useState(false);
  const [copiedCronUrl, setCopiedCronUrl] = useState(false);
  const [upcomingPoint, setUpcomingPoint] = useState<{
    point: ParsedTimePoint;
    minLeft: number;
    diffSeconds?: number;
  } | null>(null);

  const refreshDiagnostics = useCallback(async () => {
    const diag = await fetchPushDiagnostics();
    setPushDiag(diag);
  }, []);

  // Refresh permission & settings state on mount & on events
  useEffect(() => {
    const syncState = () => {
      setPermission(getNotificationPermissionState());
      setSettings(getNotificationSettings());
    };
    syncState();

    window.addEventListener('storage', syncState);
    window.addEventListener('notification_settings_changed', syncState);
    window.addEventListener('vehicle_shift_changed', syncState);
    window.addEventListener('podmena_push_synced', refreshDiagnostics);
    return () => {
      window.removeEventListener('storage', syncState);
      window.removeEventListener('notification_settings_changed', syncState);
      window.removeEventListener('vehicle_shift_changed', syncState);
      window.removeEventListener('podmena_push_synced', refreshDiagnostics);
    };
  }, [refreshDiagnostics]);

  // Refresh diagnostics when modal opens
  useEffect(() => {
    if (isOpen) {
      refreshDiagnostics();
    }
  }, [isOpen, refreshDiagnostics]);

  // Countdown for delayed lock-screen test
  useEffect(() => {
    if (delayedCountdown === null) return;
    if (delayedCountdown <= 0) {
      setDelayedCountdown(null);
      return;
    }
    const timer = setTimeout(() => {
      setDelayedCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [delayedCountdown]);

  // Check upcoming points
  useEffect(() => {
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
      const effectiveShift =
        activeShift ||
        (targetVehicle!.shiftType === '2-сменка'
          ? getSavedShiftForVehicle(targetVehicle!.id)
          : undefined);

      const points = extractVehicleTimePoints(targetVehicle!, effectiveShift);
      if (points.length === 0) {
        setUpcomingPoint(null);
        return;
      }

      const depMins = points[0].minutesFromMidnight;
      const retMins = points[points.length - 1].minutesFromMidnight;
      const now = new Date();

      let found: { point: ParsedTimePoint; minLeft: number; diffSeconds: number } | null = null;

      for (const p of points) {
        const targetTs = getPointTargetTimestamp(now, p.minutesFromMidnight, depMins, retMins);
        const diffSecs = Math.floor((targetTs - now.getTime()) / 1000);

        if (diffSecs > 0) {
          const diffMins = Math.ceil(diffSecs / 60);
          if (!found || diffSecs < found.diffSeconds) {
            found = { point: p, minLeft: diffMins, diffSeconds: diffSecs };
          }
        }
      }

      setUpcomingPoint(found);
    };

    checkUpcoming();
    const interval = setInterval(checkUpcoming, 1000);

    window.addEventListener('podmena_second_tick', checkUpcoming);
    window.addEventListener('podmena_notification_fired', checkUpcoming);
    window.addEventListener('podmena_schedule_updated', checkUpcoming);
    window.addEventListener('vehicle_shift_changed', checkUpcoming);

    return () => {
      clearInterval(interval);
      window.removeEventListener('podmena_second_tick', checkUpcoming);
      window.removeEventListener('podmena_notification_fired', checkUpcoming);
      window.removeEventListener('podmena_schedule_updated', checkUpcoming);
      window.removeEventListener('vehicle_shift_changed', checkUpcoming);
    };
  }, [selectedVehicle, activeShift]);

  const handleConnectPush = async () => {
    setStatusMessage(null);
    setIsConnectingPush(true);
    try {
      let perm = permission;
      if (perm !== 'granted') {
        const granted = await requestNotificationPermission();
        perm = getNotificationPermissionState();
        setPermission(perm);
        if (!granted) {
          setStatusMessage({
            type: 'err',
            text: 'Разрешите уведомления во всплывающем окне или в настройках Chrome для этого сайта.'
          });
          return;
        }
      }

      const { subscription, error } = await ensurePushSubscription();
      if (!subscription) {
        setStatusMessage({
          type: 'err',
          text: error || 'Не удалось подключить фоновый Push.'
        });
        return;
      }

      const next = { ...settings, enabled: true };
      setSettings(next);
      saveNotificationSettings(next);
      updateNotificationSchedule(getStoredVehicles(), selectedVehicle?.id);
      setTimeout(refreshDiagnostics, 900);
      setStatusMessage({
        type: 'ok',
        text: 'Фоновый Push подключён к этому телефону!'
      });
    } finally {
      setIsConnectingPush(false);
    }
  };

  const handleToggle = async () => {
    setStatusMessage(null);
    if (!settings.enabled) {
      let perm = permission;
      if (perm !== 'granted') {
        const granted = await requestNotificationPermission();
        perm = getNotificationPermissionState();
        setPermission(perm);
        if (!granted) {
          setStatusMessage({
            type: 'err',
            text: 'Для получения уведомлений разрешите их в браузере (значок замка/настроек в адресной строке).'
          });
          return;
        }
      }
      const next = { ...settings, enabled: true };
      setSettings(next);
      saveNotificationSettings(next);
      await ensurePushSubscription();
      updateNotificationSchedule(getStoredVehicles(), selectedVehicle?.id);
      setTimeout(refreshDiagnostics, 900);
    } else {
      const next = { ...settings, enabled: false };
      setSettings(next);
      saveNotificationSettings(next);
      updateNotificationSchedule(getStoredVehicles(), selectedVehicle?.id);
      setTimeout(refreshDiagnostics, 900);
    }
  };

  const buildSampleText = () => {
    let title = 'Подмена — через 15 минут';
    let body = 'В 18:00 : Выезд из АТП';

    if (selectedVehicle) {
      const points = extractVehicleTimePoints(selectedVehicle, activeShift);
      const samplePoint = upcomingPoint?.point || points[0];
      const minLeft = upcomingPoint?.minLeft || 15;

      title = `${selectedVehicle.garageNumber} — через ${minLeft} мин`;
      if (samplePoint) {
        body = `В ${samplePoint.timeStr} : ${samplePoint.label}`;
      } else {
        body = `В ${selectedVehicle.departureTime || '06:00'} : Выезд из АТП`;
      }
    }
    return { title, body };
  };

  const handleSendTest = async () => {
    setStatusMessage(null);
    setIsTestingNow(true);
    try {
      let perm = permission;
      if (perm !== 'granted') {
        const granted = await requestNotificationPermission();
        perm = getNotificationPermissionState();
        setPermission(perm);
        if (!granted) {
          setStatusMessage({ type: 'err', text: 'Разрешение на уведомления не получено.' });
          return;
        }
      }

      const { title, body } = buildSampleText();
      const pushRes = await sendImmediateServerPushTest(title, `${body} (Серверный Push)`);
      if (pushRes.ok) {
        playNotificationSound();
        setTestSent(true);
        setStatusMessage({
          type: 'ok',
          text: 'Тестовый Push отправлен через сервер! Должен прийти на телефон и часы.'
        });
        setTimeout(() => setTestSent(false), 4000);
      } else {
        // Fallback local notification if server unreachable
        const localOk = await sendSystemNotification(title, body);
        playNotificationSound();
        if (localOk) {
          setStatusMessage({
            type: 'ok',
            text: `Локальное уведомление сработало, но серверный Push вернул: ${pushRes.error}`
          });
        } else {
          setStatusMessage({
            type: 'err',
            text: pushRes.error || 'Не удалось отправить уведомление. Проверьте настройки Chrome/ОС.'
          });
        }
      }
    } finally {
      setIsTestingNow(false);
    }
  };

  const handleSendDelayedTest = async () => {
    setStatusMessage(null);
    let perm = permission;
    if (perm !== 'granted') {
      const granted = await requestNotificationPermission();
      perm = getNotificationPermissionState();
      setPermission(perm);
      if (!granted) {
        setStatusMessage({ type: 'err', text: 'Сначала разрешите уведомления в браузере.' });
        return;
      }
    }

    const { title, body } = buildSampleText();
    setDelayedCountdown(7);
    setStatusMessage({
      type: 'ok',
      text: 'Отсчёт пошёл! Прямо сейчас сверните приложение и заблокируйте экран на 7 секунд.'
    });

    const res = await sendDelayedServerPushTest(
      7000,
      `${title} (Тест блокировки)`,
      `${body} — пришло на заблокированный экран!`
    );

    if (!res.ok) {
      setDelayedCountdown(null);
      setStatusMessage({
        type: 'err',
        text: res.error || 'Не удалось запустить отложенный тест.'
      });
    }
  };

  const isEnabledAndGranted = settings.enabled && permission === 'granted';
  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const cronUrl = `${originUrl}/api/push/check`;
  const isDevUrl = typeof window !== 'undefined' && window.location.hostname.startsWith('ais-dev-');

  const formatLastCron = (ts: number | null) => {
    if (!ts) return 'ещё не запускался';
    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSec < 60) return `${diffSec} сек назад`;
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins} мин назад`;
    return `${Math.floor(mins / 60)} ч назад`;
  };

  const handleCopyCronUrl = async () => {
    try {
      await navigator.clipboard.writeText(cronUrl);
      setCopiedCronUrl(true);
      setTimeout(() => setCopiedCronUrl(false), 2500);
    } catch {
      setStatusMessage({ type: 'err', text: `Скопируйте вручную: ${cronUrl}` });
    }
  };

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
        title="Настройки фоновых уведомлений"
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
            className="fixed inset-0 z-40 bg-black/65 backdrop-blur-xs sm:hidden"
            onClick={() => setIsOpen(false)}
          />

          <div className="fixed inset-x-3 top-16 sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-96 max-h-[82vh] overflow-y-auto bg-[#121218] border border-slate-700 rounded-2xl shadow-2xl z-50 p-4 text-slate-100 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-950 text-blue-400 rounded-xl border border-blue-800">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Уведомления на часы и телефон</h3>
                  <p className="text-[11px] text-slate-400">Фоновый Push за 15 мин до точки</p>
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
                  {settings.enabled ? 'Включены (фоновый режим)' : 'Выключены'}
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

            {/* Inline status feedback */}
            {statusMessage && (
              <div
                className={`mb-3 p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                  statusMessage.type === 'ok'
                    ? 'bg-emerald-950/70 border-emerald-700/80 text-emerald-200'
                    : 'bg-rose-950/70 border-rose-700/80 text-rose-200'
                }`}
              >
                {statusMessage.type === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}

            {/* Permission + Web Push Connection Status */}
            <div className="mb-3 text-xs space-y-2">
              {permission === 'granted' ? (
                <div className="p-2.5 bg-[#181822] border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-emerald-300">
                      <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="font-semibold">
                        {pushDiag?.subscribed
                          ? 'Фоновый Push подключён'
                          : 'Разрешение есть, проверка канала...'}
                      </span>
                    </div>
                    {pushDiag && pushDiag.scheduledCount > 0 && (
                      <span className="text-[11px] text-slate-400 font-mono">
                        {pushDiag.scheduledCount} точ.
                      </span>
                    )}
                  </div>

                  {!pushDiag?.subscribed && (
                    <button
                      onClick={handleConnectPush}
                      disabled={isConnectingPush}
                      className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-xs rounded-lg transition-all"
                    >
                      {isConnectingPush ? 'Подключение...' : 'Подключить фоновый Push'}
                    </button>
                  )}
                </div>
              ) : permission === 'denied' ? (
                <div className="flex items-start gap-2 p-2.5 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-300">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Уведомления заблокированы браузером</span>
                    <span className="text-[11px] text-rose-200">
                      В Chrome нажмите на значок настроек слева от адреса сайта → Разрешения → Уведомления → Разрешить.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 bg-amber-950/60 border border-amber-800/80 rounded-xl text-amber-300 space-y-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="font-bold">Шаг 1: Разрешите уведомления</span>
                  </div>
                  <button
                    onClick={handleConnectPush}
                    disabled={isConnectingPush}
                    className="w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-500 active:scale-98 text-white font-bold text-xs rounded-lg transition-all shadow-md flex items-center justify-center gap-1.5"
                  >
                    <BellRing className="w-3.5 h-3.5" />
                    {isConnectingPush ? 'Подключаем...' : 'Разрешить и подключить Push'}
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
                          {upcomingPoint.point.label} (
                          {upcomingPoint.diffSeconds !== undefined
                            ? formatPointCountdown(upcomingPoint.diffSeconds)
                            : `через ${upcomingPoint.minLeft} мин`}
                          )
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

            {/* Test Notification Buttons */}
            <div className="space-y-2 mb-3">
              <button
                onClick={handleSendTest}
                disabled={isTestingNow}
                className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-600/30"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {isTestingNow
                    ? 'Отправка...'
                    : testSent
                    ? '✓ Push отправлен с сервера!'
                    : 'Проверить сейчас (Push с сервера)'}
                </span>
              </button>

              <button
                onClick={handleSendDelayedTest}
                disabled={delayedCountdown !== null}
                className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 disabled:bg-amber-900/60 disabled:border-amber-600 border border-slate-700 text-slate-100 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {delayedCountdown !== null
                    ? `Заблокируйте экран! Push через ${delayedCountdown} с...`
                    : 'Тест на заблокированном экране (7 сек)'}
                </span>
              </button>
            </div>

            {/* External Cron Setup Accordion */}
            <div className="border border-slate-800 rounded-xl bg-[#16161F] overflow-hidden">
              <button
                type="button"
                onClick={() => setShowCronGuide((v) => !v)}
                className="w-full px-3 py-2.5 flex items-center justify-between text-left text-xs hover:bg-slate-800/50 transition-colors"
              >
                <div>
                  <span className="font-bold text-slate-200 block">
                    Будильник сервера (cron-job.org)
                  </span>
                  <span
                    className={`text-[11px] block ${
                      pushDiag?.lastCronAt ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {pushDiag?.lastCronAt
                      ? `Активен • опрос ${formatLastCron(pushDiag.lastCronAt)}`
                      : 'Нажмите, чтобы скопировать ссылку для 1-минутного опроса'}
                  </span>
                </div>
                {showCronGuide ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </button>

              {showCronGuide && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-800/80 space-y-2 text-[11px] text-slate-300">
                  {isDevUrl && (
                    <div className="p-2 rounded-lg bg-amber-950/60 border border-amber-700/70 text-amber-200">
                      Сейчас открыт тестовый адрес AI Studio (<code>ais-dev-</code>). Ссылку для будильника копируйте со своего рабочего сайта (например, <code>uttist.vercel.app</code>).
                    </div>
                  )}

                  <p className="text-slate-400 leading-relaxed">
                    Чтобы сервер не засыпал и слал Push каждую минуту, скопируйте эту ссылку и вставьте на бесплатном сайте{' '}
                    <span className="text-white font-semibold">cron-job.org</span>:
                  </p>

                  <div className="flex items-center gap-1.5 bg-[#0D0D12] border border-slate-700 rounded-lg p-1.5">
                    <code className="text-[10px] text-blue-300 truncate flex-1 select-all">
                      {cronUrl}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyCronUrl}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-bold flex items-center gap-1 shrink-0"
                    >
                      {copiedCronUrl ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedCronUrl ? 'Готово' : 'Копировать'}</span>
                    </button>
                  </div>

                  <ol className="list-decimal list-inside space-y-1 text-slate-400">
                    <li>Откройте <span className="text-slate-200">cron-job.org</span> и войдите (бесплатно).</li>
                    <li>Нажмите <span className="text-slate-200">Create cronjob</span>.</li>
                    <li>В поле <span className="text-slate-200">URL</span> вставьте скопированную ссылку выше.</li>
                    <li>Выберите график <span className="text-slate-200">Every 1 minute</span> и нажмите <span className="text-slate-200">Create</span>.</li>
                  </ol>
                </div>
              )}
            </div>

            <p className="text-[10px] text-slate-500 mt-2.5 text-center">
              Push-уведомления приходят на телефон при погашенном экране и дублируются на смарт-часы.
            </p>
          </div>
        </>
      )}
    </div>
  );
};
