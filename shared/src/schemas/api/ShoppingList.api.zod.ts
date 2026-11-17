import { z } from 'zod';

// Matches the shopping_list_items column limits.
const MAX_QUANTITY = 99_999_999.99;

export const shoppingListItemSourceSchema = z.enum(['manual', 'meal_plan']);

export const createShoppingListItemBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().positive().max(MAX_QUANTITY).nullable().optional(),
  unit: z.string().trim().max(40).nullable().optional(),
  food_id: z.uuid().nullable().optional(),
});
export type CreateShoppingListItemBody = z.infer<
  typeof createShoppingListItemBodySchema
>;

export const updateShoppingListItemBodySchema = createShoppingListItemBodySchema
  .omit({ food_id: true })
  .partial()
  .extend({ checked: z.boolean().optional() })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Nothing to update',
  });
export type UpdateShoppingListItemBody = z.infer<
  typeof updateShoppingListItemBodySchema
>;

export const addMealPlanToShoppingListBodySchema = z.object({
  template_id: z.uuid(),
});
export type AddMealPlanToShoppingListBody = z.infer<
  typeof addMealPlanToShoppingListBodySchema
>;

export const shoppingListItemResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  food_id: z.string().nullable(),
  source: shoppingListItemSourceSchema,
  checked: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ShoppingListItemResponse = z.infer<
  typeof shoppingListItemResponseSchema
>;

export const addMealPlanToShoppingListResponseSchema = z.object({
  added: z.number().int(),
  updated: z.number().int(),
  items: z.array(shoppingListItemResponseSchema),
});
export type AddMealPlanToShoppingListResponse = z.infer<
  typeof addMealPlanToShoppingListResponseSchema
>;
