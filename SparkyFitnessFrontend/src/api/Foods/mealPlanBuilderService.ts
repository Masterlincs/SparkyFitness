import { api } from '@/api/api';
import type {
  AiMealPlanBody,
  BuiltMealSummary,
  GenerateMealPlanBody,
  GeneratedMealPlanResponse,
  StarterRecipeSummary,
} from '@workspace/shared';

export const fetchStarterRecipes = (): Promise<StarterRecipeSummary[]> =>
  api.get('/v2/meal-plan-builder/starter-recipes');

export const importStarterRecipe = (title: string): Promise<BuiltMealSummary> =>
  api.post('/v2/meal-plan-builder/starter-recipes/import', { body: { title } });

export const generateMealPlan = (
  body: GenerateMealPlanBody
): Promise<GeneratedMealPlanResponse> =>
  api.post('/v2/meal-plan-builder/generate', { body });

export const generateAiMealPlan = (
  body: AiMealPlanBody
): Promise<GeneratedMealPlanResponse> =>
  api.post('/v2/meal-plan-builder/ai', { body });
