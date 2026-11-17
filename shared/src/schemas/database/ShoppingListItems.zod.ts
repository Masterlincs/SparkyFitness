import { z } from 'zod';

export const shoppingListItemsSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  food_id: z.string().nullable(),
  source: z.enum(['manual', 'meal_plan']),
  checked: z.boolean(),
  created_at: z.date(),
  updated_at: z.date(),
});
