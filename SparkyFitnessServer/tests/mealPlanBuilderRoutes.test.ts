import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';
import routes from '../routes/v2/mealPlanBuilderRoutes.js';
import * as library from '../services/recipeLibraryService.js';
import * as builder from '../services/mealPlanBuilderService.js';

vi.mock('../services/recipeLibraryService.js', () => ({
  listStarterRecipes: vi.fn(),
  importStarterRecipe: vi.fn(),
}));
vi.mock('../services/mealPlanBuilderService.js', () => {
  class NotEnoughMealsError extends Error {}
  class NoAiServiceError extends Error {}
  class AiPlanError extends Error {}
  return {
    NotEnoughMealsError,
    NoAiServiceError,
    AiPlanError,
    generateMealPlan: vi.fn(),
    generateAiMealPlan: vi.fn(),
  };
});
vi.mock('../utils/adminCheck.js', () => ({
  resolveIsAdmin: vi.fn(async () => false),
}));
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'owner-id';
    req.authenticatedUserId = 'actor-id';
    next();
  },
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(
    () =>
      (
        _req: express.Request,
        _res: express.Response,
        next: express.NextFunction
      ) =>
        next()
  ),
}));
vi.mock('../middleware/onBehalfOfMiddleware.js', () => ({
  default: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

const app = express();
app.use(express.json());
app.use('/api/v2/meal-plan-builder', routes);
app.use(errorHandler);

const template = { id: 'tpl-1', plan_name: 'Generated plan' };

describe('Meal plan builder routes (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists and imports starter recipes', async () => {
    vi.mocked(library.listStarterRecipes).mockResolvedValue([]);
    vi.mocked(library.importStarterRecipe)
      .mockResolvedValueOnce({ meal_id: 'm1' } as never)
      .mockResolvedValueOnce(null);

    expect(
      (await request(app).get('/api/v2/meal-plan-builder/starter-recipes')).body
    ).toEqual([]);
    const ok = await request(app)
      .post('/api/v2/meal-plan-builder/starter-recipes/import')
      .send({ title: 'Cookbook:Trifle' });
    const missing = await request(app)
      .post('/api/v2/meal-plan-builder/starter-recipes/import')
      .send({ title: 'Cookbook:Nope' });

    expect(ok.status).toBe(201);
    expect(library.importStarterRecipe).toHaveBeenCalledWith(
      'owner-id',
      'Cookbook:Trifle'
    );
    expect(missing.status).toBe(404);
  });

  it('generates a plan, or explains when there are no meals', async () => {
    vi.mocked(builder.generateMealPlan)
      .mockResolvedValueOnce({
        template,
        daily_target: 2000,
        assignments: [{}, {}],
      } as never)
      .mockRejectedValueOnce(
        new builder.NotEnoughMealsError('Save some meals first')
      );

    const ok = await request(app)
      .post('/api/v2/meal-plan-builder/generate')
      .send({ start_date: '2026-11-23', calorie_target: 1800 });
    const empty = await request(app)
      .post('/api/v2/meal-plan-builder/generate')
      .send({ start_date: '2026-11-23' });
    const invalid = await request(app)
      .post('/api/v2/meal-plan-builder/generate')
      .send({ start_date: 'soon', calorie_target: 100 });

    expect(ok.status).toBe(201);
    expect(ok.body).toEqual({
      template_id: 'tpl-1',
      plan_name: 'Generated plan',
      daily_target: 2000,
      assignments: 2,
    });
    expect(builder.generateMealPlan).toHaveBeenCalledWith('owner-id', {
      startDate: '2026-11-23',
      calorieTarget: 1800,
      name: undefined,
    });
    expect(empty.status).toBe(422);
    expect(invalid.status).toBe(400);
  });

  it('runs the AI plan as the signed-in person and maps its failures', async () => {
    vi.mocked(builder.generateAiMealPlan)
      .mockResolvedValueOnce({
        template,
        daily_target: 2000,
        meals: [{}],
        failed: [],
      } as never)
      .mockRejectedValueOnce(
        new builder.NoAiServiceError('Set up an AI service')
      )
      .mockRejectedValueOnce(new builder.AiPlanError('no recipes'));

    const ok = await request(app)
      .post('/api/v2/meal-plan-builder/ai')
      .send({ start_date: '2026-11-23', preferences: 'vegetarian' });
    const noService = await request(app)
      .post('/api/v2/meal-plan-builder/ai')
      .send({ start_date: '2026-11-23' });
    const failed = await request(app)
      .post('/api/v2/meal-plan-builder/ai')
      .send({ start_date: '2026-11-23' });

    expect(ok.status).toBe(201);
    expect(builder.generateAiMealPlan).toHaveBeenCalledWith(
      'owner-id',
      'actor-id',
      false,
      {
        startDate: '2026-11-23',
        calorieTarget: undefined,
        preferences: 'vegetarian',
      }
    );
    expect(noService.status).toBe(409);
    expect(failed.status).toBe(502);
  });
});
