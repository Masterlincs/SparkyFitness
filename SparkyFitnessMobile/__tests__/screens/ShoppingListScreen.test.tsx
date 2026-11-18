import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import ShoppingListScreen from '../../src/screens/ShoppingListScreen';
import {
  useShoppingList,
  useShoppingListMutations,
} from '../../src/hooks/useShoppingList';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/hooks/useShoppingList', () => ({
  useShoppingList: jest.fn(),
  useShoppingListMutations: jest.fn(),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));
jest.mock('../../src/components/ServerGate', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

const mutations = {
  addMutation: { mutate: jest.fn(), isPending: false },
  toggleMutation: { mutate: jest.fn() },
  deleteMutation: { mutate: jest.fn() },
  clearCheckedMutation: { mutate: jest.fn(), isPending: false },
};

const item = (overrides: Record<string, unknown>) => ({
  id: 'i1',
  name: 'Eggs',
  quantity: null,
  unit: null,
  food_id: null,
  source: 'manual',
  checked: false,
  created_at: '',
  updated_at: '',
  ...overrides,
});

const renderScreen = () =>
  render(
    <ShoppingListScreen
      {...({} as unknown as RootStackScreenProps<'ShoppingList'>)}
    />
  );

beforeAll(async () => {
  await initializeI18n();
});
beforeEach(() => {
  jest.clearAllMocks();
  (useShoppingListMutations as jest.Mock).mockReturnValue(mutations);
});

describe('ShoppingListScreen', () => {
  it('shows amounts and ticks an item off', () => {
    (useShoppingList as jest.Mock).mockReturnValue({
      items: [item({ id: 'a', name: 'Beef mince', quantity: 250, unit: 'g' })],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    renderScreen();

    fireEvent.press(screen.getByLabelText('250 g Beef mince'));
    expect(mutations.toggleMutation.mutate).toHaveBeenCalledWith({
      id: 'a',
      checked: true,
    });
    fireEvent.press(screen.getByLabelText('Remove Beef mince'));
    expect(mutations.deleteMutation.mutate).toHaveBeenCalledWith('a');
  });

  it('adds a typed item', () => {
    (useShoppingList as jest.Mock).mockReturnValue({
      items: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    renderScreen();

    expect(screen.getByText('Nothing to buy yet')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Add an item'), ' Bread ');
    fireEvent.press(screen.getByText('Add'));
    expect(mutations.addMutation.mutate).toHaveBeenCalledWith(
      { name: 'Bread' },
      expect.any(Object)
    );
  });
});
