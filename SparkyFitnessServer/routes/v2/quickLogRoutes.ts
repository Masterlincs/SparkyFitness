import express from 'express';
import { quickLogBodySchema, quickLogMatchBodySchema } from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import foodEntryService from '../../services/foodEntryService.js';
import { clearUserTdeeCache } from '../../services/AdaptiveTdeeService.js';
import {
  getDatasetPortion,
  matchFoodPhrases,
} from '../../services/foodPhraseMatchService.js';

const router = express.Router();

router.use(authenticate);
router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('diary'));

// Snapshot columns a dataset portion can fill; the rest stay empty.
const SNAPSHOT_NUTRIENTS = [
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

/**
 * @swagger
 * /v2/quick-log/match:
 *   post:
 *     summary: Find foods for a spoken or typed list
 *     description: Splits text such as "two eggs and a slice of toast" into items and finds a food and portion for each, from the person's library, Intake24 and CoFID. Nothing is logged.
 *     tags: [Nutrition & Meals]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text: { type: string, maxLength: 1000 }
 *     responses:
 *       200:
 *         description: One entry per item, each with a best match (or null) and alternatives
 *       400:
 *         description: Missing or overlong text
 */
router.post('/match', async (req, res, next) => {
  const parsed = quickLogMatchBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'text is required (up to 1000 characters)' });
  }
  try {
    res.json({ items: await matchFoodPhrases(req.userId, parsed.data.text) });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/quick-log:
 *   post:
 *     summary: Log several foods at once
 *     description: Library foods are logged against their saved portion. Intake24 and CoFID foods are re-read on the server and logged as diary snapshots without adding them to the library.
 *     tags: [Nutrition & Meals]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       201:
 *         description: The created diary entries
 *       400:
 *         description: Invalid body, or a dataset portion that no longer exists
 */
router.post('/', async (req, res, next) => {
  const parsed = quickLogBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid quick log request' });
  }
  const { entry_date, meal_type_id, items } = parsed.data;
  const actingUserId = req.originalUserId || req.userId;
  try {
    // Resolve every dataset portion before writing, so a stale item logs nothing.
    const resolved = await Promise.all(
      items.map(async (item) =>
        item.source === 'library'
          ? { item, portion: null }
          : {
              item,
              portion: await getDatasetPortion(
                item.source,
                item.provider_external_id,
                item.serving_unit,
                item.serving_size
              ),
            }
      )
    );
    if (
      resolved.some(
        ({ item, portion }) => item.source !== 'library' && !portion
      )
    ) {
      return res.status(400).json({
        error:
          'A selected portion is no longer available. Match the foods again.',
      });
    }

    const entries = [];
    for (const { item, portion } of resolved) {
      const base = {
        user_id: req.userId,
        entry_date,
        meal_type_id,
        quantity: item.quantity,
      };
      if (item.source === 'library') {
        entries.push(
          await foodEntryService.createFoodEntry(req.userId, actingUserId, {
            ...base,
            food_id: item.food_id,
            variant_id: item.variant_id,
            unit: item.unit,
          })
        );
      } else if (portion) {
        const nutrients = Object.fromEntries(
          SNAPSHOT_NUTRIENTS.map((key) => [key, portion.variant[key] ?? null])
        );
        entries.push(
          await foodEntryService.createFoodEntry(req.userId, actingUserId, {
            ...base,
            food_name: portion.food.name,
            brand_name: portion.food.brand,
            serving_size: Number(portion.variant.serving_size),
            serving_unit: portion.variant.serving_unit,
            unit: portion.variant.serving_unit,
            ...nutrients,
          })
        );
      }
    }
    clearUserTdeeCache(req.userId);
    res.status(201).json({ entries });
  } catch (error) {
    next(error);
  }
});

export default router;
