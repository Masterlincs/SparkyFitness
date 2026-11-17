import { log } from '../config/logging.js';
import {
  createGuardedFetch,
  PUBLIC_ONLY_AI_NETWORK_POLICY,
} from '../utils/outboundUrlPolicy.js';
import {
  buildMealFromRecipe,
  type IngredientRecipe,
} from './recipeBuilderService.js';

// A starter library of British and Irish recipes from the Wikibooks Cookbook
// (CC BY-SA 4.0). Recipes are listed and read live from the Wikibooks API; an
// imported recipe becomes an ordinary saved meal that credits its source.

const guardedFetch = createGuardedFetch(PUBLIC_ONLY_AI_NETWORK_POLICY);

const API_URL = 'https://en.wikibooks.org/w/api.php';
const PAGE_URL = 'https://en.wikibooks.org/wiki/';
const LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
const CATEGORIES = [
  'English recipes',
  'British recipes',
  'Scottish recipes',
  'Welsh recipes',
  'Cornish recipes',
  'Irish recipes',
];
const LIST_TTL_MS = 12 * 60 * 60 * 1000;

export interface StarterRecipeSummary {
  title: string;
  name: string;
  url: string;
}

export interface ParsedWikibooksRecipe {
  servings: number;
  ingredients: string[];
  steps: string[];
}

async function wikibooks(params: Record<string, string>) {
  const url = `${API_URL}?${new URLSearchParams({
    ...params,
    format: 'json',
    formatversion: '2',
  })}`;
  const response = await guardedFetch(url, {
    headers: {
      'User-Agent': 'SparkyFitness/1.0 (self-hosted nutrition tracker)',
    },
  });
  if (!response.ok) {
    throw new Error(`Wikibooks returned HTTP ${response.status}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

/** "Cookbook:Toad in the Hole" -> "Toad in the Hole". */
const recipeName = (title: string) => title.replace(/^Cookbook:/, '').trim();

const pageUrl = (title: string) =>
  `${PAGE_URL}${encodeURIComponent(title.replace(/ /g, '_'))}`;

let listCache: { at: number; recipes: StarterRecipeSummary[] } | null = null;

export function clearStarterRecipeCache(): void {
  listCache = null;
}

/** British and Irish recipes in the Wikibooks Cookbook, by name. */
export async function listStarterRecipes(): Promise<StarterRecipeSummary[]> {
  if (listCache && Date.now() - listCache.at < LIST_TTL_MS) {
    return listCache.recipes;
  }
  const titles = new Set<string>();
  for (const category of CATEGORIES) {
    const data = await wikibooks({
      action: 'query',
      list: 'categorymembers',
      cmtitle: `Category:${category}`,
      cmlimit: '200',
      // Namespace 102 is "Cookbook:"; subcategories and user pages are left out.
      cmnamespace: '102',
    });
    const members =
      (data.query as { categorymembers?: Array<{ title: string }> })
        ?.categorymembers ?? [];
    for (const { title } of members) {
      // Cuisine overview pages are not recipes.
      if (!/cuisine$/i.test(title)) titles.add(title);
    }
  }
  const recipes = [...titles]
    .map((title) => ({ title, name: recipeName(title), url: pageUrl(title) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  listCache = { at: Date.now(), recipes };
  return recipes;
}

// Removes wiki markup, keeping link labels: "[[Cookbook:Onion|onion]]s" ->
// "onions".
export function stripWikiMarkup(text: string): string {
  return text
    .replace(/<nowiki\s*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>|<ref[^>]*\/>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// The body of the first level-2 section whose heading matches, up to the next
// level-2 heading. Sub-headings ("=== For the pastry ===") stay inside.
function section(wikitext: string, names: RegExp): string | null {
  const lines = wikitext.split('\n');
  const headingOf = (line: string) =>
    /^==([^=].*?)==\s*$/.exec(line.trim())?.[1]?.trim();
  const start = lines.findIndex((line) => {
    const heading = headingOf(line);
    return heading !== undefined && names.test(heading);
  });
  if (start < 0) return null;
  const end = lines.findIndex(
    (line, index) => index > start && headingOf(line) !== undefined
  );
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}

/** Reads servings, ingredient lines and method steps from recipe wikitext. */
export function parseWikibooksRecipe(wikitext: string): ParsedWikibooksRecipe {
  const servingsText = /\|\s*servings\s*=\s*([^\n|]*)/i.exec(wikitext)?.[1];
  const servings = Number(/\d+/.exec(servingsText ?? '')?.[0]) || 4;

  const ingredientsText = section(wikitext, /^ingredients$/i) ?? '';
  const ingredients = ingredientsText
    .split('\n')
    .filter((line) => /^\*/.test(line.trim()))
    .map((line) => stripWikiMarkup(line.trim().replace(/^\*+/, '')))
    .filter(Boolean);

  const methodText =
    section(
      wikitext,
      /^(?:procedure|method|directions|preparation|instructions)$/i
    ) ?? '';
  const steps = methodText
    .split('\n')
    .filter((line) => /^#/.test(line.trim()))
    .map((line) => stripWikiMarkup(line.trim().replace(/^#+/, '')))
    .filter(Boolean);

  return { servings, ingredients, steps };
}

/** Saves a starter recipe as a meal, crediting Wikibooks in its note. */
export async function importStarterRecipe(userId: string, title: string) {
  const known = (await listStarterRecipes()).find(
    (recipe) => recipe.title === title
  );
  if (!known) return null;
  const data = await wikibooks({
    action: 'parse',
    page: title,
    prop: 'wikitext',
  });
  const wikitext = (data.parse as { wikitext?: string } | undefined)?.wikitext;
  if (!wikitext) throw new Error(`Wikibooks returned no text for ${title}`);
  const parsed = parseWikibooksRecipe(wikitext);
  if (parsed.ingredients.length === 0) {
    throw new Error(`${known.name} has no ingredient list to import`);
  }
  log('info', `Importing Wikibooks recipe ${title}`);

  const notes = [
    parsed.steps.length > 0
      ? `**Method**\n\n${parsed.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`
      : null,
    `Recipe: [${known.name}](${known.url}) from the Wikibooks Cookbook, licensed under [CC BY-SA 4.0](${LICENSE_URL}).`,
  ].filter(Boolean);

  const recipe: IngredientRecipe = {
    name: known.name,
    servings: parsed.servings,
    ingredients: parsed.ingredients,
    notes: notes.join('\n\n'),
  };
  return buildMealFromRecipe(userId, recipe);
}
