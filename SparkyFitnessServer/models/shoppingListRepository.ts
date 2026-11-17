import type { PoolClient } from 'pg';
import { getClient } from '../db/poolManager.js';
import type {
  CreateShoppingListItemBody,
  ShoppingListItemResponse,
  UpdateShoppingListItemBody,
} from '@workspace/shared';

const ITEM_COLUMNS =
  'id, name, quantity, unit, food_id, source, checked, created_at, updated_at';

function mapRow(row: Record<string, unknown>): ShoppingListItemResponse {
  return {
    id: String(row.id),
    name: String(row.name),
    quantity:
      row.quantity === null || row.quantity === undefined
        ? null
        : Number(row.quantity),
    unit: row.unit ? String(row.unit) : null,
    food_id: row.food_id ? String(row.food_id) : null,
    source: row.source === 'meal_plan' ? 'meal_plan' : 'manual',
    checked: Boolean(row.checked),
    created_at: new Date(row.created_at as string).toISOString(),
    updated_at: new Date(row.updated_at as string).toISOString(),
  };
}

// Unchecked first, then in the order they were added.
export async function getShoppingListItems(
  userId: string,
  authenticatedUserId: string
): Promise<ShoppingListItemResponse[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `SELECT ${ITEM_COLUMNS} FROM shopping_list_items
       WHERE user_id = $1
       ORDER BY checked ASC, created_at ASC, id ASC`,
      [userId]
    );
    return result.rows.map(mapRow);
  } finally {
    client.release();
  }
}

export async function createShoppingListItem(
  userId: string,
  authenticatedUserId: string,
  body: CreateShoppingListItemBody
): Promise<ShoppingListItemResponse> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `INSERT INTO shopping_list_items (user_id, name, quantity, unit, food_id, source)
       VALUES ($1, $2, $3, $4, $5, 'manual')
       RETURNING ${ITEM_COLUMNS}`,
      [
        userId,
        body.name,
        body.quantity ?? null,
        body.unit || null,
        body.food_id ?? null,
      ]
    );
    return mapRow(result.rows[0]);
  } finally {
    client.release();
  }
}

export async function updateShoppingListItem(
  userId: string,
  authenticatedUserId: string,
  itemId: string,
  body: UpdateShoppingListItemBody
): Promise<ShoppingListItemResponse | null> {
  const sets: string[] = [];
  const values: unknown[] = [itemId, userId];
  const set = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  if (body.name !== undefined) set('name', body.name);
  if (body.quantity !== undefined) set('quantity', body.quantity);
  if (body.unit !== undefined) set('unit', body.unit || null);
  if (body.checked !== undefined) set('checked', body.checked);

  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `UPDATE shopping_list_items SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING ${ITEM_COLUMNS}`,
      values
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function deleteShoppingListItem(
  userId: string,
  authenticatedUserId: string,
  itemId: string
): Promise<boolean> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      'DELETE FROM shopping_list_items WHERE id = $1 AND user_id = $2',
      [itemId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export async function deleteCheckedShoppingListItems(
  userId: string,
  authenticatedUserId: string
): Promise<number> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      'DELETE FROM shopping_list_items WHERE user_id = $1 AND checked = TRUE',
      [userId]
    );
    return result.rowCount ?? 0;
  } finally {
    client.release();
  }
}

/** One line of a meal plan as stored: a food, or a saved meal to expand. */
export interface MealPlanLine {
  item_type: 'food' | 'meal';
  food_id: string | null;
  food_name: string | null;
  meal_id: string | null;
  quantity: number | null;
  unit: string | null;
}

export interface MealComponent {
  item_type: 'food' | 'meal';
  food_id: string | null;
  food_name: string | null;
  child_meal_id: string | null;
  quantity: number;
  unit: string;
}

export interface MealYield {
  serving_size: number;
  total_servings: number;
}

interface MealPlanRow {
  food_id: string | null;
  food_name: string | null;
  meal_id: string | null;
  quantity: string | number | null;
  unit: string | null;
}

/** Reads a meal plan template's lines, or null when it is not visible. */
export async function getMealPlanLines(
  userId: string,
  authenticatedUserId: string,
  templateId: string
): Promise<MealPlanLine[] | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const template = await client.query(
      'SELECT id FROM meal_plan_templates WHERE id = $1 AND user_id = $2',
      [templateId, userId]
    );
    if (template.rowCount === 0) return null;
    const result = await client.query(
      `SELECT a.item_type, a.food_id, f.name AS food_name, a.meal_id,
              a.quantity, a.unit
       FROM meal_plan_template_assignments a
       LEFT JOIN foods f ON f.id = a.food_id
       WHERE a.template_id = $1
       ORDER BY a.day_of_week, a.id`,
      [templateId]
    );
    return result.rows.map((row: MealPlanRow): MealPlanLine => ({
      item_type: row.meal_id ? 'meal' : 'food',
      food_id: row.food_id,
      food_name: row.food_name,
      meal_id: row.meal_id,
      quantity: row.quantity === null ? null : Number(row.quantity),
      unit: row.unit,
    }));
  } finally {
    client.release();
  }
}

/** Reads the components and yield of the given meals. */
export async function getMealComponents(
  userId: string,
  authenticatedUserId: string,
  mealIds: string[]
): Promise<{
  components: Map<string, MealComponent[]>;
  yields: Map<string, MealYield>;
}> {
  const components = new Map<string, MealComponent[]>();
  const yields = new Map<string, MealYield>();
  if (mealIds.length === 0) return { components, yields };
  const client = await getClient(userId, authenticatedUserId);
  try {
    const meals = await client.query(
      'SELECT id, serving_size, total_servings FROM meals WHERE id = ANY($1)',
      [mealIds]
    );
    for (const row of meals.rows) {
      yields.set(String(row.id), {
        serving_size: Number(row.serving_size) || 1,
        total_servings: Number(row.total_servings) || 1,
      });
    }
    const result = await client.query(
      `SELECT mf.meal_id, mf.item_type, mf.food_id, f.name AS food_name,
              mf.child_meal_id, mf.quantity, mf.unit
       FROM meal_foods mf
       LEFT JOIN foods f ON f.id = mf.food_id
       WHERE mf.meal_id = ANY($1)
       ORDER BY mf.created_at, mf.id`,
      [mealIds]
    );
    for (const row of result.rows) {
      const list = components.get(String(row.meal_id)) ?? [];
      list.push({
        item_type: row.child_meal_id ? 'meal' : 'food',
        food_id: row.food_id,
        food_name: row.food_name,
        child_meal_id: row.child_meal_id,
        quantity: Number(row.quantity),
        unit: String(row.unit),
      });
      components.set(String(row.meal_id), list);
    }
    return { components, yields };
  } finally {
    client.release();
  }
}

export interface ShoppingListAddition {
  name: string;
  quantity: number | null;
  unit: string | null;
  food_id: string | null;
}

/**
 * Adds meal-plan items in one transaction. An unchecked item for the same food
 * and unit has its quantity increased instead of being listed twice.
 */
export async function addMealPlanItems(
  userId: string,
  authenticatedUserId: string,
  additions: ShoppingListAddition[]
): Promise<{
  added: number;
  updated: number;
  items: ShoppingListItemResponse[];
}> {
  const client: PoolClient = await getClient(userId, authenticatedUserId);
  try {
    await client.query('BEGIN');
    let added = 0;
    let updated = 0;
    for (const item of additions) {
      const existing = item.food_id
        ? await client.query(
            `SELECT id FROM shopping_list_items
             WHERE user_id = $1 AND food_id = $2 AND checked = FALSE
               AND COALESCE(lower(unit), '') = COALESCE(lower($3::text), '')
             LIMIT 1 FOR UPDATE`,
            [userId, item.food_id, item.unit]
          )
        : { rows: [] };
      if (existing.rows[0]) {
        await client.query(
          `UPDATE shopping_list_items
           SET quantity = CASE WHEN quantity IS NULL OR $2::numeric IS NULL
                               THEN COALESCE(quantity, $2::numeric)
                               ELSE quantity + $2::numeric END,
               updated_at = now()
           WHERE id = $1`,
          [existing.rows[0].id, item.quantity]
        );
        updated += 1;
      } else {
        await client.query(
          `INSERT INTO shopping_list_items (user_id, name, quantity, unit, food_id, source)
           VALUES ($1, $2, $3, $4, $5, 'meal_plan')`,
          [userId, item.name, item.quantity, item.unit, item.food_id]
        );
        added += 1;
      }
    }
    await client.query('COMMIT');
    const result = await client.query(
      `SELECT ${ITEM_COLUMNS} FROM shopping_list_items
       WHERE user_id = $1
       ORDER BY checked ASC, created_at ASC, id ASC`,
      [userId]
    );
    return { added, updated, items: result.rows.map(mapRow) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
