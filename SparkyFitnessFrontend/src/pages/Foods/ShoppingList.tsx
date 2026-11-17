import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardCopy, ShoppingCart, Trash2 } from 'lucide-react';
import type { ShoppingListItemResponse } from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import {
  useAddShoppingListItemMutation,
  useClearCheckedShoppingListMutation,
  useDeleteShoppingListItemMutation,
  useShoppingList,
  useUpdateShoppingListItemMutation,
} from '@/hooks/Foods/useShoppingList';

/** "250 g Beef mince", "12 Eggs", or just the name. */
function shoppingItemLabel(item: ShoppingListItemResponse): string {
  const amount =
    item.quantity === null
      ? ''
      : `${Number.isInteger(item.quantity) ? item.quantity : item.quantity.toFixed(1)}${item.unit ? ` ${item.unit}` : ''} `;
  return `${amount}${item.name}`;
}

const ShoppingList = () => {
  const { t } = useTranslation();
  const { data: items = [], isLoading } = useShoppingList();
  const addItem = useAddShoppingListItemMutation();
  const updateItem = useUpdateShoppingListItemMutation();
  const deleteItem = useDeleteShoppingListItemMutation();
  const clearChecked = useClearCheckedShoppingListMutation();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');

  const checkedCount = items.filter((item) => item.checked).length;

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const amount = Number(quantity);
    await addItem.mutateAsync({
      name: trimmed,
      quantity: quantity.trim() && amount > 0 ? amount : null,
      unit: unit.trim() || null,
    });
    setName('');
    setQuantity('');
    setUnit('');
  };

  const handleCopy = async () => {
    const text = items
      .filter((item) => !item.checked)
      .map((item) => `- ${shoppingItemLabel(item)}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: t('shoppingList.copied', 'Shopping list copied'),
      });
    } catch {
      toast({
        title: t('shoppingList.copyFailed', 'Could not copy the list'),
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          {t('shoppingList.title', 'Shopping list')}
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={items.length === checkedCount}
          >
            <ClipboardCopy className="mr-2 h-4 w-4" />
            {t('shoppingList.copy', 'Copy list')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearChecked.mutate()}
            disabled={checkedCount === 0 || clearChecked.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t('shoppingList.clearChecked', 'Clear ticked ({{count}})', {
              count: checkedCount,
            })}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={handleAdd}
          className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_6rem_6rem_auto]"
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('shoppingList.itemPlaceholder', 'Add an item')}
            aria-label={t('shoppingList.itemLabel', 'Item')}
            maxLength={200}
          />
          <Input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder={t('shoppingList.quantityPlaceholder', 'Qty')}
            aria-label={t('shoppingList.quantityLabel', 'Quantity')}
            inputMode="decimal"
            className="hidden sm:block"
          />
          <Input
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            placeholder={t('shoppingList.unitPlaceholder', 'Unit')}
            aria-label={t('shoppingList.unitLabel', 'Unit')}
            maxLength={40}
            className="hidden sm:block"
          />
          <Button type="submit" disabled={!name.trim() || addItem.isPending}>
            {t('shoppingList.add', 'Add')}
          </Button>
        </form>

        {isLoading ? null : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t(
              'shoppingList.empty',
              'Nothing to buy yet. Add items here, or choose "Add to shopping list" on a meal plan.'
            )}
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                <Checkbox
                  id={`shopping-${item.id}`}
                  checked={item.checked}
                  onCheckedChange={(checked) =>
                    updateItem.mutate({
                      id: item.id,
                      body: { checked: checked === true },
                    })
                  }
                />
                <label
                  htmlFor={`shopping-${item.id}`}
                  className={`flex-1 cursor-pointer text-sm ${item.checked ? 'text-muted-foreground line-through' : ''}`}
                >
                  {shoppingItemLabel(item)}
                </label>
                {item.source === 'meal_plan' && (
                  <Badge variant="secondary" className="text-[10px]">
                    {t('shoppingList.fromMealPlan', 'Meal plan')}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => deleteItem.mutate(item.id)}
                  aria-label={t('shoppingList.remove', 'Remove {{name}}', {
                    name: item.name,
                  })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default ShoppingList;
