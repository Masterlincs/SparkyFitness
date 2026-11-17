import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStarterRecipeCache,
  importStarterRecipe,
  listStarterRecipes,
  parseWikibooksRecipe,
  stripWikiMarkup,
} from '../services/recipeLibraryService.js';
import { buildMealFromRecipe } from '../services/recipeBuilderService.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../services/recipeBuilderService.js', () => ({
  buildMealFromRecipe: vi.fn(async (_userId, recipe) => ({
    meal_id: 'm1',
    ...recipe,
  })),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const HOTPOT = `{{recipesummary
| category = Lamb recipes
| servings = 4–6
}}{{recipe}} | [[Cookbook:Cuisine of the United Kingdom|Cuisine of the United Kingdom]]

'''Lancashire hotpot''' is a baked dish.

==Ingredients==
*2 [[Cookbook:Pound|lb]] (900 [[Cookbook:g|g]]) neck of [[Cookbook:Lamb|lamb]]
*1 large white [[Cookbook:Onion|onion]]<nowiki/>s, [[Cookbook:Dice|diced]]
=== Topping ===
*2 large [[Cookbook:Potato|potatoes]], sliced

==Procedure==
# [[Cookbook:Dice|Dice]] the lamb.
# Bake for 1 hour.

==Notes, tips, and variations==
*Add carrots.
`;

describe('Wikibooks recipe parsing', () => {
  it('keeps link labels and drops markup', () => {
    expect(
      stripWikiMarkup(
        "2 [[Cookbook:Pound|lb]] of '''[[Cookbook:Lamb|lamb]]'''<nowiki/>s{{note}}"
      )
    ).toBe('2 lb of lambs');
  });

  it('reads servings, ingredients (including sub-sections) and steps', () => {
    expect(parseWikibooksRecipe(HOTPOT)).toEqual({
      servings: 4,
      ingredients: [
        '2 lb (900 g) neck of lamb',
        '1 large white onions, diced',
        '2 large potatoes, sliced',
      ],
      steps: ['Dice the lamb.', 'Bake for 1 hour.'],
    });
  });

  it('defaults to 4 servings', () => {
    expect(parseWikibooksRecipe('==Ingredients==\n* 1 egg').servings).toBe(4);
  });
});

describe('starter recipe import', () => {
  const respond = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200 });

  beforeEach(() => {
    vi.clearAllMocks();
    clearStarterRecipeCache();
    mockFetch.mockImplementation(async (url: string) => {
      const params = new URL(url).searchParams;
      if (params.get('action') === 'parse') {
        return respond({ parse: { wikitext: HOTPOT } });
      }
      const category = params.get('cmtitle');
      return respond({
        query: {
          categorymembers:
            category === 'Category:English recipes'
              ? [
                  { title: 'Cookbook:Lancashire Hotpot' },
                  { title: 'Cookbook:Cornish Cuisine' },
                ]
              : [{ title: 'Cookbook:Lancashire Hotpot' }],
        },
      });
    });
  });

  it('lists recipes once across categories, without cuisine pages', async () => {
    const recipes = await listStarterRecipes();

    expect(recipes).toEqual([
      {
        title: 'Cookbook:Lancashire Hotpot',
        name: 'Lancashire Hotpot',
        url: 'https://en.wikibooks.org/wiki/Cookbook%3ALancashire_Hotpot',
      },
    ]);
  });

  it('imports a listed recipe with method and CC BY-SA credit', async () => {
    await importStarterRecipe('user-1', 'Cookbook:Lancashire Hotpot');

    const recipe = vi.mocked(buildMealFromRecipe).mock.calls[0][1];
    expect(recipe).toMatchObject({ name: 'Lancashire Hotpot', servings: 4 });
    expect(recipe.ingredients).toHaveLength(3);
    expect(recipe.notes).toContain('1. Dice the lamb.');
    expect(recipe.notes).toContain('CC BY-SA 4.0');
  });

  it('refuses a title that is not in the list', async () => {
    expect(
      await importStarterRecipe('user-1', 'Cookbook:Something Else')
    ).toBeNull();
    expect(buildMealFromRecipe).not.toHaveBeenCalled();
  });
});
