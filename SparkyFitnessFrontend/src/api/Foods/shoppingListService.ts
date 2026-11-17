import { api, apiCall } from '@/api/api';
import type {
  AddMealPlanToShoppingListResponse,
  CreateShoppingListItemBody,
  ShoppingListItemResponse,
  UpdateShoppingListItemBody,
} from '@workspace/shared';

export const fetchShoppingList = (): Promise<ShoppingListItemResponse[]> =>
  api.get('/v2/shopping-list');

export const createShoppingListItem = (
  body: CreateShoppingListItemBody
): Promise<ShoppingListItemResponse> => api.post('/v2/shopping-list', { body });

export const updateShoppingListItem = (
  id: string,
  body: UpdateShoppingListItemBody
): Promise<ShoppingListItemResponse> =>
  apiCall(`/v2/shopping-list/${id}`, { method: 'PATCH', body });

export const deleteShoppingListItem = (id: string): Promise<void> =>
  api.delete(`/v2/shopping-list/${id}`);

export const deleteCheckedShoppingListItems = (): Promise<{
  deleted: number;
}> => api.delete('/v2/shopping-list/checked');

export const addMealPlanToShoppingList = (
  templateId: string
): Promise<AddMealPlanToShoppingListResponse> =>
  api.post('/v2/shopping-list/from-meal-plan', {
    body: { template_id: templateId },
  });
