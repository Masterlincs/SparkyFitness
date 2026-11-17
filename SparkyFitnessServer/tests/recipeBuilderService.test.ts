import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMealFromRecipe } from '../services/recipeBuilderService.js';
import { matchPhrase } from '../services/foodPhraseMatchService.js';
import foodCoreService from '../services/foodCoreService.js';
import mealService from '../services/mealService.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../services/foodPhraseMatchService.js', () => ({
  matchPhrase: vi.fn(),
}));
vi.mock('../services/foodCoreService.js', () => ({
  default: {
    createFood: vi.fn(),
    getFoodVariantsByFoodId: vi.fn(),
    bulkCreateFoodVariants: vi.fn(),
  },
}));
vi.mock('../services/mealService.js', () => ({
  default: { createMeal: vi.fn(async () => ({ id: 'meal-1' })) },
}));

const lamb = {
  source: 'intake24' as const,
  food_id: null,
  provider_external_id: 'LAMB',
  name: 'Lamb, neck, stewed',
  brand: 'Intake24 (UK)',
  variants: [
    {
      serving_size: 100,
      serving_unit: 'g',
      calories: 250,
      protein: 20,
      carbs: 0,
      fat: 19,
    },
    {
      serving_size: 1,
      serving_unit: 'chop (90 g)',
      calories: 225,
      protein: 18,
      carbs: 0,
      fat: 17,
    },
  ],
  variant_index: 0,
  quantity: 900,
};

describe('buildMealFromRecipe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(matchPhrase).mockImplementation(async (_userId, phrase) => ({
      phrase,
      match: phrase.name.includes('lamb') ? lamb : null,
      alternatives: [],
    }));
    vi.mocked(foodCoreService.createFood).mockResolvedValue({
      id: 'food-1',
    } as never);
    vi.mocked(foodCoreService.getFoodVariantsByFoodId).mockResolvedValue([
      { id: 'v-100g', serving_size: 100, serving_unit: 'g' },
    ] as never);
    vi.mocked(foodCoreService.bulkCreateFoodVariants).mockResolvedValue([
      { id: 'v-chop', serving_size: 1, serving_unit: 'chop (90 g)' },
    ] as never);
  });

  it('saves dataset foods with their portions and builds the meal', async () => {
    const built = await buildMealFromRecipe('user-1', {
      name: 'Lancashire Hotpot',
      servings: 4,
      ingredients: [
        '900 g neck of lamb',
        'salt and pepper to taste',
        '1 dragon fruit',
      ],
      notes: 'Bake it.',
    });

    expect(foodCoreService.createFood).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        name: 'Lamb, neck, stewed',
        provider_type: 'intake24',
        provider_external_id: 'LAMB',
        serving_size: 100,
        calories: 250,
      })
    );
    // Only the missing household portion is added.
    expect(
      vi.mocked(foodCoreService.bulkCreateFoodVariants).mock.calls[0][1]
    ).toEqual([
      expect.objectContaining({
        food_id: 'food-1',
        serving_unit: 'chop (90 g)',
      }),
    ]);
    const meal = vi.mocked(mealService.createMeal).mock.calls[0][1];
    expect(meal).toMatchObject({
      name: 'Lancashire Hotpot',
      total_servings: 4,
      serving_unit: 'serving',
    });
    expect(meal.foods).toEqual([
      expect.objectContaining({
        food_id: 'food-1',
        variant_id: 'v-100g',
        quantity: 900,
        unit: 'g',
        calories: 250,
      }),
    ]);
    expect(meal.notes).toContain('Bake it.');
    expect(meal.notes).toContain('- 1 dragon fruit');
    expect(built).toMatchObject({
      meal_id: 'meal-1',
      unmatched: ['1 dragon fruit'],
      // 900 g at 250 kcal/100 g over 4 servings.
      calories_per_serving: 563,
    });
  });

  it('refuses a recipe where nothing matched', async () => {
    await expect(
      buildMealFromRecipe('user-1', {
        name: 'Dragon fruit salad',
        servings: 2,
        ingredients: ['2 dragon fruit'],
      })
    ).rejects.toThrow('could be matched');
    expect(mealService.createMeal).not.toHaveBeenCalled();
  });
});
