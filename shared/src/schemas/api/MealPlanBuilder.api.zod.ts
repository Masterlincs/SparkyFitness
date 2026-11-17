import { z } from 'zod';

// Starter recipes and generated weekly meal plans.

export const importStarterRecipeBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
});
export type ImportStarterRecipeBody = z.infer<
  typeof importStarterRecipeBodySchema
>;

const calorieTargetSchema = z.number().min(800).max(6000);

export const generateMealPlanBodySchema = z.object({
  start_date: z.iso.date(),
  calorie_target: calorieTargetSchema.optional(),
  name: z.string().trim().min(1).max(120).optional(),
});
export type GenerateMealPlanBody = z.infer<typeof generateMealPlanBodySchema>;

export const aiMealPlanBodySchema = z.object({
  start_date: z.iso.date(),
  calorie_target: calorieTargetSchema.optional(),
  preferences: z.string().trim().max(500).optional(),
});
export type AiMealPlanBody = z.infer<typeof aiMealPlanBodySchema>;

export interface StarterRecipeSummary {
  title: string;
  name: string;
  url: string;
}

export interface BuiltMealSummary {
  meal_id: string;
  name: string;
  servings: number;
  ingredients: Array<{
    line: string;
    food: string;
    quantity: number;
    unit: string;
  }>;
  unmatched: string[];
  calories_per_serving: number;
}

export interface GeneratedMealPlanResponse {
  template_id: string;
  plan_name: string;
  daily_target: number;
  assignments: number;
  meals?: BuiltMealSummary[];
  failed?: string[];
}
