import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import errorHandler from '../middleware/errorHandler.js';
import shoppingListRoutes from '../routes/v2/shoppingListRoutes.js';
import * as repo from '../models/shoppingListRepository.js';
import * as service from '../services/shoppingListService.js';

vi.mock('../models/shoppingListRepository.js', () => ({
  getShoppingListItems: vi.fn(),
  createShoppingListItem: vi.fn(),
  updateShoppingListItem: vi.fn(),
  deleteShoppingListItem: vi.fn(),
  deleteCheckedShoppingListItems: vi.fn(),
}));
vi.mock('../services/shoppingListService.js', () => ({
  addMealPlanToShoppingList: vi.fn(),
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
app.use('/api/v2/shopping-list', shoppingListRoutes);
app.use(errorHandler);

const ITEM_ID = uuidv4();
const item = {
  id: ITEM_ID,
  name: 'Eggs',
  quantity: 12,
  unit: null,
  food_id: null,
  source: 'manual' as const,
  checked: false,
  created_at: '2026-11-17T10:00:00.000Z',
  updated_at: '2026-11-17T10:00:00.000Z',
};

describe('Shopping list routes (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists items for the active profile as the signed-in person', async () => {
    vi.mocked(repo.getShoppingListItems).mockResolvedValue([item]);

    const res = await request(app).get('/api/v2/shopping-list');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([item]);
    expect(repo.getShoppingListItems).toHaveBeenCalledWith(
      'owner-id',
      'actor-id'
    );
  });

  it('adds an item and rejects a blank name', async () => {
    vi.mocked(repo.createShoppingListItem).mockResolvedValue(item);

    const ok = await request(app)
      .post('/api/v2/shopping-list')
      .send({ name: '  Eggs ', quantity: 12 });
    const blank = await request(app)
      .post('/api/v2/shopping-list')
      .send({ name: '   ' });

    expect(ok.status).toBe(201);
    expect(repo.createShoppingListItem).toHaveBeenCalledWith(
      'owner-id',
      'actor-id',
      { name: 'Eggs', quantity: 12 }
    );
    expect(blank.status).toBe(400);
  });

  it('ticks an item off, and answers 404 for a missing one', async () => {
    vi.mocked(repo.updateShoppingListItem)
      .mockResolvedValueOnce({ ...item, checked: true })
      .mockResolvedValueOnce(null);

    const ok = await request(app)
      .patch(`/api/v2/shopping-list/${ITEM_ID}`)
      .send({ checked: true });
    const missing = await request(app)
      .patch(`/api/v2/shopping-list/${uuidv4()}`)
      .send({ checked: true });

    expect(ok.body.checked).toBe(true);
    expect(missing.status).toBe(404);
  });

  it('refuses an empty update or a malformed id', async () => {
    const empty = await request(app)
      .patch(`/api/v2/shopping-list/${ITEM_ID}`)
      .send({});
    const badId = await request(app)
      .delete('/api/v2/shopping-list/not-a-uuid')
      .send();

    expect(empty.status).toBe(400);
    expect(badId.status).toBe(400);
    expect(repo.updateShoppingListItem).not.toHaveBeenCalled();
  });

  it('deletes one item or every checked item', async () => {
    vi.mocked(repo.deleteShoppingListItem).mockResolvedValue(true);
    vi.mocked(repo.deleteCheckedShoppingListItems).mockResolvedValue(3);

    const one = await request(app).delete(`/api/v2/shopping-list/${ITEM_ID}`);
    const checked = await request(app).delete('/api/v2/shopping-list/checked');

    expect(one.status).toBe(204);
    expect(checked.body).toEqual({ deleted: 3 });
  });

  it('adds a meal plan, or answers 404 when it is not visible', async () => {
    const templateId = uuidv4();
    vi.mocked(service.addMealPlanToShoppingList)
      .mockResolvedValueOnce({ added: 1, updated: 0, items: [item] })
      .mockResolvedValueOnce(null);

    const ok = await request(app)
      .post('/api/v2/shopping-list/from-meal-plan')
      .send({ template_id: templateId });
    const missing = await request(app)
      .post('/api/v2/shopping-list/from-meal-plan')
      .send({ template_id: templateId });
    const invalid = await request(app)
      .post('/api/v2/shopping-list/from-meal-plan')
      .send({ template_id: 'nope' });

    expect(ok.body.added).toBe(1);
    expect(service.addMealPlanToShoppingList).toHaveBeenCalledWith(
      'owner-id',
      'actor-id',
      templateId
    );
    expect(missing.status).toBe(404);
    expect(invalid.status).toBe(400);
  });
});
