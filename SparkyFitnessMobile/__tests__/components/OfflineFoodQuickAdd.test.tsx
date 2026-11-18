import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import OfflineFoodQuickAdd from '../../src/components/OfflineFoodQuickAdd';
import {
  getQueuedFoodEntries,
  loadOfflineFoodSnapshot,
  queueFoodEntry,
} from '../../src/services/offlineFoodLog';

jest.mock('../../src/services/offlineFoodLog', () => ({
  getQueuedFoodEntries: jest.fn(),
  loadOfflineFoodSnapshot: jest.fn(),
  queueFoodEntry: jest.fn(),
}));

const snapshot = {
  version: 1,
  savedAt: '2026-11-17T08:00:00.000Z',
  mealTypes: [
    { id: 'mt-breakfast', name: 'breakfast', sort_order: 1, is_visible: true },
    { id: 'mt-lunch', name: 'lunch', sort_order: 2, is_visible: true },
  ],
  foods: [
    {
      id: 'f-toast',
      name: 'Toast, white bread',
      brand: null,
      is_custom: false,
      default_variant: {
        id: 'v-slice',
        serving_size: 1,
        serving_unit: 'slice (27 g)',
        calories: 79,
        protein: 2.5,
        carbs: 15,
        fat: 0.8,
      },
    },
    {
      id: 'f-beans',
      name: 'Baked beans',
      brand: 'Heinz',
      is_custom: false,
      default_variant: {
        id: 'v-100g',
        serving_size: 100,
        serving_unit: 'g',
        calories: 76,
        protein: 5,
        carbs: 13,
        fat: 0.4,
      },
    },
  ],
};

describe('OfflineFoodQuickAdd', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getQueuedFoodEntries as jest.Mock).mockResolvedValue([{ id: 'q1' }]);
    (queueFoodEntry as jest.Mock).mockResolvedValue({ id: 'q2' });
  });

  it('logs a saved food into the queue for the chosen meal', async () => {
    (loadOfflineFoodSnapshot as jest.Mock).mockResolvedValue(snapshot);
    const onQueued = jest.fn();
    render(
      <OfflineFoodQuickAdd
        date="2026-11-17"
        mealTypeId="mt-breakfast"
        onQueued={onQueued}
      />
    );

    expect(
      await screen.findByText(
        '1 food is waiting to be sent when you are back online.'
      )
    ).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Filter foods'), 'beans');
    expect(screen.queryByText('Toast, white bread')).toBeNull();
    fireEvent.press(screen.getByText('Baked beans'));
    fireEvent.changeText(screen.getByLabelText('Amount'), '200');
    fireEvent.press(screen.getByText('Log offline'));

    await waitFor(() => expect(onQueued).toHaveBeenCalled());
    expect(queueFoodEntry).toHaveBeenCalledWith('Baked beans', {
      food_id: 'f-beans',
      variant_id: 'v-100g',
      meal_type_id: 'mt-breakfast',
      quantity: 200,
      unit: 'g',
      entry_date: '2026-11-17',
    });
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ text1: 'Saved on your phone' })
    );
  });

  it('explains how to get foods offline when none are saved', async () => {
    (loadOfflineFoodSnapshot as jest.Mock).mockResolvedValue(null);
    render(<OfflineFoodQuickAdd onQueued={jest.fn()} />);

    expect(
      await screen.findByText(/Search foods once while connected/)
    ).toBeTruthy();
  });
});
