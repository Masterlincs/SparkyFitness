import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import QuickLogScreen from '../../src/screens/QuickLogScreen';
import {
  matchQuickLogText,
  submitQuickLog,
} from '../../src/services/api/quickLogApi';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/services/api/quickLogApi', () => ({
  matchQuickLogText: jest.fn(),
  submitQuickLog: jest.fn(),
}));
jest.mock('../../src/hooks', () => ({
  useMealTypes: () => ({
    mealTypes: [
      {
        id: 'mt-breakfast',
        name: 'breakfast',
        sort_order: 1,
        is_visible: true,
      },
    ],
    defaultMealTypeId: 'mt-breakfast',
  }),
}));
jest.mock('../../src/hooks/invalidateFoodCache', () => ({
  invalidateFoodCache: jest.fn(),
}));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/components/ServerGate', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../src/components/chat/SystemVoiceDictationButton', () => ({
  __esModule: true,
  default: () => null,
}));

const egg = {
  source: 'intake24',
  food_id: null,
  provider_external_id: 'BOEG',
  name: 'Boiled eggs',
  brand: 'Intake24 (UK)',
  variants: [
    {
      serving_size: 100,
      serving_unit: 'g',
      calories: 143,
      protein: 12.5,
      carbs: 0,
      fat: 10,
    },
    {
      serving_size: 1,
      serving_unit: 'medium egg (50 g)',
      calories: 72,
      protein: 6.3,
      carbs: 0,
      fat: 5,
    },
  ],
  variant_index: 1,
  quantity: 2,
};

const goBack = jest.fn();
const renderScreen = () =>
  render(
    <QuickLogScreen
      {...({
        navigation: { goBack },
        route: { params: { date: '2026-11-17' } },
      } as unknown as RootStackScreenProps<'QuickLog'>)}
    />
  );

beforeAll(async () => {
  await initializeI18n();
});
beforeEach(() => {
  jest.clearAllMocks();
  (matchQuickLogText as jest.Mock).mockResolvedValue({
    items: [
      {
        phrase: {
          raw: 'two eggs',
          quantity: 2,
          unit: null,
          size: null,
          name: 'eggs',
          note: null,
        },
        match: egg,
        alternatives: [],
      },
    ],
  });
  (submitQuickLog as jest.Mock).mockResolvedValue({});
});

describe('QuickLogScreen', () => {
  it('matches what was typed and logs the chosen portion', async () => {
    renderScreen();
    fireEvent.changeText(
      screen.getByLabelText('What did you eat?'),
      'two eggs'
    );
    fireEvent.press(screen.getByText('Find foods'));

    expect(await screen.findByText('two eggs')).toBeTruthy();
    expect(screen.getByText('Boiled eggs')).toBeTruthy();
    fireEvent.press(screen.getByText('Log 1 food (144 kcal)'));

    await waitFor(() => expect(goBack).toHaveBeenCalled());
    expect(submitQuickLog).toHaveBeenCalledWith({
      entry_date: '2026-11-17',
      meal_type_id: 'mt-breakfast',
      items: [
        {
          source: 'intake24',
          provider_external_id: 'BOEG',
          serving_size: 1,
          serving_unit: 'medium egg (50 g)',
          quantity: 2,
        },
      ],
    });
  });
});
