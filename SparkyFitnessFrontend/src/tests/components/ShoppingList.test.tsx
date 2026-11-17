import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ShoppingList from '@/pages/Foods/ShoppingList';
import {
  useAddShoppingListItemMutation,
  useClearCheckedShoppingListMutation,
  useDeleteShoppingListItemMutation,
  useShoppingList,
  useUpdateShoppingListItemMutation,
} from '@/hooks/Foods/useShoppingList';

jest.mock('@/hooks/Foods/useShoppingList', () => ({
  useShoppingList: jest.fn(),
  useAddShoppingListItemMutation: jest.fn(),
  useUpdateShoppingListItemMutation: jest.fn(),
  useDeleteShoppingListItemMutation: jest.fn(),
  useClearCheckedShoppingListMutation: jest.fn(),
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

const item = (overrides: Record<string, unknown>) => ({
  id: 'id-1',
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

describe('ShoppingList', () => {
  const add = { mutateAsync: jest.fn(), isPending: false };
  const update = { mutate: jest.fn() };
  const remove = { mutate: jest.fn() };
  const clear = { mutate: jest.fn(), isPending: false };

  beforeEach(() => {
    jest.clearAllMocks();
    (useAddShoppingListItemMutation as jest.Mock).mockReturnValue(add);
    (useUpdateShoppingListItemMutation as jest.Mock).mockReturnValue(update);
    (useDeleteShoppingListItemMutation as jest.Mock).mockReturnValue(remove);
    (useClearCheckedShoppingListMutation as jest.Mock).mockReturnValue(clear);
  });

  it('lists items with their amounts and ticks one off', () => {
    (useShoppingList as jest.Mock).mockReturnValue({
      data: [
        item({
          id: 'a',
          name: 'Beef mince',
          quantity: 250,
          unit: 'g',
          source: 'meal_plan',
        }),
        item({ id: 'b', name: 'Milk', checked: true }),
      ],
      isLoading: false,
    });

    render(<ShoppingList />);

    expect(screen.getByText('250 g Beef mince')).toBeInTheDocument();
    expect(screen.getByText('Meal plan')).toBeInTheDocument();
    expect(screen.getByText('Clear ticked (1)')).toBeEnabled();
    fireEvent.click(screen.getByLabelText('250 g Beef mince'));
    expect(update.mutate).toHaveBeenCalledWith({
      id: 'a',
      body: { checked: true },
    });
  });

  it('adds a typed item and clears the field', async () => {
    (useShoppingList as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
    });
    add.mutateAsync.mockResolvedValue(undefined);

    render(<ShoppingList />);
    expect(screen.getByText(/Nothing to buy yet/)).toBeInTheDocument();

    const input = screen.getByLabelText('Item');
    fireEvent.change(input, { target: { value: '  Bread ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(add.mutateAsync).toHaveBeenCalledWith({
      name: 'Bread',
      quantity: null,
      unit: null,
    });
    await waitFor(() => expect(input).toHaveValue(''));
  });
});
