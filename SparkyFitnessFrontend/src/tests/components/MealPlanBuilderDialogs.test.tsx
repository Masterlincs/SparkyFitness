import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import GenerateMealPlanDialog from '@/pages/Foods/GenerateMealPlanDialog';
import StarterRecipesDialog from '@/pages/Foods/StarterRecipesDialog';
import {
  useAiMealPlanMutation,
  useGenerateMealPlanMutation,
  useImportStarterRecipeMutation,
  useStarterRecipes,
} from '@/hooks/Foods/useMealPlanBuilder';

jest.mock('@/hooks/Foods/useMealPlanBuilder', () => ({
  useStarterRecipes: jest.fn(),
  useImportStarterRecipeMutation: jest.fn(),
  useGenerateMealPlanMutation: jest.fn(),
  useAiMealPlanMutation: jest.fn(),
}));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, options?: Record<string, unknown>) =>
      Object.entries(options ?? {}).reduce(
        (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
        fallback
      ),
  }),
}));

describe('GenerateMealPlanDialog', () => {
  const generate = { mutateAsync: jest.fn(), isPending: false };
  const ai = { mutateAsync: jest.fn(), isPending: false };

  beforeEach(() => {
    jest.clearAllMocks();
    (useGenerateMealPlanMutation as jest.Mock).mockReturnValue(generate);
    (useAiMealPlanMutation as jest.Mock).mockReturnValue(ai);
    generate.mutateAsync.mockResolvedValue({
      plan_name: 'Plan',
      daily_target: 1800,
    });
    ai.mutateAsync.mockResolvedValue({
      plan_name: 'AI plan',
      daily_target: 1800,
    });
  });

  it('generates from saved meals with the calorie target typed in', async () => {
    const onOpenChange = jest.fn();
    render(<GenerateMealPlanDialog open onOpenChange={onOpenChange} />);
    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-11-23' },
    });
    fireEvent.change(screen.getByLabelText('kcal a day (optional)'), {
      target: { value: '1800' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate plan' }));

    await waitFor(() =>
      expect(generate.mutateAsync).toHaveBeenCalledWith({
        start_date: '2026-11-23',
        calorie_target: 1800,
      })
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('sends preferences for an AI plan and ignores an impossible target', async () => {
    render(<GenerateMealPlanDialog open onOpenChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'AI-written recipes' }));
    fireEvent.change(screen.getByLabelText('Start date'), {
      target: { value: '2026-11-23' },
    });
    fireEvent.change(screen.getByLabelText('kcal a day (optional)'), {
      target: { value: '50' },
    });
    fireEvent.change(screen.getByLabelText('Preferences and allergies'), {
      target: { value: ' vegetarian ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate plan' }));

    await waitFor(() =>
      expect(ai.mutateAsync).toHaveBeenCalledWith({
        start_date: '2026-11-23',
        calorie_target: undefined,
        preferences: 'vegetarian',
      })
    );
  });
});

describe('StarterRecipesDialog', () => {
  it('filters recipes and shows what an import matched', async () => {
    const importRecipe = {
      mutateAsync: jest.fn().mockResolvedValue({
        meal_id: 'm1',
        name: 'Trifle',
        servings: 6,
        ingredients: [{ line: 'x', food: 'y', quantity: 1, unit: 'g' }],
        unmatched: ['1 glass sherry'],
        calories_per_serving: 320,
      }),
    };
    (useImportStarterRecipeMutation as jest.Mock).mockReturnValue(importRecipe);
    (useStarterRecipes as jest.Mock).mockReturnValue({
      isLoading: false,
      data: [
        {
          title: 'Cookbook:Trifle',
          name: 'Trifle',
          url: 'https://example.org/t',
        },
        {
          title: 'Cookbook:Welsh Cakes',
          name: 'Welsh Cakes',
          url: 'https://example.org/w',
        },
      ],
    });

    render(<StarterRecipesDialog open onOpenChange={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Filter recipes'), {
      target: { value: 'trif' },
    });
    expect(screen.queryByText('Welsh Cakes')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(
      await screen.findByText(
        /1 ingredients matched, about 320 kcal a serving\. Left out: 1 glass sherry/
      )
    ).toBeInTheDocument();
    expect(importRecipe.mutateAsync).toHaveBeenCalledWith('Cookbook:Trifle');
  });
});
