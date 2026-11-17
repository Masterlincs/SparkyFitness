import {
  getConversionFactor,
  parseFoodPhrases,
  type ParsedFoodPhrase,
  type QuickLogCandidate,
  type QuickLogMatchItem,
  type QuickLogSource,
  type QuickLogVariant,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import foodRepository from '../models/foodRepository.js';
import foodCoreService from './foodCoreService.js';
import {
  getCofidFoodDetails,
  searchCofidFoods,
} from '../integrations/cofid/cofidService.js';
import {
  getIntake24FoodDetails,
  searchIntake24Foods,
} from '../integrations/intake24/intake24Service.js';
import { datasetSearchText } from '../utils/datasetSearch.js';

// Finds foods for what someone said or typed ("two eggs and a slice of
// toast"): the person's own library first, then the UK datasets, which need no
// account and come with portions. Nothing is logged here.

type PhraseMatchSource = QuickLogSource;
type PhraseMatchVariant = QuickLogVariant;
type PhraseMatchCandidate = QuickLogCandidate;
type PhraseMatch = QuickLogMatchItem;

const PINT_ML = 568.261;
const MAX_ALTERNATIVES = 4;

// How many of `to` one `from` is, when both are weights or both are volumes
// (getConversionFactor(base, target) is base units per target unit). A UK pint
// is not in the shared table.
function unitFactor(from: string, to: string): number | null {
  if (from === 'pint') {
    const mlInTarget = getConversionFactor(to, 'ml');
    return mlInTarget === null ? null : PINT_ML * mlInTarget;
  }
  return getConversionFactor(to, from);
}

const singular = (word: string) =>
  word.endsWith('es') && /(ch|sh|ss|x)es$/.test(word)
    ? word.slice(0, -2)
    : word.endsWith('s') && !word.endsWith('ss')
      ? word.slice(0, -1)
      : word;

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Whether a word (or its plural) appears as a whole word in a label. */
const hasWord = (label: string, word: string) =>
  datasetSearchText(label)
    .split(' ')
    .some(
      (candidate) =>
        candidate === word ||
        candidate === `${word}s` ||
        candidate === `${word}es`
    );

/**
 * Picks the portion of a food that fits the phrase and the amount in that
 * portion's unit: a weight or volume converts ("250 g"), a household unit or
 * size matches the portion's name ("a slice", "a large egg"), and a bare count
 * uses a medium or single-item portion before falling back to servings.
 */
export function choosePortion(
  phrase: Pick<ParsedFoodPhrase, 'quantity' | 'unit' | 'size'>,
  variants: Array<Pick<PhraseMatchVariant, 'serving_size' | 'serving_unit'>>
): { variantIndex: number; quantity: number } {
  const count = phrase.quantity ?? 1;
  if (variants.length === 0) return { variantIndex: 0, quantity: count };

  if (phrase.unit) {
    for (let i = 0; i < variants.length; i++) {
      const factor = unitFactor(phrase.unit, variants[i].serving_unit);
      if (factor !== null) {
        return { variantIndex: i, quantity: round1(count * factor) };
      }
    }
    // A drink said by volume but listed by weight: 1 ml is close enough to
    // 1 g for milk, juice and the like.
    const toMl = unitFactor(phrase.unit, 'ml');
    const gramsIndex = variants.findIndex(
      (variant) => getConversionFactor(variant.serving_unit, 'g') !== null
    );
    if (toMl !== null && gramsIndex >= 0) {
      const perGram = unitFactor('g', variants[gramsIndex].serving_unit) ?? 1;
      return {
        variantIndex: gramsIndex,
        quantity: round1(count * toMl * perGram),
      };
    }
  }

  const unitWord = phrase.unit ? singular(phrase.unit) : null;
  const sizeWord = phrase.size ?? 'medium';
  let best = -1;
  let bestScore = 0;
  variants.forEach((variant, index) => {
    const label = variant.serving_unit.toLowerCase();
    // Weight and volume references are not household portions.
    if (getConversionFactor('g', label) !== null) return;
    if (getConversionFactor('ml', label) !== null) return;
    let score = 0;
    if (unitWord && hasWord(label, unitWord)) score += 4;
    if (hasWord(label, sizeWord)) score += 2;
    if (!phrase.unit && !/\bportion\b/.test(label)) score += 1;
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  if (best >= 0 && (bestScore >= 2 || !phrase.unit)) {
    return {
      variantIndex: best,
      quantity: round1(count * variants[best].serving_size),
    };
  }
  // No portion fits: count servings of the first variant.
  return {
    variantIndex: 0,
    quantity: round1(count * variants[0].serving_size),
  };
}

/** Higher is better: share of the phrase's words in the name, shorter names first. */
export function nameScore(phrase: string, name: string): number {
  const words = datasetSearchText(phrase).split(' ').filter(Boolean);
  if (words.length === 0) return 0;
  const targetWords = datasetSearchText(name).split(' ');
  const found = words.filter((word) =>
    targetWords.some((target) => target.startsWith(singular(word)))
  ).length;
  const extra = Math.max(targetWords.length - words.length, 0);
  return found / words.length - extra * 0.02;
}

const SOURCE_BONUS: Record<PhraseMatchSource, number> = {
  library: 0.15,
  intake24: 0.05,
  cofid: 0,
};

type ProviderVariant = PhraseMatchVariant & { is_default?: boolean };

function toCandidate(
  source: PhraseMatchSource,
  food: {
    id?: string | null;
    provider_external_id?: string | null;
    name: string;
    brand?: string | null;
    variants: ProviderVariant[];
  },
  phrase: ParsedFoodPhrase
): PhraseMatchCandidate {
  const { variantIndex, quantity } = choosePortion(phrase, food.variants);
  return {
    source,
    food_id: source === 'library' ? (food.id ?? null) : null,
    provider_external_id:
      source === 'library' ? null : (food.provider_external_id ?? null),
    name: food.name,
    brand: food.brand ?? null,
    variants: food.variants,
    variant_index: variantIndex,
    quantity,
  };
}

interface LibraryFoodRow {
  id: string;
  name: string;
  brand: string | null;
  default_variant: ProviderVariant | null;
}

async function libraryCandidates(
  userId: string,
  phrase: ParsedFoodPhrase
): Promise<PhraseMatchCandidate[]> {
  const rows = ((await foodRepository.searchFoods(
    phrase.name,
    userId,
    false,
    true,
    false,
    3
  )) ?? []) as LibraryFoodRow[];
  const candidates: PhraseMatchCandidate[] = [];
  for (const row of rows) {
    if (!row.default_variant) continue;
    const others = ((await foodCoreService.getFoodVariantsByFoodId(
      userId,
      row.id
    )) ?? []) as ProviderVariant[];
    const variants = [
      row.default_variant,
      ...others.filter((variant) => variant.id !== row.default_variant?.id),
    ].map((variant) => ({
      ...variant,
      serving_size: Number(variant.serving_size),
      calories: Number(variant.calories),
      protein: Number(variant.protein),
      carbs: Number(variant.carbs),
      fat: Number(variant.fat),
    }));
    candidates.push(toCandidate('library', { ...row, variants }, phrase));
  }
  return candidates;
}

async function datasetCandidates(
  phrase: ParsedFoodPhrase
): Promise<PhraseMatchCandidate[]> {
  const [intake24, cofid] = await Promise.all([
    searchIntake24Foods(phrase.name, 1, 4).catch((error) => {
      log('warn', 'Intake24 unavailable for phrase matching:', error);
      return { foods: [] };
    }),
    searchCofidFoods(phrase.name, 1, 3).catch((error) => {
      log('warn', 'CoFID unavailable for phrase matching:', error);
      return { foods: [] };
    }),
  ]);
  return [
    ...intake24.foods.map((food) => toCandidate('intake24', food, phrase)),
    ...cofid.foods.map((food) => toCandidate('cofid', food, phrase)),
  ];
}

async function matchPhrase(
  userId: string,
  phrase: ParsedFoodPhrase
): Promise<PhraseMatch> {
  const [library, datasets] = await Promise.all([
    libraryCandidates(userId, phrase).catch((error) => {
      log('warn', 'Library search failed for phrase matching:', error);
      return [];
    }),
    datasetCandidates(phrase),
  ]);
  const ranked = [...library, ...datasets]
    .map((candidate) => ({
      candidate,
      score:
        nameScore(phrase.name, candidate.name) + SOURCE_BONUS[candidate.source],
    }))
    .filter(({ score }) => score > 0.3)
    .sort((a, b) => b.score - a.score)
    .map(({ candidate }) => candidate);
  return {
    phrase,
    match: ranked[0] ?? null,
    alternatives: ranked.slice(1, 1 + MAX_ALTERNATIVES),
  };
}

/** Reads a spoken or typed food list and finds a food for each item. */
export async function matchFoodPhrases(
  userId: string,
  text: string
): Promise<PhraseMatch[]> {
  const phrases = parseFoodPhrases(text).slice(0, 20);
  return Promise.all(phrases.map((phrase) => matchPhrase(userId, phrase)));
}

/** Re-reads a dataset food's portion on the server, so a log never trusts posted nutrition. */
export async function getDatasetPortion(
  source: Exclude<PhraseMatchSource, 'library'>,
  externalId: string,
  servingUnit: string,
  servingSize: number
) {
  const food =
    source === 'intake24'
      ? await getIntake24FoodDetails(externalId)
      : await getCofidFoodDetails(externalId);
  if (!food) return null;
  const variant = food.variants.find(
    (candidate) =>
      candidate.serving_unit === servingUnit &&
      Number(candidate.serving_size) === servingSize
  );
  return variant ? { food, variant } : null;
}
