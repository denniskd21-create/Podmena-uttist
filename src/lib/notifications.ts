import { Vehicle } from '../types';
import { getSavedShiftForVehicle } from './storage';

export interface NotificationSettings {
  enabled: boolean;
  leadMinutes: number; // default 15
  soundEnabled: boolean;
}

const SETTINGS_KEY = 'podmena_notification_settings';
const NOTIFIED_KEYS_KEY = 'podmena_notified_points';

export function getNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error reading notification settings', e);
  }
  return {
    enabled: false,
    leadMinutes: 15,
    soundEnabled: true,
  };
}

export function saveNotificationSettings(settings: NotificationSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('notification_settings_changed'));
    }
  } catch (e) {
    console.error('Error saving notification settings', e);
  }
}

export function getSecondsWord(secs: number): string {
  const mod10 = secs % 10;
  const mod100 = secs % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'секунд';
  if (mod10 === 1) return 'секунда';
  if (mod10 >= 2 && mod10 <= 4) return 'секунды';
  return 'секунд';
}

/**
 * Format countdown timer with exact rules:
 * - >5 min (300s): "через X мин"
 * - 1-5 min (60-300s): "M:SS мин" (e.g. 4:59 мин)
 * - <1 min (<60s): "X секунда / секунды / секунд" (e.g. 59 секунд, 1 секунда)
 */
export function formatPointCountdown(diffSeconds: number): string {
  if (diffSeconds <= 0) return '';

  if (diffSeconds > 300) {
    const mins = Math.ceil(diffSeconds / 60);
    return `через ${mins} мин`;
  } else if (diffSeconds >= 60) {
    const mins = Math.floor(diffSeconds / 60);
    const secs = diffSeconds % 60;
    const ss = secs < 10 ? `0${secs}` : `${secs}`;
    return `${mins}:${ss} мин`;
  } else {
    const word = getSecondsWord(diffSeconds);
    return `${diffSeconds} ${word}`;
  }
}

/**
 * Track points already notified today to prevent duplicates
 */
function getNotifiedPointsToday(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEYS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const todayStr = new Date().toISOString().split('T')[0];
      if (data.date === todayStr && data.points) {
        return data.points;
      }
    }
  } catch (e) {
    console.error(e);
  }
  return {};
}

function markPointNotifiedToday(key: string) {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const points = getNotifiedPointsToday();
    points[key] = true;
    localStorage.setItem(
      NOTIFIED_KEYS_KEY,
      JSON.stringify({ date: todayStr, points })
    );
  } catch (e) {
    console.error(e);
  }
}

/**
 * Check browser notification permission state
 */
export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Request notification permission from browser
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  try {
    let perm: NotificationPermission = Notification.permission;
    if (perm === 'default') {
      try {
        const promiseRes = Notification.requestPermission((result) => {
          if (result) perm = result;
        });
        if (promiseRes && typeof promiseRes.then === 'function') {
          perm = await promiseRes;
        }
      } catch (err) {
        console.warn('Standard Notification.requestPermission failed, trying fallback', err);
      }
    }
    return perm === 'granted';
  } catch (e) {
    console.error('Failed to request notification permission:', e);
    return false;
  }
}

/**
 * Play a subtle sound beep when notification triggers
 */
export function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (e) {
    // Audio Context might be restricted before user gesture
  }
}

/**
 * Send a system notification (works via ServiceWorker or Web Notification API)
 */
export async function sendSystemNotification(title: string, body: string, tag?: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  const options: NotificationOptions & { vibrate?: number[] } = {
    body,
    icon: '/logo.png',
    badge: '/logo.png',
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true,
    tag: tag || 'podmena-point-alert',
  };

  // Prefer ServiceWorker registration showNotification if available
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, options);
      return true;
    } catch (e) {
      console.warn('ServiceWorker showNotification failed, falling back to Notification API', e);
    }
  }

  // Fallback to standard Notification API
  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch (e) {
    console.error('Failed to send notification via Notification API', e);
    return false;
  }
}

export interface ParsedTimePoint {
  rawText: string;
  label: string;
  timeStr: string; // e.g. "06:30"
  minutesFromMidnight: number;
  shiftOffset?: number;
}

export interface ScheduledNotificationItem {
  id: string; // e.g. "veh123_08:30_Точка сбора_pre" or "veh123_08:30_Точка сбора_exact"
  vehicleId: string;
  garageNumber: string;
  pointTimeStr: string;
  pointLabel: string;
  targetTimestamp: number; // exact epoch ms when notification should fire
  type: 'pre' | 'exact';
  title: string;
  body: string;
}

const SCHEDULE_STORAGE_KEY = 'podmena_scheduled_notifications_v2';

export function getScheduledNotifications(): ScheduledNotificationItem[] {
  try {
    const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }
  return [];
}

export function saveScheduledNotifications(items: ScheduledNotificationItem[]) {
  try {
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(items));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('podmena_schedule_updated'));
    }
  } catch (e) {
    console.error(e);
  }
}

/**
 * Calculate the exact Epoch Milliseconds timestamp for a given point time (in minutes from midnight)
 * considering whether the shift is a normal daytime shift or overnight shift.
 */
export function getPointTargetTimestamp(
  now: Date,
  pointMins: number,
  depMins: number,
  retMins: number
): number {
  const isOvernight = depMins > retMins;
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();

  const hh = Math.floor(pointMins / 60) % 24;
  const mm = pointMins % 60;

  const target = new Date(year, month, date, hh, mm, 0, 0);
  const nowMins = now.getHours() * 60 + now.getMinutes();

  if (isOvernight) {
    const isMorningPoint = pointMins < depMins - 180;

    if (nowMins >= depMins - 180) {
      if (isMorningPoint) {
        target.setDate(target.getDate() + 1);
      }
    } else if (nowMins <= retMins + 180) {
      if (!isMorningPoint) {
        target.setDate(target.getDate() - 1);
      }
    } else {
      if (isMorningPoint) {
        target.setDate(target.getDate() + 1);
      }
    }
  }

  return target.getTime();
}

/**
 * Rebuild the notification schedule in browser storage based on active vehicles and notification settings.
 * Stores scheduled notifications with exact target timestamps.
 */
export function updateNotificationSchedule(
  allVehicles: Vehicle[],
  selectedVehicleId?: string | null
): ScheduledNotificationItem[] {
  const settings = getNotificationSettings();
  if (!settings.enabled || !allVehicles || allVehicles.length === 0) {
    saveScheduledNotifications([]);
    return [];
  }

  const vehiclesToCheck = selectedVehicleId
    ? allVehicles.filter((v) => v.id === selectedVehicleId)
    : allVehicles;

  const now = new Date();
  const scheduleItems: ScheduledNotificationItem[] = [];

  for (const vehicle of vehiclesToCheck) {
    const activeShift =
      vehicle.shiftType === '2-сменка'
        ? getSavedShiftForVehicle(vehicle.id)
        : undefined;

    const points = extractVehicleTimePoints(vehicle, activeShift);
    if (points.length === 0) continue;

    const depMins = points[0].minutesFromMidnight;
    const retMins = points[points.length - 1].minutesFromMidnight;

    for (const p of points) {
      const targetTs = getPointTargetTimestamp(now, p.minutesFromMidnight, depMins, retMins);

      // 1) Exact notification at point time
      const exactId = `${vehicle.id}_${p.timeStr}_${p.label}_exact`;
      scheduleItems.push({
        id: exactId,
        vehicleId: vehicle.id,
        garageNumber: vehicle.garageNumber,
        pointTimeStr: p.timeStr,
        pointLabel: p.label,
        targetTimestamp: targetTs,
        type: 'exact',
        title: `${vehicle.garageNumber} - Сейчас! (${p.timeStr})`,
        body: `В ${p.timeStr} : ${p.label}`,
      });

      // 2) Pre notification (e.g. 15 minutes before point time)
      if (settings.leadMinutes > 0) {
        const preTs = targetTs - settings.leadMinutes * 60 * 1000;
        const preId = `${vehicle.id}_${p.timeStr}_${p.label}_pre`;
        scheduleItems.push({
          id: preId,
          vehicleId: vehicle.id,
          garageNumber: vehicle.garageNumber,
          pointTimeStr: p.timeStr,
          pointLabel: p.label,
          targetTimestamp: preTs,
          type: 'pre',
          title: `${vehicle.garageNumber} - через ${settings.leadMinutes} мин`,
          body: `В ${p.timeStr} : ${p.label}`,
        });
      }
    }
  }

  scheduleItems.sort((a, b) => a.targetTimestamp - b.targetTimestamp);
  saveScheduledNotifications(scheduleItems);
  return scheduleItems;
}

/**
 * Extract time points from a vehicle record for the specified or active shift
 */
export function extractVehicleTimePoints(
  vehicle: Vehicle,
  activeShift?: '1' | '2'
): ParsedTimePoint[] {
  const isTwoShift = vehicle.shiftType === '2-сменка';

  let shiftToUse: '1' | '2' = activeShift || '1';
  if (isTwoShift && !activeShift) {
    shiftToUse = getSavedShiftForVehicle(vehicle.id);
  }

  let depStr = '';
  let retStr = '';
  let rawPickupPoints: string[] = [];

  if (isTwoShift) {
    if (shiftToUse === '2') {
      depStr = vehicle.shift2Departure || '18:00';
      retStr = vehicle.shift2Return || '06:00';
      rawPickupPoints = vehicle.shift2PickupPoints?.length
        ? vehicle.shift2PickupPoints
        : vehicle.pickupPoints || [];
    } else {
      depStr = vehicle.shift1Departure || vehicle.departureTime || '06:00';
      retStr = vehicle.shift1Return || vehicle.returnTime || '18:00';
      rawPickupPoints = vehicle.shift1PickupPoints?.length
        ? vehicle.shift1PickupPoints
        : vehicle.pickupPoints || [];
    }
  } else {
    depStr = vehicle.departureTime || '';
    retStr = vehicle.returnTime || '';
    rawPickupPoints = vehicle.pickupPoints || [];
  }

  const rawPoints: { label: string; timeStr: string; minutesFromMidnight: number }[] = [];

  const parseTime = (timeStr: string): number | null => {
    if (!timeStr) return null;
    const m = timeStr.match(/(\d{1,2})[:.](\d{2})/);
    if (!m) return null;
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return hh * 60 + mm;
    }
    return null;
  };

  const addPoint = (timeStr: string, label: string) => {
    const mins = parseTime(timeStr);
    if (mins !== null) {
      const formattedTime = `${Math.floor(mins / 60).toString().padStart(2, '0')}:${(mins % 60).toString().padStart(2, '0')}`;
      rawPoints.push({
        label: label || 'Точка сбора',
        timeStr: formattedTime,
        minutesFromMidnight: mins,
      });
    }
  };

  if (depStr) {
    addPoint(depStr, isTwoShift ? `Выезд из АТП (${shiftToUse}-я смена)` : 'Выезд из АТП');
  }

  for (const line of rawPickupPoints) {
    if (!line) continue;
    const match = line.match(/^(?:(\d{1,2})[:.](\d{2}))\s*[-—:]?\s*(.*)$/);
    if (match) {
      addPoint(`${match[1]}:${match[2]}`, match[3]?.trim() || 'Точка сбора');
    } else {
      const tMatch = line.match(/(\d{1,2})[:.](\d{2})/);
      if (tMatch) {
        addPoint(
          `${tMatch[1]}:${tMatch[2]}`,
          line.replace(tMatch[0], '').replace(/^[-—:\s]+/, '').trim() || 'Точка сбора'
        );
      }
    }
  }

  if (retStr) {
    addPoint(retStr, isTwoShift ? `Возврат в АТП (${shiftToUse}-я смена)` : 'Возврат в АТП');
  }

  if (rawPoints.length === 0) return [];

  const depMins = parseTime(depStr) ?? rawPoints[0].minutesFromMidnight;
  const retMins = parseTime(retStr) ?? rawPoints[rawPoints.length - 1].minutesFromMidnight;
  const isOvernight = depMins > retMins;

  const parsed: ParsedTimePoint[] = rawPoints.map((p) => {
    let normMins = p.minutesFromMidnight;
    if (isOvernight && p.minutesFromMidnight < depMins - 180) {
      normMins += 1440;
    }
    return {
      rawText: `${p.timeStr} — ${p.label}`,
      label: p.label,
      timeStr: p.timeStr,
      minutesFromMidnight: normMins,
    };
  });

  parsed.sort((a, b) => a.minutesFromMidnight - b.minutesFromMidnight);

  const unique: ParsedTimePoint[] = [];
  const seen = new Set<string>();
  for (const p of parsed) {
    const key = `${p.timeStr}_${p.label}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }

  return unique;
}

/**
 * Process scheduled notifications against current time and trigger notifications when due.
 */
export function processNotificationSchedule(): number {
  const settings = getNotificationSettings();
  if (!settings.enabled || typeof window === 'undefined') return 0;
  if (getNotificationPermissionState() !== 'granted') return 0;

  const items = getScheduledNotifications();
  if (!items || items.length === 0) return 0;

  const nowMs = Date.now();
  const notifiedMap = getNotifiedPointsToday();
  let firedCount = 0;

  for (const item of items) {
    if (nowMs >= item.targetTimestamp && nowMs <= item.targetTimestamp + 15 * 60 * 1000) {
      if (!notifiedMap[item.id]) {
        sendSystemNotification(item.title, item.body, item.id);
        if (settings.soundEnabled) {
          playNotificationSound();
        }
        markPointNotifiedToday(item.id);
        firedCount++;

        window.dispatchEvent(
          new CustomEvent('podmena_notification_fired', { detail: item })
        );
      }
    }
  }

  return firedCount;
}

export function checkVehicleNotifications(
  vehicle: Vehicle,
  settings: NotificationSettings,
  activeShift?: '1' | '2'
): { notifiedCount: number; upcomingPoint?: ParsedTimePoint; minutesLeft?: number; autoDisabled?: boolean } {
  if (!settings.enabled || typeof window === 'undefined') {
    return { notifiedCount: 0 };
  }

  const firedCount = processNotificationSchedule();

  const points = extractVehicleTimePoints(vehicle, activeShift);
  if (points.length === 0) return { notifiedCount: firedCount };

  const depMins = points[0].minutesFromMidnight;
  const retMins = points[points.length - 1].minutesFromMidnight;
  const now = new Date();

  let upcomingPoint: ParsedTimePoint | undefined;
  let minMinutesLeft: number | undefined;

  for (const p of points) {
    const targetTs = getPointTargetTimestamp(now, p.minutesFromMidnight, depMins, retMins);
    const diffSecs = Math.floor((targetTs - now.getTime()) / 1000);
    const diffMins = Math.ceil(diffSecs / 60);

    if (diffSecs > 0) {
      if (minMinutesLeft === undefined || diffMins < minMinutesLeft) {
        minMinutesLeft = diffMins;
        upcomingPoint = p;
      }
    }
  }

  return { notifiedCount: firedCount, upcomingPoint, minutesLeft: minMinutesLeft };
}

/**
 * Web Worker & Global Interval Ticker for background ticking
 */
let bgWorker: Worker | null = null;
let globalTickerTimer: ReturnType<typeof setInterval> | null = null;

export function startBackgroundNotificationWorker(
  getVehicles: () => { selectedVehicle: Vehicle | null; allVehicles: Vehicle[] }
) {
  if (typeof window === 'undefined') return;

  const syncAndTick = () => {
    try {
      const { selectedVehicle, allVehicles } = getVehicles();
      updateNotificationSchedule(allVehicles, selectedVehicle?.id);
      processNotificationSchedule();
      window.dispatchEvent(new Event('podmena_second_tick'));
    } catch (e) {
      console.error(e);
    }
  };

  syncAndTick();

  // Setup global 1-second interval ticker if not already running
  if (!globalTickerTimer) {
    globalTickerTimer = setInterval(() => {
      try {
        processNotificationSchedule();
        window.dispatchEvent(new Event('podmena_second_tick'));
      } catch (e) {
        console.error(e);
      }
    }, 1000);
  }

  // Setup Web Worker for background thread execution when tab is hidden
  if ('Worker' in window && !bgWorker) {
    try {
      const workerBlob = new Blob([`
        let timer = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (timer) clearInterval(timer);
            timer = setInterval(function() {
              self.postMessage('tick');
            }, 1000);
          } else if (e.data === 'stop') {
            if (timer) clearInterval(timer);
            timer = null;
          }
        };
      `], { type: 'application/javascript' });

      bgWorker = new Worker(URL.createObjectURL(workerBlob));
      bgWorker.onmessage = () => {
        processNotificationSchedule();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('podmena_second_tick'));
        }
      };
      bgWorker.postMessage('start');
    } catch (e) {
      console.warn('Could not start Web Worker:', e);
    }
  }
}


