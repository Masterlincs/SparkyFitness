import express from 'express';
import {
  aiMealPlanBodySchema,
  generateMealPlanBodySchema,
  importStarterRecipeBodySchema,
  type GeneratedMealPlanResponse,
} from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import checkPermissionMiddleware from '../../middleware/checkPermissionMiddleware.js';
import { resolveIsAdmin } from '../../utils/adminCheck.js';
import {
  importStarterRecipe,
  listStarterRecipes,
} from '../../services/recipeLibraryService.js';
import {
  AiPlanError,
  NoAiServiceError,
  NotEnoughMealsError,
  generateAiMealPlan,
  generateMealPlan,
} from '../../services/mealPlanBuilderService.js';

const router = express.Router();

router.use(authenticate);
router.use(onBehalfOfMiddleware);
router.use(checkPermissionMiddleware('diary'));

const planResponse = (
  template: { id: string; plan_name: string },
  dailyTarget: number,
  assignments: number
): GeneratedMealPlanResponse => ({
  template_id: template.id,
  plan_name: template.plan_name,
  daily_target: dailyTarget,
  assignments,
});

/**
 * @swagger
 * /v2/meal-plan-builder/starter-recipes:
 *   get:
 *     summary: List British and Irish starter recipes (Wikibooks Cookbook, CC BY-SA 4.0)
 *     tags: [Nutrition & Meals]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Recipe titles, names and source pages
 *       502:
 *         description: Wikibooks could not be reached
 */
router.get('/starter-recipes', async (_req, res, next) => {
  try {
    res.json(await listStarterRecipes());
  } catch (error) {
    if (error instanceof Error && /Wikibooks/.test(error.message)) {
      return res.status(502).json({ error: 'Wikibooks could not be reached.' });
    }
    next(error);
  }
});

/**
 * @swagger
 * /v2/meal-plan-builder/starter-recipes/import:
 *   post:
 *     summary: Save a starter recipe as a meal, with its ingredients matched to UK foods
 *     tags: [Nutrition & Meals]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       201:
 *         description: The saved meal, its matched ingredients and any lines left out
 *       404:
 *         description: Not a listed starter recipe
 *       422:
 *         description: No ingredient could be matched
 */
router.post('/starter-recipes/import', async (req, res, next) => {
  const parsed = importStarterRecipeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'title is required' });
  }
  try {
    const meal = await importStarterRecipe(req.userId, parsed.data.title);
    if (!meal) return res.status(404).json({ error: 'Recipe not found' });
    res.status(201).json(meal);
  } catch (error) {
    if (
      error instanceof Error &&
      /could be matched|no ingredient/i.test(error.message)
    ) {
      return res.status(422).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /v2/meal-plan-builder/generate:
 *   post:
 *     summary: Generate an inactive weekly meal plan from saved meals
 *     description: Picks breakfast, lunch, dinner and snacks for seven days to suit the daily calorie target (the person's goal unless calorie_target is given), scaling servings by halves.
 *     tags: [Nutrition & Meals]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       201:
 *         description: The new meal plan template
 *       422:
 *         description: No saved meals to plan with
 */
router.post('/generate', async (req, res, next) => {
  const parsed = generateMealPlanBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid meal plan request' });
  }
  try {
    const result = await generateMealPlan(req.userId, {
      startDate: parsed.data.start_date,
      calorieTarget: parsed.data.calorie_target,
      name: parsed.data.name,
    });
    res
      .status(201)
      .json(
        planResponse(
          result.template,
          result.daily_target,
          result.assignments.length
        )
      );
  } catch (error) {
    if (error instanceof NotEnoughMealsError) {
      return res.status(422).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * @swagger
 * /v2/meal-plan-builder/ai:
 *   post:
 *     summary: Have the signed-in person's AI service write a week of recipes and plan them
 *     description: Recipes are saved as meals with ingredients matched to UK foods and labelled as AI-written. The plan is created inactive.
 *     tags: [Nutrition & Meals]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       201:
 *         description: The new meal plan template and the saved recipes
 *       409:
 *         description: No AI service is set up
 *       502:
 *         description: The AI service failed or returned nothing usable
 */
router.post('/ai', async (req, res, next) => {
  const parsed = aiMealPlanBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid meal plan request' });
  }
  try {
    const actorUserId = req.authenticatedUserId || req.userId;
    const result = await generateAiMealPlan(
      req.userId,
      actorUserId,
      await resolveIsAdmin(req.user, actorUserId),
      {
        startDate: parsed.data.start_date,
        calorieTarget: parsed.data.calorie_target,
        preferences: parsed.data.preferences,
      }
    );
    res.status(201).json({
      ...planResponse(
        result.template,
        result.daily_target,
        result.meals.length
      ),
      meals: result.meals,
      failed: result.failed,
    });
  } catch (error) {
    if (error instanceof NoAiServiceError) {
      return res.status(409).json({ error: error.message });
    }
    if (error instanceof AiPlanError) {
      return res.status(502).json({ error: error.message });
    }
    next(error);
  }
});

export default router;
