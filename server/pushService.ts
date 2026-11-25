import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as webpushNamespace from 'web-push';
const webpush: typeof webpushNamespace = (webpushNamespace as any).default || webpushNamespace;
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  Firestore
} from 'firebase/firestore/lite';

export interface PushSubscriptionData {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface ServerScheduledItem {
  id: string;
  targetTimestamp: number;
  title: string;
  body: string;
}

interface DecryptedPushPayload {
  subscription: PushSubscriptionData;
  items: ServerScheduledItem[];
  vehicleId: string;
  garageNumber: string;
}

interface StoredPushRecord {
  id: string;
  encryptedPayload: string;
  enabled: boolean;
  nextTriggerAt: number;
  sentIds: string[];
  updatedAt: number;
}

interface MemoryPushEntry {
  record: StoredPushRecord;
  payload: DecryptedPushPayload;
}

const PUSH_COLLECTION = 'push_subscriptions';

// Runtime VAPID configuration
let vapidPublicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
let vapidPrivateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
const vapidSubject = (process.env.VAPID_SUBJECT || 'mailto:admin@uttist-podmena.local').trim();
const envVapidConfigured = Boolean(vapidPublicKey && vapidPrivateKey);

if (!envVapidConfigured) {
  const generated = webpush.generateVAPIDKeys();
  vapidPublicKey = generated.publicKey;
  vapidPrivateKey = generated.privateKey;
  console.warn(
    '[PushService] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set in environment; using runtime-generated keys for this session.'
  );
}

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

// Derive 32-byte AES-256-GCM key exclusively on the server
const encryptionSecret = (process.env.PUSH_ENCRYPTION_KEY || vapidPrivateKey).trim();
const encryptionKey = crypto.createHash('sha256').update(encryptionSecret).digest();

function encryptPayload(payload: DecryptedPushPayload): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptPayload(token: string): DecryptedPushPayload | null {
  try {
    const parts = token.split(':');
    if (parts.length !== 3) return null;
    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    const encrypted = Buffer.from(parts[2], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    return JSON.parse(decrypted) as DecryptedPushPayload;
  } catch {
    return null;
  }
}

const DEFAULT_FIREBASE_CONFIG = {
  projectId: 'watchful-snow-75xj8',
  appId: '1:429685830538:web:cdc0eaac9c437954ed8e73',
  apiKey: 'AIzaSyD7Gule-fCuexqXH3nvzpnGq4C5OjAkxhg',
  authDomain: 'watchful-snow-75xj8.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-02e8e413-8742-4413-b192-a358c5a8a6bd',
  storageBucket: 'watchful-snow-75xj8.firebasestorage.app',
  messagingSenderId: '429685830538'
};

// Initialize Firestore Lite safely for Node.js & Vercel Serverless
let firestoreDb: Firestore | null = null;
function getDb(): Firestore | null {
  if (firestoreDb) return firestoreDb;
  try {
    let firebaseConfig = DEFAULT_FIREBASE_CONFIG;
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig, 'push-server');
    firestoreDb = firebaseConfig.firestoreDatabaseId
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
      : getFirestore(app);
    return firestoreDb;
  } catch (err) {
    console.warn('[PushService] Firestore init warning:', err);
    return null;
  }
}

// In-memory L1 cache + status telemetry
const memoryStore = new Map<string, MemoryPushEntry>();
let lastCheckAt: number | null = null;
let lastCronAt: number | null = null;
let lastSentCount = 0;
let isDispatching = false;

export function getSubscriptionId(endpoint: string): string {
  return crypto.createHash('sha256').update(endpoint).digest('hex');
}

export function isValidPushSubscription(sub: any): sub is PushSubscriptionData {
  if (!sub || typeof sub !== 'object') return false;
  if (typeof sub.endpoint !== 'string' || sub.endpoint.length < 10 || sub.endpoint.length > 2048) {
    return false;
  }
  try {
    const parsed = new URL(sub.endpoint);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host === '169.254.169.254'
    ) {
      return false;
    }
  } catch {
    return false;
  }
  if (!sub.keys || typeof sub.keys !== 'object') return false;
  if (typeof sub.keys.p256dh !== 'string' || sub.keys.p256dh.length < 10 || sub.keys.p256dh.length > 512) {
    return false;
  }
  if (typeof sub.keys.auth !== 'string' || sub.keys.auth.length < 8 || sub.keys.auth.length > 256) {
    return false;
  }
  return true;
}

function sanitizeItems(rawItems: any[]): ServerScheduledItem[] {
  if (!Array.isArray(rawItems)) return [];
  const cleaned: ServerScheduledItem[] = [];
  for (const raw of rawItems.slice(0, 60)) {
    if (!raw || typeof raw !== 'object') continue;
    const id = typeof raw.id === 'string' ? raw.id.slice(0, 160) : '';
    const title = typeof raw.title === 'string' ? raw.title.slice(0, 140) : '';
    const body = typeof raw.body === 'string' ? raw.body.slice(0, 240) : '';
    const targetTimestamp = typeof raw.targetTimestamp === 'number' && Number.isFinite(raw.targetTimestamp)
      ? raw.targetTimestamp
      : 0;
    if (id && title && targetTimestamp > 0) {
      cleaned.push({ id, title, body, targetTimestamp });
    }
  }
  return cleaned;
}

function computeNextTriggerAt(items: ServerScheduledItem[], sentIds: string[]): number {
  const now = Date.now();
  let minTs = 0;
  for (const item of items) {
    if (sentIds.includes(item.id)) continue;
    if (item.targetTimestamp < now - 10 * 60_000) continue;
    if (minTs === 0 || item.targetTimestamp < minTs) {
      minTs = item.targetTimestamp;
    }
  }
  return minTs;
}

export function getPublicPushConfig() {
  return {
    publicKey: vapidPublicKey,
    envConfigured: envVapidConfigured,
    serverTime: Date.now()
  };
}

export async function getPushStatus(subId?: string) {
  let subscriptionActive = false;
  let scheduledCount = 0;

  if (subId && /^[a-f0-9]{64}$/.test(subId)) {
    const mem = memoryStore.get(subId);
    if (mem) {
      subscriptionActive = mem.record.enabled;
      scheduledCount = mem.payload.items.filter((i) => !mem.record.sentIds.includes(i.id)).length;
    } else {
      const db = getDb();
      if (db) {
        try {
          const snap = await getDoc(doc(db, PUSH_COLLECTION, subId));
          if (snap.exists()) {
            const data = snap.data() as StoredPushRecord;
            const decoded = decryptPayload(data.encryptedPayload);
            if (decoded) {
              subscriptionActive = data.enabled;
              scheduledCount = decoded.items.filter((i) => !data.sentIds.includes(i.id)).length;
              memoryStore.set(subId, { record: data, payload: decoded });
            }
          }
        } catch (err) {
          console.warn('[PushService] status read warning:', err);
        }
      }
    }
  }

  const db = getDb();
  if (db && !lastCronAt) {
    try {
      const cronSnap = await getDoc(doc(db, '_meta', 'push_cron'));
      if (cronSnap.exists()) {
        const cData = cronSnap.data() as {
          lastCronAt?: number;
          lastCheckAt?: number;
          lastSentCount?: number;
        };
        if (typeof cData.lastCronAt === 'number') lastCronAt = cData.lastCronAt;
        if (typeof cData.lastCheckAt === 'number' && !lastCheckAt) lastCheckAt = cData.lastCheckAt;
        if (typeof cData.lastSentCount === 'number') lastSentCount = cData.lastSentCount;
      }
    } catch {
      // Ignore optional meta read error
    }
  }

  return {
    envConfigured: envVapidConfigured,
    activeSubscriptions: Array.from(memoryStore.values()).filter((e) => e.record.enabled).length,
    subscriptionActive,
    scheduledCount,
    lastCheckAt,
    lastCronAt,
    lastSentCount,
    serverTime: Date.now()
  };
}

export async function upsertPushSubscription(params: {
  subscription: PushSubscriptionData;
  enabled: boolean;
  vehicleId?: string;
  garageNumber?: string;
  items?: any[];
}) {
  const subId = getSubscriptionId(params.subscription.endpoint);
  const sanitizedItems = params.enabled ? sanitizeItems(params.items || []) : [];
  const vehicleId = typeof params.vehicleId === 'string' ? params.vehicleId.slice(0, 128) : '';
  const garageNumber = typeof params.garageNumber === 'string' ? params.garageNumber.slice(0, 64) : '';

  // Preserve sentIds for today so re-syncing doesn't re-fire already sent alerts
  let existingSentIds: string[] = [];
  const mem = memoryStore.get(subId);
  if (mem) {
    existingSentIds = mem.record.sentIds || [];
  } else {
    const db = getDb();
    if (db) {
      try {
        const existingSnap = await getDoc(doc(db, PUSH_COLLECTION, subId));
        if (existingSnap.exists()) {
          const existingData = existingSnap.data() as StoredPushRecord;
          if (Array.isArray(existingData.sentIds)) {
            existingSentIds = existingData.sentIds.slice(-100);
          }
        }
      } catch {
        // Ignore initial lookup failure
      }
    }
  }

  const payload: DecryptedPushPayload = {
    subscription: {
      endpoint: params.subscription.endpoint,
      expirationTime: params.subscription.expirationTime ?? null,
      keys: {
        p256dh: params.subscription.keys.p256dh,
        auth: params.subscription.keys.auth
      }
    },
    items: sanitizedItems,
    vehicleId,
    garageNumber
  };

  const encryptedPayload = encryptPayload(payload);
  const sentIds = existingSentIds.slice(-100);
  const record: StoredPushRecord = {
    id: subId,
    encryptedPayload,
    enabled: Boolean(params.enabled),
    nextTriggerAt: params.enabled ? computeNextTriggerAt(sanitizedItems, sentIds) : 0,
    sentIds,
    updatedAt: Date.now()
  };

  memoryStore.set(subId, { record, payload });

  const db = getDb();
  if (db) {
    try {
      await setDoc(doc(db, PUSH_COLLECTION, subId), record);
    } catch (err) {
      console.warn('[PushService] Firestore write warning:', err);
    }
  }

  return {
    subId,
    enabled: record.enabled,
    scheduledCount: sanitizedItems.length
  };
}

export async function removePushSubscription(endpoint: string) {
  const subId = getSubscriptionId(endpoint);
  memoryStore.delete(subId);
  const db = getDb();
  if (db) {
    try {
      await deleteDoc(doc(db, PUSH_COLLECTION, subId));
    } catch (err) {
      console.warn('[PushService] Firestore delete warning:', err);
    }
  }
  return { subId };
}

export async function sendWebPushNotification(
  subscription: PushSubscriptionData,
  payload: { id: string; tag: string; title: string; body: string; url?: string }
): Promise<{ ok: boolean; gone?: boolean; error?: string }> {
  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        id: payload.id,
        tag: payload.tag,
        title: payload.title,
        body: payload.body,
        url: payload.url || '/'
      }),
      {
        TTL: 300,
        urgency: 'high'
      }
    );
    return { ok: true };
  } catch (err: any) {
    const statusCode = err?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      return { ok: false, gone: true, error: `Subscription expired (${statusCode})` };
    }
    return { ok: false, error: err?.message || 'Push send error' };
  }
}

export async function runPushDispatchCheck(source: 'cron' | 'interval' = 'interval') {
  const now = Date.now();
  lastCheckAt = now;
  if (source === 'cron') {
    lastCronAt = now;
  }

  if (isDispatching) {
    return { ok: true, skipped: true, checked: 0, sent: 0, serverTime: now };
  }

  isDispatching = true;
  let checked = 0;
  let sent = 0;

  try {
    const db = getDb();
    if (db) {
      try {
        const q = query(collection(db, PUSH_COLLECTION), where('enabled', '==', true));
        const snapshot = await getDocs(q);
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as StoredPushRecord;
          const decoded = decryptPayload(data.encryptedPayload);
          if (decoded) {
            const mem = memoryStore.get(data.id);
            if (!mem || data.updatedAt >= mem.record.updatedAt) {
              memoryStore.set(data.id, { record: data, payload: decoded });
            }
          }
        });
      } catch (err) {
        console.warn('[PushService] Firestore query warning:', err);
      }
    }

    const entries = Array.from(memoryStore.entries());
    for (const [subId, entry] of entries) {
      if (!entry.record.enabled) continue;
      checked++;

      const { record, payload } = entry;
      const dueItems = payload.items.filter((item) => {
        if (record.sentIds.includes(item.id)) return false;
        return now >= item.targetTimestamp - 20_000 && now <= item.targetTimestamp + 10 * 60_000;
      });

      if (dueItems.length === 0) continue;

      let recordDirty = false;
      let subscriptionGone = false;

      for (const item of dueItems) {
        const res = await sendWebPushNotification(payload.subscription, {
          id: item.id,
          tag: item.id,
          title: item.title,
          body: item.body,
          url: '/'
        });

        if (res.gone) {
          subscriptionGone = true;
          break;
        }

        if (res.ok) {
          sent++;
          record.sentIds = [...record.sentIds, item.id].slice(-100);
          recordDirty = true;
        } else {
          console.warn(`[PushService] Failed push for ${subId}:`, res.error);
        }
      }

      if (subscriptionGone) {
        await removePushSubscription(payload.subscription.endpoint);
      } else if (recordDirty) {
        record.nextTriggerAt = computeNextTriggerAt(payload.items, record.sentIds);
        record.updatedAt = Date.now();
        memoryStore.set(subId, { record, payload });
        if (db) {
          try {
            await setDoc(doc(db, PUSH_COLLECTION, subId), record);
          } catch (err) {
            console.warn('[PushService] Firestore update after send warning:', err);
          }
        }
      }
    }

    lastSentCount = sent;
    if (source === 'cron' && db) {
      try {
        await setDoc(doc(db, '_meta', 'push_cron'), {
          lastCronAt: lastCronAt || now,
          lastCheckAt: now,
          lastSentCount: sent
        });
      } catch (err) {
        console.warn('[PushService] push_cron meta write warning:', err);
      }
    }
    return { ok: true, checked, sent, serverTime: now };
  } finally {
    isDispatching = false;
  }
}

export function startServerPushLoop() {
  setInterval(() => {
    runPushDispatchCheck('interval').catch((err) => {
      console.warn('[PushService] Interval dispatch error:', err);
    });
  }, 30_000);
}
