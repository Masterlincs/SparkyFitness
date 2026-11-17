import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import i18n from 'i18next';
import type {
  CreateShoppingListItemBody,
  ShoppingListItemResponse,
  UpdateShoppingListItemBody,
} from '@workspace/shared';
import {
  addMealPlanToShoppingList,
  createShoppingListItem,
  deleteCheckedShoppingListItems,
  deleteShoppingListItem,
  fetchShoppingList,
  updateShoppingListItem,
} from '@/api/Foods/shoppingListService';
import { shoppingListKeys } from '@/api/keys/shoppingList';

export const useShoppingList = () =>
  useQuery({
    queryKey: shoppingListKeys.all,
    queryFn: fetchShoppingList,
    meta: {
      errorMessage: i18n.t(
        'shoppingList.failedToLoad',
        'Failed to load the shopping list.'
      ),
    },
  });

const useInvalidateShoppingList = () => {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: shoppingListKeys.all });
};

export const useAddShoppingListItemMutation = () => {
  const invalidate = useInvalidateShoppingList();
  return useMutation({
    mutationFn: (body: CreateShoppingListItemBody) =>
      createShoppingListItem(body),
    onSuccess: invalidate,
    meta: {
      errorMessage: i18n.t(
        'shoppingList.failedToAdd',
        'Failed to add the item.'
      ),
    },
  });
};

// Ticking an item off updates the cached list straight away, so the checkbox
// does not wait for the server.
export const useUpdateShoppingListItemMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpdateShoppingListItemBody;
    }) => updateShoppingListItem(id, body),
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: shoppingListKeys.all });
      const previous = queryClient.getQueryData<ShoppingListItemResponse[]>(
        shoppingListKeys.all
      );
      queryClient.setQueryData<ShoppingListItemResponse[]>(
        shoppingListKeys.all,
        (items) =>
          items?.map((item) =>
            item.id === id
              ? {
                  ...item,
                  ...(body.name !== undefined ? { name: body.name } : {}),
                  ...(body.checked !== undefined
                    ? { checked: body.checked }
                    : {}),
                  ...(body.quantity !== undefined
                    ? { quantity: body.quantity }
                    : {}),
                  ...(body.unit !== undefined ? { unit: body.unit } : {}),
                }
              : item
          )
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(shoppingListKeys.all, context.previous);
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: shoppingListKeys.all }),
    meta: {
      errorMessage: i18n.t(
        'shoppingList.failedToUpdate',
        'Failed to update the item.'
      ),
    },
  });
};

export const useDeleteShoppingListItemMutation = () => {
  const invalidate = useInvalidateShoppingList();
  return useMutation({
    mutationFn: (id: string) => deleteShoppingListItem(id),
    onSuccess: invalidate,
    meta: {
      errorMessage: i18n.t(
        'shoppingList.failedToDelete',
        'Failed to remove the item.'
      ),
    },
  });
};

export const useClearCheckedShoppingListMutation = () => {
  const invalidate = useInvalidateShoppingList();
  return useMutation({
    mutationFn: deleteCheckedShoppingListItems,
    onSuccess: invalidate,
    meta: {
      errorMessage: i18n.t(
        'shoppingList.failedToClear',
        'Failed to clear checked items.'
      ),
    },
  });
};

export const useAddMealPlanToShoppingListMutation = () => {
  const invalidate = useInvalidateShoppingList();
  return useMutation({
    mutationFn: (templateId: string) => addMealPlanToShoppingList(templateId),
    onSuccess: invalidate,
    meta: {
      errorMessage: i18n.t(
        'shoppingList.failedToAddMealPlan',
        'Failed to add the meal plan to the shopping list.'
      ),
    },
  });
};
