import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import errorHandler from '../middleware/errorHandler.js';
import quickLogRoutes from '../routes/v2/quickLogRoutes.js';
import foodEntryService from '../services/foodEntryService.js';
import * as matchService from '../services/foodPhraseMatchService.js';

vi.mock('../services/foodEntryService.js', () => ({
  default: { createFoodEntry: vi.fn() },
}));
vi.mock('../services/AdaptiveTdeeService.js', () => ({
  clearUserTdeeCache: vi.fn(),
}));
vi.mock('../services/foodPhraseMatchService.js', () => ({
  matchFoodPhrases: vi.fn(),
  getDatasetPortion: vi.fn(),
}));
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'owner-id';
    req.authenticatedUserId = 'owner-id';
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
app.use('/api/v2/quick-log', quickLogRoutes);
app.use(errorHandler);

const MEAL_TYPE = uuidv4();
const FOOD = uuidv4();
const VARIANT = uuidv4();

describe('Quick log routes (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(foodEntryService.createFoodEntry).mockImplementation(
      async (_a, _b, data) => ({ id: uuidv4(), ...data })
    );
  });

  it('matches text and rejects an empty request', async () => {
    vi.mocked(matchService.matchFoodPhrases).mockResolvedValue([]);

    const ok = await request(app)
      .post('/api/v2/quick-log/match')
      .send({ text: 'two eggs' });
    const empty = await request(app)
      .post('/api/v2/quick-log/match')
      .send({ text: '  ' });

    expect(ok.body).toEqual({ items: [] });
    expect(matchService.matchFoodPhrases).toHaveBeenCalledWith(
      'owner-id',
      'two eggs'
    );
    expect(empty.status).toBe(400);
  });

  it('logs library foods by variant and dataset foods as server-read snapshots', async () => {
    vi.mocked(matchService.getDatasetPortion).mockResolvedValue({
      food: { name: 'Boiled eggs', brand: 'Intake24 (UK)' },
      variant: {
        serving_size: 1,
        serving_unit: 'medium egg (50 g)',
        calories: 72,
        protein: 6.3,
        carbs: 0,
        fat: 5,
      },
    } as never);

    const res = await request(app)
      .post('/api/v2/quick-log')
      .send({
        entry_date: '2026-11-17',
        meal_type_id: MEAL_TYPE,
        items: [
          {
            source: 'library',
            food_id: FOOD,
            variant_id: VARIANT,
            quantity: 1,
            unit: 'slice',
          },
          {
            source: 'intake24',
            provider_external_id: 'BOEG',
            serving_size: 1,
            serving_unit: 'medium egg (50 g)',
            quantity: 2,
            // Posted nutrition is ignored; the server re-reads the portion.
            calories: 9999,
          },
        ],
      });

    expect(res.status).toBe(201);
    const calls = vi.mocked(foodEntryService.createFoodEntry).mock.calls;
    expect(calls[0][2]).toMatchObject({
      food_id: FOOD,
      variant_id: VARIANT,
      quantity: 1,
      unit: 'slice',
      meal_type_id: MEAL_TYPE,
    });
    expect(calls[1][2]).toMatchObject({
      food_name: 'Boiled eggs',
      serving_unit: 'medium egg (50 g)',
      quantity: 2,
      calories: 72,
    });
    expect(calls[1][2]).not.toHaveProperty('food_id');
  });

  it('logs nothing when a dataset portion is gone', async () => {
    vi.mocked(matchService.getDatasetPortion).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v2/quick-log')
      .send({
        entry_date: '2026-11-17',
        meal_type_id: MEAL_TYPE,
        items: [
          {
            source: 'cofid',
            provider_external_id: '13-532',
            serving_size: 100,
            serving_unit: 'g',
            quantity: 200,
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(foodEntryService.createFoodEntry).not.toHaveBeenCalled();
  });
});
