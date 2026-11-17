import {
  addMealPlanItems,
  getMealComponents,
  getMealPlanLines,
  type MealComponent,
  type MealYield,
  type ShoppingListAddition,
} from '../models/shoppingListRepository.js';

// Meals inside meals are followed this deep, so a meal that contains itself
// cannot loop forever.
const MAX_MEAL_DEPTH = 4;

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Sums a week of a meal plan into shopping list lines: every food in the plan,
 * with saved meals expanded into their ingredients, totalled per food and unit.
 *
 * A meal's ingredients are scaled the way the diary logs a meal:
 * quantity / (serving size x total servings) of the whole recipe.
 */
export function totalMealPlanFoods(
  lines: Array<{
    item_type: 'food' | 'meal';
    food_id: string | null;
    food_name: string | null;
    meal_id: string | null;
    quantity: number | null;
    unit: string | null;
  }>,
  components: Map<string, MealComponent[]>,
  yields: Map<string, MealYield>
): ShoppingListAddition[] {
  const totals = new Map<string, ShoppingListAddition>();
  const addFood = (
    foodId: string | null,
    name: string | null,
    quantity: number | null,
    unit: string | null
  ) => {
    if (!name) return;
    const key = `${foodId ?? name.toLowerCase()}|${(unit ?? '').toLowerCase()}`;
    const current = totals.get(key);
    if (!current) {
      totals.set(key, {
        name,
        quantity: quantity === null ? null : quantity,
        unit,
        food_id: foodId,
      });
    } else if (current.quantity !== null && quantity !== null) {
      current.quantity += quantity;
    }
  };

  const addMeal = (mealId: string, multiplier: number, depth: number) => {
    if (depth > MAX_MEAL_DEPTH) return;
    for (const component of components.get(mealId) ?? []) {
      if (component.item_type === 'meal' && component.child_meal_id) {
        const child = yields.get(component.child_meal_id);
        const childMultiplier = child
          ? (component.quantity * multiplier) /
            (child.serving_size * child.total_servings)
          : multiplier;
        addMeal(component.child_meal_id, childMultiplier, depth + 1);
      } else {
        addFood(
          component.food_id,
          component.food_name,
          component.quantity * multiplier,
          component.unit
        );
      }
    }
  };

  for (const line of lines) {
    if (line.item_type === 'meal' && line.meal_id) {
      const mealYield = yields.get(line.meal_id) ?? {
        serving_size: 1,
        total_servings: 1,
      };
      const quantity = line.quantity ?? mealYield.serving_size;
      addMeal(
        line.meal_id,
        quantity / (mealYield.serving_size * mealYield.total_servings),
        1
      );
    } else {
      addFood(line.food_id, line.food_name, line.quantity, line.unit);
    }
  }

  return [...totals.values()].map((item) => ({
    ...item,
    quantity:
      item.quantity === null || item.quantity <= 0
        ? null
        : round1(item.quantity),
  }));
}

/**
 * Adds one week of a meal plan template to the shopping list. Returns null
 * when the template is not the user's (or not visible to the acting person).
 */
export async function addMealPlanToShoppingList(
  userId: string,
  authenticatedUserId: string,
  templateId: string
) {
  const lines = await getMealPlanLines(userId, authenticatedUserId, templateId);
  if (!lines) return null;

  // Collect every meal reachable from the plan, level by level.
  const components = new Map<string, MealComponent[]>();
  const yields = new Map<string, MealYield>();
  let pending = [
    ...new Set(
      lines.flatMap((line) =>
        line.item_type === 'meal' && line.meal_id ? [line.meal_id] : []
      )
    ),
  ];
  for (let depth = 0; depth < MAX_MEAL_DEPTH && pending.length > 0; depth++) {
    const loaded = await getMealComponents(
      userId,
      authenticatedUserId,
      pending
    );
    for (const [id, value] of loaded.components) components.set(id, value);
    for (const [id, value] of loaded.yields) yields.set(id, value);
    pending = [
      ...new Set(
        [...loaded.components.values()]
          .flat()
          .flatMap((component) =>
            component.child_meal_id && !yields.has(component.child_meal_id)
              ? [component.child_meal_id]
              : []
          )
      ),
    ];
  }

  const additions = totalMealPlanFoods(lines, components, yields);
  return addMealPlanItems(userId, authenticatedUserId, additions);
}
