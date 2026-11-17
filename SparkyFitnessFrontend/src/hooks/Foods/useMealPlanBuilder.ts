import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import i18n from 'i18next';
import type { AiMealPlanBody, GenerateMealPlanBody } from '@workspace/shared';
import {
  fetchStarterRecipes,
  generateAiMealPlan,
  generateMealPlan,
  importStarterRecipe,
} from '@/api/Foods/mealPlanBuilderService';
import { foodKeys, mealKeys, mealPlanKeys } from '@/api/keys/meals';

const starterRecipeKeys = { all: ['starterRecipes'] as const };

export const useStarterRecipes = (enabled: boolean) =>
  useQuery({
    queryKey: starterRecipeKeys.all,
    queryFn: fetchStarterRecipes,
    enabled,
    staleTime: 60 * 60 * 1000,
    meta: {
      errorMessage: i18n.t(
        'mealPlanBuilder.failedToLoadRecipes',
        'Could not load starter recipes from Wikibooks.'
      ),
    },
  });

// New meals and their saved foods appear in the meal and food libraries.
const useInvalidateLibrary = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: mealKeys.all });
    queryClient.invalidateQueries({ queryKey: mealPlanKeys.all });
    queryClient.invalidateQueries({ queryKey: foodKeys.all });
  };
};

export const useImportStarterRecipeMutation = () => {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (title: string) => importStarterRecipe(title),
    onSuccess: invalidate,
    meta: {
      errorMessage: i18n.t(
        'mealPlanBuilder.failedToImport',
        'Could not import that recipe.'
      ),
    },
  });
};

export const useGenerateMealPlanMutation = () => {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (body: GenerateMealPlanBody) => generateMealPlan(body),
    onSuccess: invalidate,
  });
};

export const useAiMealPlanMutation = () => {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (body: AiMealPlanBody) => generateAiMealPlan(body),
    onSuccess: invalidate,
  });
};
