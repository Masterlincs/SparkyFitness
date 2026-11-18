import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  flushOfflineFoodQueue,
  getQueuedFoodEntries,
  loadOfflineFoodSnapshot,
  queueFoodEntry,
  saveOfflineFoodSnapshot,
} from '../../src/services/offlineFoodLog';
import { createFoodEntry } from '../../src/services/api/foodEntriesApi';
import { getActiveServerConfigId } from '../../src/services/storage';
import { ApiError } from '../../src/services/api/errors';
import type { FoodItem } from '../../src/types/foods';
import type { MealType } from '../../src/types/mealTypes';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(),
}));
jest.mock('../../src/services/api/foodEntriesApi', () => ({
  createFoodEntry: jest.fn(),
}));

const mockServer = getActiveServerConfigId as jest.Mock;
const mockCreate = createFoodEntry as jest.Mock;

const food = (id: string, variantId?: string): FoodItem =>
  ({
    id,
    name: `Food ${id}`,
    brand: null,
    is_custom: false,
    default_variant: {
      id: variantId,
      serving_size: 100,
      serving_unit: 'g',
      calories: 100,
      protein: 1,
      carbs: 1,
      fat: 1,
    },
  }) as FoodItem;

const mealTypes = [{ id: 'mt-breakfast', name: 'breakfast' }] as MealType[];

const payload = (date: string) => ({
  food_id: 'f1',
  variant_id: 'v1',
  meal_type_id: 'mt-breakfast',
  quantity: 2,
  unit: 'g',
  entry_date: date,
});

describe('offlineFoodLog', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockServer.mockResolvedValue('server-a');
  });

  it('keeps one copy of each saved food, per server', async () => {
    await saveOfflineFoodSnapshot(
      [food('a', 'va'), food('a', 'va'), food('no-variant'), food('b', 'vb')],
      mealTypes
    );

    const snapshot = await loadOfflineFoodSnapshot();
    expect(snapshot?.foods.map((f) => f.id)).toEqual(['a', 'b']);
    expect(snapshot?.mealTypes).toEqual(mealTypes);

    mockServer.mockResolvedValue('server-b');
    expect(await loadOfflineFoodSnapshot()).toBeNull();
  });

  it('queues only saved foods with a variant', async () => {
    await queueFoodEntry('Toast', payload('2026-11-17'));
    await expect(
      queueFoodEntry('Mystery', {
        ...payload('2026-11-17'),
        variant_id: undefined,
      })
    ).rejects.toThrow('Only saved foods');

    const queue = await getQueuedFoodEntries();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      foodName: 'Toast',
      payload: payload('2026-11-17'),
    });
  });

  it('sends queued entries in order and reports the days to refresh', async () => {
    await queueFoodEntry('Toast', payload('2026-11-16'));
    await queueFoodEntry('Eggs', payload('2026-11-17'));
    mockCreate.mockResolvedValue({});

    const result = await flushOfflineFoodQueue();

    expect(mockCreate.mock.calls.map(([p]) => p.entry_date)).toEqual([
      '2026-11-16',
      '2026-11-17',
    ]);
    expect(result).toEqual({
      sent: 2,
      dropped: 0,
      remaining: 0,
      dates: ['2026-11-16', '2026-11-17'],
    });
    expect(await getQueuedFoodEntries()).toEqual([]);
  });

  it('stops at a connection failure and keeps the rest', async () => {
    await queueFoodEntry('Toast', payload('2026-11-16'));
    await queueFoodEntry('Eggs', payload('2026-11-17'));
    mockCreate
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new TypeError('Network request failed'));

    const result = await flushOfflineFoodQueue();

    expect(result).toMatchObject({ sent: 1, remaining: 1 });
    expect((await getQueuedFoodEntries())[0].foodName).toBe('Eggs');
  });

  it('drops an entry the server refuses, but keeps one after a server error', async () => {
    await queueFoodEntry('Deleted food', payload('2026-11-16'));
    await queueFoodEntry('Eggs', payload('2026-11-17'));
    mockCreate
      .mockRejectedValueOnce(new ApiError('Food or variant not found', 400))
      .mockRejectedValueOnce(new ApiError('Bad gateway', 502));

    const result = await flushOfflineFoodQueue();

    expect(result).toMatchObject({ sent: 0, dropped: 1, remaining: 1 });
    expect((await getQueuedFoodEntries())[0].foodName).toBe('Eggs');
  });
});
