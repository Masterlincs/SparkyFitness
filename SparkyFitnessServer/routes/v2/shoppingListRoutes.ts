import express from 'express';
import {
  addMealPlanToShoppingListBodySchema,
  createShoppingListItemBodySchema,
  updateShoppingListItemBodySchema,
} from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import {
  createShoppingListItem,
  deleteCheckedShoppingListItems,
  deleteShoppingListItem,
  getShoppingListItems,
  updateShoppingListItem,
} from '../../models/shoppingListRepository.js';
import { addMealPlanToShoppingList } from '../../services/shoppingListService.js';

const router = express.Router();

router.use(authenticate);
router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('diary'));

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @swagger
 * /v2/shopping-list:
 *   get:
 *     summary: List shopping list items, unchecked first
 *     tags: [Nutrition & Meals]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The items
 *       403:
 *         description: Missing diary permission
 *   post:
 *     summary: Add an item to the shopping list
 *     tags: [Nutrition & Meals]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               quantity: { type: number, nullable: true }
 *               unit: { type: string, nullable: true }
 *               food_id: { type: string, format: uuid, nullable: true }
 *     responses:
 *       201:
 *         description: The new item
 *       400:
 *         description: Invalid body
 */
router.get('/', async (req, res, next) => {
  try {
    res.json(
      await getShoppingListItems(
        req.userId,
        req.authenticatedUserId || req.userId
      )
    );
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  const parsed = createShoppingListItemBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid shopping list item' });
  }
  try {
    const item = await createShoppingListItem(
      req.userId,
      req.authenticatedUserId || req.userId,
      parsed.data
    );
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/shopping-list/from-meal-plan:
 *   post:
 *     summary: Add a week of a meal plan template to the shopping list
 *     description: Saved meals are expanded into their ingredients and totalled per food and unit. An unchecked item for the same food and unit has its quantity increased.
 *     tags: [Nutrition & Meals]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [template_id]
 *             properties:
 *               template_id: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Counts of added and updated items, and the whole list
 *       400:
 *         description: Invalid body
 *       404:
 *         description: Meal plan not found
 */
router.post('/from-meal-plan', async (req, res, next) => {
  const parsed = addMealPlanToShoppingListBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'template_id must be a UUID' });
  }
  try {
    const result = await addMealPlanToShoppingList(
      req.userId,
      req.authenticatedUserId || req.userId,
      parsed.data.template_id
    );
    if (!result) {
      return res.status(404).json({ error: 'Meal plan not found' });
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/shopping-list/checked:
 *   delete:
 *     summary: Remove every checked item
 *     tags: [Nutrition & Meals]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: How many items were removed
 */
router.delete('/checked', async (req, res, next) => {
  try {
    const deleted = await deleteCheckedShoppingListItems(
      req.userId,
      req.authenticatedUserId || req.userId
    );
    res.json({ deleted });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/shopping-list/{id}:
 *   patch:
 *     summary: Change an item or tick it off
 *     tags: [Nutrition & Meals]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: The updated item
 *       400:
 *         description: Invalid body or id
 *       404:
 *         description: Item not found
 *   delete:
 *     summary: Remove an item
 *     tags: [Nutrition & Meals]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Removed
 *       404:
 *         description: Item not found
 */
router.patch('/:id', async (req, res, next) => {
  if (!UUID_PATTERN.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid item id' });
  }
  const parsed = updateShoppingListItemBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid shopping list item' });
  }
  try {
    const item = await updateShoppingListItem(
      req.userId,
      req.authenticatedUserId || req.userId,
      req.params.id,
      parsed.data
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  if (!UUID_PATTERN.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid item id' });
  }
  try {
    const deleted = await deleteShoppingListItem(
      req.userId,
      req.authenticatedUserId || req.userId,
      req.params.id
    );
    if (!deleted) return res.status(404).json({ error: 'Item not found' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
