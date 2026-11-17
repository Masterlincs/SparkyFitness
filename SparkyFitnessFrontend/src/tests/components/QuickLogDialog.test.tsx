import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import QuickLogDialog from '@/components/FoodSearch/QuickLogDialog';
import {
  useMatchQuickLogMutation,
  useSubmitQuickLogMutation,
} from '@/hooks/Foods/useQuickLog';

jest.mock('@/hooks/Foods/useQuickLog', () => ({
  useMatchQuickLogMutation: jest.fn(),
  useSubmitQuickLogMutation: jest.fn(),
}));
jest.mock('@/hooks/Diary/useMealTypes', () => ({
  useMealTypes: () => ({
    data: [
      { id: 'breakfast-id', name: 'Breakfast', sort_order: 1, user_id: null },
    ],
  }),
}));
jest.mock('@/hooks/AI/useAIServiceSettings', () => ({
  useUserAIPreferences: () => ({ data: { voice_input_enabled: false } }),
}));
jest.mock('@/hooks/AI/useVoiceInput', () => ({
  useVoiceInput: () => ({ busy: false, cancel: jest.fn() }),
}));
jest.mock('@/components/ai/VoiceInputControl', () => ({
  VoiceInputControl: () => null,
}));
const openChat = jest.fn();
jest.mock('@/contexts/ChatbotVisibilityContext', () => ({
  useChatbotVisibility: () => ({ openChat }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    getEnergyUnitString: () => 'kcal',
  }),
}));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, options?: Record<string, unknown>) =>
      Object.entries(options ?? {}).reduce(
        (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
        fallback
      ),
    i18n: { language: 'en' },
  }),
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

describe('QuickLogDialog', () => {
  const match = { mutateAsync: jest.fn(), isPending: false };
  const submit = { mutateAsync: jest.fn(), isPending: false };

  beforeEach(() => {
    jest.clearAllMocks();
    (useMatchQuickLogMutation as jest.Mock).mockReturnValue(match);
    (useSubmitQuickLogMutation as jest.Mock).mockReturnValue(submit);
    match.mutateAsync.mockResolvedValue({
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
        {
          phrase: {
            raw: 'a gobstopper',
            quantity: 1,
            unit: null,
            size: null,
            name: 'gobstopper',
            note: null,
          },
          match: null,
          alternatives: [],
        },
      ],
    });
    submit.mutateAsync.mockResolvedValue({});
  });

  const renderDialog = () =>
    render(
      <QuickLogDialog
        open
        onOpenChange={jest.fn()}
        mealType="breakfast"
        date="2026-11-17"
      />
    );

  it('matches text and logs the chosen portions to the meal', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('What did you eat?'), {
      target: { value: 'two eggs and a gobstopper' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Find foods/ }));

    expect(await screen.findByText('two eggs')).toBeInTheDocument();
    expect(screen.getByText(/No match found/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Log 1 foods (144 kcal)' })
    );

    await waitFor(() =>
      expect(submit.mutateAsync).toHaveBeenCalledWith({
        entry_date: '2026-11-17',
        meal_type_id: 'breakfast-id',
        items: [
          {
            source: 'intake24',
            provider_external_id: 'BOEG',
            serving_size: 1,
            serving_unit: 'medium egg (50 g)',
            quantity: 2,
          },
        ],
      })
    );
  });

  it('hands what it could not match to Sparky', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('What did you eat?'), {
      target: { value: 'two eggs and a gobstopper' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Find foods/ }));
    await screen.findByText('two eggs');
    fireEvent.click(screen.getByRole('button', { name: /Ask Sparky instead/ }));

    expect(openChat).toHaveBeenCalledWith(
      'Log for breakfast on 2026-11-17: a gobstopper'
    );
  });
});
