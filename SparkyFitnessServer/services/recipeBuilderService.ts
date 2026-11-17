import {
  parseFoodPhrase,
  type QuickLogCandidate,
  type QuickLogVariant,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import foodCoreService from './foodCoreService.js';
import mealService from './mealService.js';
import { matchPhrase } from './foodPhraseMatchService.js';

// Turns a recipe written as ingredient lines (a Wikibooks recipe, or one an AI
// assistant wrote) into a saved meal: each line is read, matched to a food in
// the person's library or the UK datasets, and dataset foods are saved to the
// library first, because a meal's ingredients must be library foods.

export interface IngredientRecipe {
  name: string;
  servings: number;
  ingredients: string[];
  /** Method and source, kept on the meal as its markdown note. */
  notes?: string | null;
}

export interface BuiltMealIngredient {
  line: string;
  food: string;
  quantity: number;
  unit: string;
}

export interface BuiltMeal {
  meal_id: string;
  name: string;
  servings: number;
  ingredients: BuiltMealIngredient[];
  /** Lines with no food match, left out of the meal and listed in its note. */
  unmatched: string[];
  /** Calories in one serving, from the matched ingredients. */
  calories_per_serving: number;
}

// Lines that are seasoning or water: worth no calories and rarely matched well.
const SKIP_LINE =
  /^(?:salt|pepper|salt and pepper|water|boiling water|cold water|ice|seasoning)\b|\bto taste\b/i;

const VARIANT_NUTRIENTS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'saturated_fat',
  'polyunsaturated_fat',
  'monounsaturated_fat',
  'trans_fat',
  'cholesterol',
  'sodium',
  'potassium',
  'dietary_fiber',
  'sugars',
  'vitamin_a',
  'vitamin_c',
  'calcium',
  'iron',
  'water_ml',
  'alcohol_g',
] as const;

function nutrientsOf(variant: QuickLogVariant) {
  return Object.fromEntries(
    VARIANT_NUTRIENTS.map((key) => {
      const value = variant[key];
      return [key, typeof value === 'number' ? value : null];
    })
  );
}

const samePortion = (
  a: { serving_size: unknown; serving_unit: unknown },
  b: { serving_size: unknown; serving_unit: unknown }
) =>
  Number(a.serving_size) === Number(b.serving_size) &&
  String(a.serving_unit) === String(b.serving_unit);

interface SavedVariant {
  id: string;
  serving_size: number | string;
  serving_unit: string;
}

/**
 * Returns the library food and saved variant for a candidate, saving a dataset
 * food with all its portions the first time. A food saved before (same source
 * and id) is reused by createFood's provider de-duplication.
 */
export async function ensureLibraryFood(
  userId: string,
  candidate: QuickLogCandidate
): Promise<{
  foodId: string;
  variantId: string;
  variant: QuickLogVariant;
  quantity: number;
}> {
  const chosen = candidate.variants[candidate.variant_index];
  if (!chosen) throw new Error(`No portion chosen for ${candidate.name}`);
  if (candidate.source === 'library') {
    if (!candidate.food_id || !chosen.id) {
      throw new Error(`Library food ${candidate.name} has no saved portion`);
    }
    return {
      foodId: candidate.food_id,
      variantId: String(chosen.id),
      variant: chosen,
      quantity: candidate.quantity,
    };
  }

  const base = candidate.variants[0] ?? chosen;
  const food = (await foodCoreService.createFood(userId, {
    user_id: userId,
    name: candidate.name,
    brand: candidate.brand,
    serving_size: base.serving_size,
    serving_unit: base.serving_unit,
    ...nutrientsOf(base),
    source: 'imported',
    provider_type: candidate.source,
    provider_external_id: candidate.provider_external_id,
    is_custom: false,
  })) as { id: string };

  const existing = ((await foodCoreService.getFoodVariantsByFoodId(
    userId,
    food.id
  )) ?? []) as SavedVariant[];
  const missing = candidate.variants.filter(
    (variant) => !existing.some((saved) => samePortion(saved, variant))
  );
  let saved = existing;
  if (missing.length > 0) {
    try {
      const created = ((await foodCoreService.bulkCreateFoodVariants(
        userId,
        missing.map((variant) => ({
          food_id: food.id,
          serving_size: variant.serving_size,
          serving_unit: variant.serving_unit,
          ...nutrientsOf(variant),
          is_default: false,
          source: 'imported',
        }))
      )) ?? []) as SavedVariant[];
      saved = [...existing, ...created];
    } catch (error) {
      log('warn', `Could not save portions for ${candidate.name}:`, error);
    }
  }

  const match =
    saved.find((variant) => samePortion(variant, chosen)) ??
    saved.find((variant) => samePortion(variant, base));
  if (!match) throw new Error(`Could not save a portion for ${candidate.name}`);
  if (samePortion(match, chosen)) {
    return {
      foodId: food.id,
      variantId: match.id,
      variant: chosen,
      quantity: candidate.quantity,
    };
  }
  // The chosen portion could not be saved: use the per-100 g base, with the
  // portion's weight from its label ("medium egg (50 g)").
  const grams = Number(/\(([\d.]+)\s*g\)/.exec(chosen.serving_unit)?.[1]);
  const quantity =
    (candidate.quantity / (chosen.serving_size || 1)) *
    (Number.isFinite(grams) && grams > 0 ? grams : base.serving_size);
  return {
    foodId: food.id,
    variantId: match.id,
    variant: base,
    quantity: Math.round(quantity * 10) / 10,
  };
}

/** Builds and saves a meal from a recipe's ingredient lines. */
export async function buildMealFromRecipe(
  userId: string,
  recipe: IngredientRecipe
): Promise<BuiltMeal> {
  const servings =
    Number.isFinite(recipe.servings) && recipe.servings > 0
      ? Math.round(recipe.servings)
      : 1;
  const ingredients: BuiltMealIngredient[] = [];
  const unmatched: string[] = [];
  const mealFoods: Array<Record<string, unknown>> = [];
  let totalCalories = 0;

  for (const line of recipe.ingredients) {
    const phrase = parseFoodPhrase(line);
    if (!phrase.name || SKIP_LINE.test(phrase.name)) continue;
    const { match } = await matchPhrase(userId, phrase);
    if (!match) {
      unmatched.push(line);
      continue;
    }
    try {
      const saved = await ensureLibraryFood(userId, match);
      const quantity = saved.quantity;
      const servingSize = saved.variant.serving_size || 1;
      mealFoods.push({
        item_type: 'food',
        food_id: saved.foodId,
        variant_id: saved.variantId,
        quantity,
        unit: saved.variant.serving_unit,
        serving_size: saved.variant.serving_size,
        serving_unit: saved.variant.serving_unit,
        ...nutrientsOf(saved.variant),
      });
      totalCalories += (saved.variant.calories * quantity) / servingSize;
      ingredients.push({
        line,
        food: match.name,
        quantity,
        unit: saved.variant.serving_unit,
      });
    } catch (error) {
      log('warn', `Recipe ingredient "${line}" could not be saved:`, error);
      unmatched.push(line);
    }
  }

  if (mealFoods.length === 0) {
    throw new Error(`No ingredients of "${recipe.name}" could be matched`);
  }

  const noteParts = [recipe.notes?.trim()].filter(Boolean) as string[];
  if (unmatched.length > 0) {
    noteParts.push(
      `**Not matched (left out of the nutrition):**\n${unmatched
        .map((line) => `- ${line}`)
        .join('\n')}`
    );
  }

  const meal = (await mealService.createMeal(userId, {
    name: recipe.name.slice(0, 200),
    notes: noteParts.join('\n\n') || null,
    serving_size: 1,
    serving_unit: 'serving',
    total_servings: servings,
    foods: mealFoods as Array<{
      quantity: number;
      unit: string;
      [key: string]: unknown;
    }>,
  })) as { id: string };

  return {
    meal_id: meal.id,
    name: recipe.name,
    servings,
    ingredients,
    unmatched,
    calories_per_serving: Math.round(totalCalories / servings),
  };
}
