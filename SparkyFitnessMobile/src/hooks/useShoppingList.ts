import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import type {
  CreateShoppingListItemBody,
  ShoppingListItemResponse,
} from '@workspace/shared';
import {
  createShoppingListItem,
  deleteCheckedShoppingListItems,
  deleteShoppingListItem,
  fetchShoppingList,
  updateShoppingListItem,
} from '../services/api/shoppingListApi';
import { shoppingListQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

export function useShoppingList() {
  const query = useQuery({
    queryKey: shoppingListQueryKey,
    queryFn: fetchShoppingList,
  });
  useRefetchOnFocus(query.refetch);
  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useShoppingListMutations() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: shoppingListQueryKey });
  const showError = () =>
    Toast.show({
      type: 'error',
      text1: t('shoppingList.saveFailed', {
        defaultValue: 'Could not update the shopping list',
      }),
    });

  const addMutation = useMutation({
    mutationFn: (body: CreateShoppingListItemBody) =>
      createShoppingListItem(body),
    onSuccess: invalidate,
    onError: showError,
  });

  // Ticking an item off shows at once; a failure puts it back.
  const toggleMutation = useMutation({
    mutationFn: ({ id, checked }: { id: string; checked: boolean }) =>
      updateShoppingListItem(id, { checked }),
    onMutate: async ({ id, checked }) => {
      await queryClient.cancelQueries({ queryKey: shoppingListQueryKey });
      const previous =
        queryClient.getQueryData<ShoppingListItemResponse[]>(
          shoppingListQueryKey
        );
      queryClient.setQueryData<ShoppingListItemResponse[]>(
        shoppingListQueryKey,
        (items) =>
          items?.map((item) => (item.id === id ? { ...item, checked } : item))
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(shoppingListQueryKey, context.previous);
      }
      showError();
    },
    onSettled: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteShoppingListItem(id),
    onSuccess: invalidate,
    onError: showError,
  });

  const clearCheckedMutation = useMutation({
    mutationFn: deleteCheckedShoppingListItems,
    onSuccess: invalidate,
    onError: showError,
  });

  return { addMutation, toggleMutation, deleteMutation, clearCheckedMutation };
}
