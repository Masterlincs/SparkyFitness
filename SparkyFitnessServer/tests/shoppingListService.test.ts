import { describe, expect, it, vi } from 'vitest';
import { totalMealPlanFoods } from '../services/shoppingListService.js';
import type {
  MealComponent,
  MealYield,
} from '../models/shoppingListRepository.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));

const food = (
  food_id: string,
  food_name: string,
  quantity: number,
  unit: string
): MealComponent => ({
  item_type: 'food',
  food_id,
  food_name,
  child_meal_id: null,
  quantity,
  unit,
});

describe('totalMealPlanFoods', () => {
  it('totals plain foods per food and unit', () => {
    const result = totalMealPlanFoods(
      [
        {
          item_type: 'food',
          food_id: 'milk',
          food_name: 'Milk',
          meal_id: null,
          quantity: 200,
          unit: 'ml',
        },
        {
          item_type: 'food',
          food_id: 'milk',
          food_name: 'Milk',
          meal_id: null,
          quantity: 300,
          unit: 'ML',
        },
        {
          item_type: 'food',
          food_id: 'milk',
          food_name: 'Milk',
          meal_id: null,
          quantity: 1,
          unit: 'pint',
        },
      ],
      new Map(),
      new Map()
    );

    expect(result).toEqual([
      { name: 'Milk', quantity: 500, unit: 'ml', food_id: 'milk' },
      { name: 'Milk', quantity: 1, unit: 'pint', food_id: 'milk' },
    ]);
  });

  it('expands meals by the share of the recipe planned, including nested meals', () => {
    const components = new Map<string, MealComponent[]>([
      [
        'chilli',
        [
          food('mince', 'Beef mince', 500, 'g'),
          {
            item_type: 'meal',
            food_id: null,
            food_name: null,
            child_meal_id: 'sauce',
            quantity: 2,
            unit: 'serving',
          },
        ],
      ],
      ['sauce', [food('tomatoes', 'Chopped tomatoes', 400, 'g')]],
    ]);
    const yields = new Map<string, MealYield>([
      // A 4-serving chilli; the sauce recipe makes 4 servings too.
      ['chilli', { serving_size: 1, total_servings: 4 }],
      ['sauce', { serving_size: 1, total_servings: 4 }],
    ]);

    const result = totalMealPlanFoods(
      [
        {
          item_type: 'meal',
          food_id: null,
          food_name: null,
          meal_id: 'chilli',
          quantity: 2,
          unit: 'serving',
        },
      ],
      components,
      yields
    );

    expect(result).toEqual([
      // Half the recipe: 250 g mince, and half of 2 servings of sauce.
      { name: 'Beef mince', quantity: 250, unit: 'g', food_id: 'mince' },
      {
        name: 'Chopped tomatoes',
        quantity: 100,
        unit: 'g',
        food_id: 'tomatoes',
      },
    ]);
  });

  it('stops at a meal that contains itself', () => {
    const components = new Map<string, MealComponent[]>([
      [
        'loop',
        [
          food('rice', 'Rice', 100, 'g'),
          {
            item_type: 'meal',
            food_id: null,
            food_name: null,
            child_meal_id: 'loop',
            quantity: 1,
            unit: 'serving',
          },
        ],
      ],
    ]);
    const yields = new Map([['loop', { serving_size: 1, total_servings: 1 }]]);

    const result = totalMealPlanFoods(
      [
        {
          item_type: 'meal',
          food_id: null,
          food_name: null,
          meal_id: 'loop',
          quantity: 1,
          unit: 'serving',
        },
      ],
      components,
      yields
    );

    expect(result).toEqual([
      { name: 'Rice', quantity: 400, unit: 'g', food_id: 'rice' },
    ]);
  });
});
