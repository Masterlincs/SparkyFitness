import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActiveServerConfigId } from './storage';
import { addLog } from './LogService';
import { ApiError } from './api/errors';
import {
  createFoodEntry,
  type CreateFoodEntryPayload,
} from './api/foodEntriesApi';
import type { FoodItem } from '../types/foods';
import type { MealType } from '../types/mealTypes';
import { getErrorMessage } from '../utils/errors';

// Logging food with no connection. While online, food search keeps a snapshot
// of the person's recent, frequent and favourite foods and their meal types on
// the phone. Offline, foods picked from that snapshot are queued here and sent
// once the server answers again. Everything is kept per server, so a queue
// never reaches another account.

const SNAPSHOT_VERSION = 1;
const MAX_SNAPSHOT_FOODS = 80;
const snapshotKey = (serverId: string) => `@OfflineFood:snapshot:${serverId}`;
const queueKey = (serverId: string) => `@OfflineFood:queue:${serverId}`;

export interface OfflineFoodSnapshot {
  version: 1;
  savedAt: string;
  foods: FoodItem[];
  mealTypes: MealType[];
}

export interface QueuedFoodEntry {
  /** Local id, only ever used on this phone. */
  id: string;
  queuedAt: string;
  foodName: string;
  payload: CreateFoodEntryPayload;
}

export interface FlushResult {
  sent: number;
  dropped: number;
  remaining: number;
  /** Diary days that gained entries, to refresh. */
  dates: string[];
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Saves the foods and meal types offline logging can offer. */
export async function saveOfflineFoodSnapshot(
  foods: FoodItem[],
  mealTypes: MealType[]
): Promise<void> {
  const serverId = await getActiveServerConfigId();
  if (!serverId || mealTypes.length === 0) return;
  const seen = new Set<string>();
  const unique = foods.filter((food) => {
    if (!food.default_variant?.id || seen.has(food.id)) return false;
    seen.add(food.id);
    return true;
  });
  if (unique.length === 0) return;
  const snapshot: OfflineFoodSnapshot = {
    version: SNAPSHOT_VERSION,
    savedAt: new Date().toISOString(),
    foods: unique.slice(0, MAX_SNAPSHOT_FOODS),
    mealTypes,
  };
  try {
    await AsyncStorage.setItem(snapshotKey(serverId), JSON.stringify(snapshot));
  } catch (error) {
    addLog('Could not save offline food snapshot', 'WARNING', [
      getErrorMessage(error),
    ]);
  }
}

export async function loadOfflineFoodSnapshot(): Promise<OfflineFoodSnapshot | null> {
  const serverId = await getActiveServerConfigId();
  if (!serverId) return null;
  const snapshot = await readJson<OfflineFoodSnapshot>(snapshotKey(serverId));
  return snapshot?.version === SNAPSHOT_VERSION &&
    Array.isArray(snapshot.foods) &&
    Array.isArray(snapshot.mealTypes)
    ? snapshot
    : null;
}

export async function getQueuedFoodEntries(): Promise<QueuedFoodEntry[]> {
  const serverId = await getActiveServerConfigId();
  if (!serverId) return [];
  const queue = await readJson<QueuedFoodEntry[]>(queueKey(serverId));
  return Array.isArray(queue) ? queue : [];
}

async function writeQueue(serverId: string, queue: QueuedFoodEntry[]) {
  await AsyncStorage.setItem(queueKey(serverId), JSON.stringify(queue));
}

/** Queues a diary entry for a saved food, to send once the server answers. */
export async function queueFoodEntry(
  foodName: string,
  payload: CreateFoodEntryPayload
): Promise<QueuedFoodEntry> {
  const serverId = await getActiveServerConfigId();
  if (!serverId) throw new Error('No active server to queue food for');
  if (!payload.food_id || !payload.variant_id) {
    throw new Error('Only saved foods can be logged offline');
  }
  const entry: QueuedFoodEntry = {
    id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
    foodName,
    payload,
  };
  const queue = await getQueuedFoodEntries();
  await writeQueue(serverId, [...queue, entry]);
  return entry;
}

let flushing: Promise<FlushResult> | null = null;

/**
 * Sends queued entries in order. Stops at the first connection failure or
 * server error, keeping the rest for next time; drops an entry the server
 * refuses (4xx), since sending it again would fail the same way.
 */
export function flushOfflineFoodQueue(): Promise<FlushResult> {
  flushing ??= (async () => {
    const result: FlushResult = {
      sent: 0,
      dropped: 0,
      remaining: 0,
      dates: [],
    };
    const serverId = await getActiveServerConfigId();
    if (!serverId) return result;
    let queue = await getQueuedFoodEntries();
    while (queue.length > 0) {
      const [next, ...rest] = queue;
      try {
        await createFoodEntry(next.payload);
        result.sent += 1;
        if (!result.dates.includes(next.payload.entry_date)) {
          result.dates.push(next.payload.entry_date);
        }
      } catch (error) {
        const refused =
          error instanceof ApiError &&
          error.statusCode >= 400 &&
          error.statusCode < 500 &&
          error.statusCode !== 401 &&
          error.statusCode !== 408 &&
          error.statusCode !== 429;
        if (!refused) break;
        result.dropped += 1;
        addLog(`Dropped offline food entry "${next.foodName}"`, 'WARNING', [
          getErrorMessage(error),
        ]);
      }
      queue = rest;
      await writeQueue(serverId, queue);
    }
    result.remaining = queue.length;
    return result;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
