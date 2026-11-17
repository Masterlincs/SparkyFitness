import Papa from 'papaparse';
import { log } from '../../config/logging.js';
import {
  createGuardedFetch,
  PUBLIC_ONLY_AI_NETWORK_POLICY,
} from '../../utils/outboundUrlPolicy.js';
import { mapStandardNutrientsByCode } from '../../utils/standardNutrientCodes.js';
import {
  createDatasetLoader,
  matchDatasetItems,
  paginate,
} from '../../utils/datasetSearch.js';

// The Intake24 UK food database (Newcastle University and the Food Standards
// Agency, Open Government Licence v3.0): about 2,500 foods as people in the UK
// report eating them, each linked to the National Diet and Nutrition Survey
// (NDNS) nutrient databank and to household portions such as "1 slice" or
// "1 medium handful". The archived data repository is downloaded once per
// process and searched in memory, like CoFID.

const guardedFetch = createGuardedFetch(PUBLIC_ONLY_AI_NETWORK_POLICY);

const DATA_BASE_URL =
  'https://raw.githubusercontent.com/intake24-legacy/xml-data/master';
export const INTAKE24_FOODS_URL = `${DATA_BASE_URL}/foods.xml`;
export const INTAKE24_AS_SERVED_URL = `${DATA_BASE_URL}/as-served.xml`;
export const INTAKE24_GUIDE_URL = `${DATA_BASE_URL}/guide.xml`;
export const INTAKE24_NUTRIENTS_URL = `${DATA_BASE_URL}/nutrients.csv`;

const INTAKE24_BRAND = 'Intake24 (UK)';

// NDNS columns behind each standard field; values are per 100 g.
const NDNS_COLUMNS = {
  water_ml: { column: 'Water', unit: 'g' },
  protein: { column: 'Protein', unit: 'g' },
  fat: { column: 'Fat', unit: 'g' },
  carbs: { column: 'Carbohydrate', unit: 'g' },
  calories: { column: 'Energy (kcal)', unit: 'kcal' },
  alcohol_g: { column: 'Alcohol', unit: 'g' },
  dietary_fiber: { column: 'Englyst fibre', unit: 'g' },
  sugars: { column: 'Total sugars', unit: 'g' },
  saturated_fat: { column: 'Satd FA', unit: 'g' },
  monounsaturated_fat: { column: 'Cis-Mon FA', unit: 'g' },
  omega3: { column: 'Cis-n3 FA', unit: 'g' },
  omega6: { column: 'Cis-n6 FA', unit: 'g' },
  trans_fat: { column: 'Trans FA', unit: 'g' },
  cholesterol: { column: 'Cholesterol', unit: 'mg' },
  vitamin_a: { column: 'Vitamin A', unit: 'µg' },
  vitamin_c: { column: 'Vitamin C', unit: 'mg' },
  sodium: { column: 'Sodium', unit: 'mg' },
  potassium: { column: 'Potassium', unit: 'mg' },
  calcium: { column: 'Calcium', unit: 'mg' },
  iron: { column: 'Iron', unit: 'mg' },
} as const;

type NdnsField = keyof typeof NDNS_COLUMNS;

const STANDARD_FIELDS = {
  protein: ['protein'],
  carbs: ['carbs'],
  fat: ['fat'],
  saturated_fat: ['saturated_fat'],
  monounsaturated_fat: ['monounsaturated_fat'],
  trans_fat: ['trans_fat'],
  cholesterol: ['cholesterol'],
  sodium: ['sodium'],
  potassium: ['potassium'],
  dietary_fiber: ['dietary_fiber'],
  sugars: ['sugars'],
  calcium: ['calcium'],
  iron: ['iron'],
  vitamin_a: ['vitamin_a'],
  vitamin_c: ['vitamin_c'],
  water_ml: ['water_ml'],
  alcohol_g: ['alcohol_g'],
} as const;

export interface Intake24Portion {
  label: string;
  grams: number;
}

export interface Intake24Food {
  code: string;
  name: string;
  // Per 100 g; a nutrient NDNS leaves blank is missing.
  values: Partial<Record<NdnsField, number>>;
  portions: Intake24Portion[];
}

export interface Intake24Dataset {
  foods: Intake24Food[];
  byCode: Map<string, Intake24Food>;
}

export interface Intake24Variant {
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat?: number;
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  trans_fat?: number;
  cholesterol?: number;
  sodium?: number;
  potassium?: number;
  dietary_fiber?: number;
  sugars?: number;
  calcium?: number;
  iron?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  water_ml?: number;
  alcohol_g?: number;
  provider_nutrients?: Record<string, number>;
  provider_nutrient_units?: Record<string, string>;
  provider_nutrient_standard?: Record<string, string>;
  custom_nutrients?: Record<string, number>;
  is_default: boolean;
  [key: string]: unknown;
}

export interface Intake24MappedFood {
  name: string;
  brand: string;
  provider_external_id: string;
  provider_type: 'intake24';
  is_custom: boolean;
  default_variant: Intake24Variant;
  variants: Intake24Variant[];
  [key: string]: unknown;
}

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeXml(text: string): string {
  return text.replace(/&(#[0-9]+|[a-z]+);/gi, (match, entity: string) =>
    entity.startsWith('#')
      ? String.fromCodePoint(Number(entity.slice(1)))
      : (XML_ENTITIES[entity] ?? match)
  );
}

function readAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [, name, value] of tag.matchAll(/([\w-]+)="([^"]*)"/g)) {
    attributes[name] = decodeXml(value);
  }
  return attributes;
}

function readParams(body: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [tag] of body.matchAll(/<param\b[^>]*>/g)) {
    const { name, value } = readAttributes(tag);
    if (name) params[name] = value ?? '';
  }
  return params;
}

// "large_tubs" -> "large tub"; "sandwiches_made_with_two_slices" ->
// "sandwich made with two slices": only the first plural word is the unit.
export function portionUnitLabel(raw: string): string {
  const words = raw
    .trim()
    .split(/[_\s]+/)
    .filter(Boolean);
  const index = words.findIndex((word) => /[a-z]{2,}s$/i.test(word));
  if (index >= 0) {
    const word = words[index];
    words[index] = /ies$/i.test(word)
      ? `${word.slice(0, -3)}y`
      : /(ch|sh|ss|x|o)es$/i.test(word)
        ? word.slice(0, -2)
        : word.slice(0, -1);
  }
  return words.join(' ');
}

const gramsLabel = (grams: number) =>
  `${grams >= 10 ? Math.round(grams) : Math.round(grams * 10) / 10} g`;

function parseAsServedSets(xml: string): Map<string, number[]> {
  const sets = new Map<string, number[]>();
  for (const [, tag, body] of xml.matchAll(
    /<as-served-set\b([^>]*)>([\s\S]*?)<\/as-served-set>/g
  )) {
    const { id } = readAttributes(tag);
    if (!id) continue;
    const weights = Array.from(
      body.matchAll(/<as-served-image\b[^>]*\bweight="([^"]+)"/g),
      ([, weight]) => Number(weight)
    )
      .filter((weight) => Number.isFinite(weight) && weight > 0)
      .sort((a, b) => a - b);
    if (weights.length > 0) sets.set(id, weights);
  }
  return sets;
}

// Guide images show objects with a weight each. The same description at several
// weights ("Bread sliced") becomes small, medium and large; distinct objects
// ("Aero - standard bar") keep their own description.
function parseGuideImages(xml: string): Map<string, Intake24Portion[]> {
  const guides = new Map<string, Intake24Portion[]>();
  for (const [, tag, body] of xml.matchAll(
    /<guide-image\b([^>]*)>([\s\S]*?)<\/guide-image>/g
  )) {
    const { id } = readAttributes(tag);
    if (!id) continue;
    const byDescription = new Map<string, number[]>();
    for (const [weightTag] of body.matchAll(/<weight\b[^>]*>/g)) {
      const { description, value } = readAttributes(weightTag);
      const grams = Number(value);
      const label = description?.trim();
      if (!label || /^no description/i.test(label) || !(grams > 0)) continue;
      byDescription.set(label, [...(byDescription.get(label) ?? []), grams]);
    }
    const portions: Intake24Portion[] = [];
    for (const [label, weights] of byDescription) {
      const sorted = [...new Set(weights)].sort((a, b) => a - b);
      if (sorted.length >= 3) {
        portions.push(
          { label: `${label}, small`, grams: sorted[0] },
          {
            label: `${label}, medium`,
            grams: sorted[Math.floor(sorted.length / 2)],
          },
          { label: `${label}, large`, grams: sorted[sorted.length - 1] }
        );
      } else {
        for (const grams of sorted) portions.push({ label, grams });
      }
    }
    if (portions.length > 0) guides.set(id, portions);
  }
  return guides;
}

// Enough to choose from without burying the per-100 g default.
const MAX_PORTIONS = 10;

function readPortions(
  foodBody: string,
  asServed: Map<string, number[]>,
  guides: Map<string, Intake24Portion[]>
): Intake24Portion[] {
  // Named household portions first, then sized servings, then pictured
  // objects, so the cap never drops "large banana" for a sixth picture.
  const standard: Intake24Portion[] = [];
  const served: Intake24Portion[] = [];
  const pictured: Intake24Portion[] = [];
  const seen = new Set<string>();
  const add = (list: Intake24Portion[], label: string, grams: number) => {
    const key = `${label} ${grams}`;
    if (!Number.isFinite(grams) || grams <= 0 || seen.has(key)) return;
    seen.add(key);
    list.push({ label, grams: Math.round(grams * 10) / 10 });
  };

  for (const [, tag, body] of foodBody.matchAll(
    /<portion-size\b([^>]*)>([\s\S]*?)<\/portion-size>/g
  )) {
    const { method } = readAttributes(tag);
    const params = readParams(body);
    if (method === 'standard-portion') {
      const count = Number(params['units-count'] ?? 0);
      for (let i = 0; i < count; i++) {
        const name = params[`unit${i}-name`];
        const grams = Number(params[`unit${i}-weight`]);
        if (name) add(standard, portionUnitLabel(name), grams);
      }
    } else if (method === 'as-served') {
      const weights = asServed.get(params['serving-image-set'] ?? '');
      if (weights && weights.length >= 3) {
        add(served, 'small portion', weights[0]);
        add(served, 'medium portion', weights[Math.floor(weights.length / 2)]);
        add(served, 'large portion', weights[weights.length - 1]);
      }
    } else if (method === 'guide-image') {
      for (const portion of guides.get(params['guide-image-id'] ?? '') ?? []) {
        add(pictured, portion.label, portion.grams);
      }
    }
  }
  return [...standard, ...served, ...pictured].slice(0, MAX_PORTIONS);
}

type NdnsRow = Record<string, number | undefined>;

function parseNdnsNutrients(csv: string): Map<string, NdnsRow> {
  const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: true });
  const [header, ...rows] = parsed.data;
  if (!header) return new Map();
  const index = (column: string) => header.indexOf(column);
  const codeIndex = index('Food Code');
  const baseIndex = index('Base Value');
  const columns = Object.values(NDNS_COLUMNS).map(({ column }) => ({
    column,
    at: index(column),
  }));

  const result = new Map<string, NdnsRow>();
  for (const row of rows) {
    const code = row[codeIndex]?.trim();
    // A few NDNS rows are per tablet or per gram, not per 100 g.
    if (!code || Number(row[baseIndex]) !== 100) continue;
    const values: NdnsRow = {};
    for (const { column, at } of columns) {
      const raw = at >= 0 ? row[at]?.trim() : '';
      const value = raw ? Number(raw) : NaN;
      if (Number.isFinite(value)) values[column] = value;
    }
    result.set(code, values);
  }
  return result;
}

/** Builds the dataset from the three Intake24 data files. */
export function parseIntake24Data(
  foodsXml: string,
  asServedXml: string,
  guideXml: string,
  nutrientsCsv: string
): Intake24Dataset {
  const asServed = parseAsServedSets(asServedXml);
  const guides = parseGuideImages(guideXml);
  const ndns = parseNdnsNutrients(nutrientsCsv);
  const dataset: Intake24Dataset = { foods: [], byCode: new Map() };

  for (const [, tag, body] of foodsXml.matchAll(
    /<food\b([^>]*)>([\s\S]*?)<\/food>/g
  )) {
    const { code, description } = readAttributes(tag);
    const ndnsCode =
      /<nutrient-table\b[^>]*\bid="NDNS"[^>]*\bcode="([^"]+)"/.exec(body)?.[1];
    const row = ndnsCode ? ndns.get(ndnsCode) : undefined;
    if (!code || !description || !row || dataset.byCode.has(code)) continue;

    const values: Intake24Food['values'] = {};
    for (const [field, { column }] of Object.entries(NDNS_COLUMNS)) {
      const value = row[column];
      if (value !== undefined) values[field as NdnsField] = value;
    }
    const food: Intake24Food = {
      code,
      name: description.trim(),
      values,
      portions: readPortions(body, asServed, guides),
    };
    dataset.foods.push(food);
    dataset.byCode.set(code, food);
  }

  if (dataset.foods.length === 0) {
    throw new Error('The Intake24 data contained no foods');
  }
  return dataset;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

function buildVariant(
  food: Intake24Food,
  grams: number,
  servingSize: number,
  servingUnit: string,
  isDefault: boolean
): Intake24Variant {
  const factor = grams / 100;
  const providerNutrients: Record<string, number> = {};
  const providerNutrientUnits: Record<string, string> = {};
  const labels: Record<string, string> = {};
  for (const [field, value] of Object.entries(food.values)) {
    const { column, unit } = NDNS_COLUMNS[field as NdnsField];
    providerNutrients[column] = round1(value * factor);
    providerNutrientUnits[column] = unit;
    labels[field] = column;
  }
  const { values: standard, providerNutrientStandard } =
    mapStandardNutrientsByCode(STANDARD_FIELDS, food.values, labels);

  const protein = standard.protein;
  const carbs = standard.carbs;
  const fat = standard.fat;
  let calories = food.values.calories;
  if (calories === undefined) {
    calories = protein * 4 + carbs * 4 + fat * 9;
  } else {
    providerNutrientStandard[NDNS_COLUMNS.calories.column] = 'calories';
  }
  // NDNS gives omega-3 and omega-6 rather than total polyunsaturated fat.
  const omega3 = food.values.omega3;
  const omega6 = food.values.omega6;
  const polyunsaturated =
    omega3 === undefined && omega6 === undefined
      ? 0
      : (omega3 ?? 0) + (omega6 ?? 0);

  return {
    serving_size: servingSize,
    serving_unit: servingUnit,
    calories: Math.round(calories * factor),
    protein: round1(protein * factor),
    carbs: round1(carbs * factor),
    fat: round1(fat * factor),
    saturated_fat: round1(standard.saturated_fat * factor),
    polyunsaturated_fat: round1(polyunsaturated * factor),
    monounsaturated_fat: round1(standard.monounsaturated_fat * factor),
    trans_fat: round1(standard.trans_fat * factor),
    cholesterol: round1(standard.cholesterol * factor),
    sodium: round1(standard.sodium * factor),
    potassium: round1(standard.potassium * factor),
    dietary_fiber: round1(standard.dietary_fiber * factor),
    sugars: round1(standard.sugars * factor),
    calcium: round1(standard.calcium * factor),
    iron: round1(standard.iron * factor),
    vitamin_a: round1(standard.vitamin_a * factor),
    vitamin_c: round1(standard.vitamin_c * factor),
    water_ml: round1(standard.water_ml * factor),
    alcohol_g: round1(standard.alcohol_g * factor),
    provider_nutrients: providerNutrients,
    provider_nutrient_units: providerNutrientUnits,
    provider_nutrient_standard: providerNutrientStandard,
    custom_nutrients: {},
    is_default: isDefault,
  };
}

/**
 * Maps a food to a per-100 g default plus one variant per household portion,
 * each labelled with its weight ("slice (36 g)").
 */
export function mapIntake24Food(food: Intake24Food): Intake24MappedFood {
  const per100g = buildVariant(food, 100, 100, 'g', true);
  const portions = food.portions.map((portion) =>
    buildVariant(
      food,
      portion.grams,
      1,
      `${portion.label} (${gramsLabel(portion.grams)})`,
      false
    )
  );
  return {
    name: food.name,
    brand: INTAKE24_BRAND,
    provider_external_id: food.code,
    provider_type: 'intake24',
    is_custom: false,
    default_variant: per100g,
    variants: [per100g, ...portions],
  };
}

async function fetchText(url: string): Promise<string> {
  const response = await guardedFetch(url, {
    method: 'GET',
    headers: { 'User-Agent': 'SparkyFitness/1.0' },
  });
  if (!response.ok) {
    throw new Error(`Intake24 data download returned HTTP ${response.status}`);
  }
  // nutrients.csv is Windows-1252 (en dashes in names), not UTF-8.
  return url === INTAKE24_NUTRIENTS_URL
    ? new TextDecoder('windows-1252').decode(await response.arrayBuffer())
    : response.text();
}

async function downloadIntake24Dataset(): Promise<Intake24Dataset> {
  log('info', 'Downloading the Intake24 UK food data');
  const [foodsXml, asServedXml, guideXml, nutrientsCsv] = await Promise.all([
    fetchText(INTAKE24_FOODS_URL),
    fetchText(INTAKE24_AS_SERVED_URL),
    fetchText(INTAKE24_GUIDE_URL),
    fetchText(INTAKE24_NUTRIENTS_URL),
  ]);
  const dataset = parseIntake24Data(
    foodsXml,
    asServedXml,
    guideXml,
    nutrientsCsv
  );
  log('info', `Loaded ${dataset.foods.length} Intake24 foods`);
  return dataset;
}

// The repository is archived, so the data never changes under a process.
const datasetLoader = createDatasetLoader(downloadIntake24Dataset);

export function clearIntake24DatasetCache(): void {
  datasetLoader.clear();
}

export async function getIntake24FoodDetails(
  externalId: string
): Promise<Intake24MappedFood | null> {
  const dataset = await datasetLoader.get();
  const food = dataset.byCode.get(externalId.trim());
  return food ? mapIntake24Food(food) : null;
}

export async function searchIntake24Foods(
  query: string,
  page = 1,
  pageSize = 20
) {
  const dataset = await datasetLoader.get();
  const { items, pagination } = paginate(
    matchDatasetItems(dataset.foods, query, (food) => food.name),
    page,
    pageSize
  );
  return { foods: items.map(mapIntake24Food), pagination };
}
