import { apiFetch } from './apiClient';
import type {
  CreateShoppingListItemBody,
  ShoppingListItemResponse,
  UpdateShoppingListItemBody,
} from '@workspace/shared';

const SERVICE = 'Shopping List API';

export const fetchShoppingList = (): Promise<ShoppingListItemResponse[]> =>
  apiFetch<ShoppingListItemResponse[]>({
    endpoint: '/api/v2/shopping-list',
    serviceName: SERVICE,
    operation: 'fetch shopping list',
  });

export const createShoppingListItem = (
  body: CreateShoppingListItemBody
): Promise<ShoppingListItemResponse> =>
  apiFetch<ShoppingListItemResponse>({
    endpoint: '/api/v2/shopping-list',
    method: 'POST',
    body,
    serviceName: SERVICE,
    operation: 'add shopping list item',
  });

export const updateShoppingListItem = (
  id: string,
  body: UpdateShoppingListItemBody
): Promise<ShoppingListItemResponse> =>
  apiFetch<ShoppingListItemResponse>({
    endpoint: `/api/v2/shopping-list/${encodeURIComponent(id)}`,
    method: 'PATCH',
    body,
    serviceName: SERVICE,
    operation: 'update shopping list item',
  });

export const deleteShoppingListItem = (id: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/v2/shopping-list/${encodeURIComponent(id)}`,
    method: 'DELETE',
    serviceName: SERVICE,
    operation: 'delete shopping list item',
  });

export const deleteCheckedShoppingListItems = (): Promise<{
  deleted: number;
}> =>
  apiFetch<{ deleted: number }>({
    endpoint: '/api/v2/shopping-list/checked',
    method: 'DELETE',
    serviceName: SERVICE,
    operation: 'clear checked shopping list items',
  });
