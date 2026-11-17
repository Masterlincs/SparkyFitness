import { describe, expect, it, vi } from 'vitest';
import { guessSlot, planWeek } from '../services/mealPlanBuilderService.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

describe('guessSlot', () => {
  it.each([
    ['Porridge with banana', 'breakfast'],
    ['Welsh Cakes', 'snacks'],
    ['Cullen Skink (Haddock and Potato Soup)', 'lunch'],
    ['Lancashire Hotpot', 'dinner'],
    ['Mystery dish', null],
  ])('%s -> %s', (name, slot) => {
    expect(guessSlot(name)).toBe(slot);
  });
});

describe('planWeek', () => {
  const meals = [
    { id: 'porridge', name: 'Porridge', calories: 300 },
    { id: 'eggs', name: 'Scrambled eggs on toast', calories: 450 },
    { id: 'soup', name: 'Leek soup', calories: 300 },
    { id: 'hotpot', name: 'Lancashire hotpot', calories: 600 },
    { id: 'pie', name: 'Steak pie', calories: 700 },
    { id: 'flapjack', name: 'Flapjack', calories: 200 },
  ];

  it('fills each day with every slot that has a suitable meal', () => {
    const plan = planWeek(meals, 2000);

    expect(plan).toHaveLength(28);
    for (let day = 0; day < 7; day++) {
      expect(
        plan.filter((a) => a.day_of_week === day).map((a) => a.meal_type)
      ).toEqual(['breakfast', 'lunch', 'dinner', 'snacks']);
    }
    expect(
      plan.filter((a) => a.meal_type === 'breakfast').map((a) => a.meal_id)
    ).toEqual(expect.arrayContaining(['porridge', 'eggs']));
  });

  it('scales servings by halves towards each slot target', () => {
    const plan = planWeek(meals, 2000);
    const lunch = plan.find(
      (a) => a.meal_type === 'lunch' && a.day_of_week === 0
    );
    // Lunch aims at 600 kcal: two servings of a 300 kcal soup.
    expect(lunch).toMatchObject({ meal_id: 'soup', quantity: 2 });
    for (const assignment of plan) {
      expect(assignment.quantity * 2).toBe(Math.round(assignment.quantity * 2));
      expect(assignment.quantity).toBeGreaterThanOrEqual(0.5);
      expect(assignment.quantity).toBeLessThanOrEqual(2);
    }
  });

  it('alternates dinners rather than repeating one every day', () => {
    const dinners = planWeek(meals, 2000)
      .filter((a) => a.meal_type === 'dinner')
      .map((a) => a.meal_id);

    expect(new Set(dinners).size).toBeGreaterThan(1);
    for (let i = 1; i < dinners.length; i++) {
      expect(dinners[i]).not.toBe(dinners[i - 1]);
    }
  });

  it('uses unlabelled meals for lunch and dinner, and plans nothing without meals', () => {
    const plan = planWeek(
      [{ id: 'x', name: 'Mystery dish', calories: 500 }],
      2000
    );

    expect(new Set(plan.map((a) => a.meal_type))).toEqual(
      new Set(['lunch', 'dinner'])
    );
    expect(planWeek([], 2000)).toEqual([]);
  });

  it('honours a slot given by the recipe over the name', () => {
    const plan = planWeek(
      [{ id: 'p', name: 'Steak pie', calories: 300, slot: 'breakfast' }],
      2000
    );
    expect(plan.every((a) => a.meal_type === 'breakfast')).toBe(true);
  });
});
