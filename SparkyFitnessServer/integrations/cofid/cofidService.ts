import { log } from '../../config/logging.js';
import {
  createGuardedFetch,
  PUBLIC_ONLY_AI_NETWORK_POLICY,
} from '../../utils/outboundUrlPolicy.js';
import { mapStandardNutrientsByCode } from '../../utils/standardNutrientCodes.js';
import { readXlsxSheets, type XlsxRow } from '../../utils/xlsxReader.js';
import {
  createDatasetLoader,
  matchDatasetItems,
  paginate,
} from '../../utils/datasetSearch.js';

// McCance and Widdowson's Composition of Foods Integrated Dataset (CoFID),
// the UK's national food composition table, published by Public Health England
// / the Food Standards Agency under the Open Government Licence v3.0. There is
// no free API: the dataset is one Excel workbook (~2,900 foods), so it is
// downloaded once per process and searched in memory.

const guardedFetch = createGuardedFetch(PUBLIC_ONLY_AI_NETWORK_POLICY);

export const COFID_DATASET_URL =
  'https://assets.publishing.service.gov.uk/media/60538b91e90e07527df82ae4/McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx';

const COFID_BRAND = "McCance and Widdowson's CoFID (UK)";

// Each sheet has the column labels in row 1, nutrient codes in row 2, a
// description row 3, and foods from row 4. Columns A-D are code, name,
// description and food group in every sheet.
const COFID_SHEETS = ['1.3 Proximates', '1.4 Inorganics', '1.5 Vitamins'];
const FIRST_FOOD_ROW = 3; // zero-based
const FIRST_NUTRIENT_COLUMN = 7; // column H

export interface CofidNutrientColumn {
  name: string;
  unit: string;
}

export interface CofidFoodRecord {
  code: string;
  name: string;
  group: string;
  // Value per nutrient code; 'Tr' (trace) reads as 0, and 'N' (present but not
  // measured) or a blank cell is left out.
  values: Record<string, number>;
}

export interface CofidDataset {
  foods: CofidFoodRecord[];
  byCode: Map<string, CofidFoodRecord>;
  columns: Map<string, CofidNutrientColumn>;
}

export interface CofidVariant {
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

export interface CofidMappedFood {
  name: string;
  brand: string;
  provider_external_id: string;
  provider_type: 'cofid';
  is_custom: boolean;
  default_variant: CofidVariant;
  variants: CofidVariant[];
  [key: string]: unknown;
}

// CoFID codes behind each standard column, in order of preference. Fibre
// prefers AOAC, the method UK labels use, over the older NSP figure.
const STANDARD_NUTRIENT_CODES = {
  protein: ['PROT'],
  carbs: ['CHO'],
  fat: ['FAT'],
  saturated_fat: ['SATFOD'],
  polyunsaturated_fat: ['POLYFOD'],
  monounsaturated_fat: ['MONOFOD'],
  trans_fat: ['FODTRANS'],
  cholesterol: ['CHOL'],
  sodium: ['NA'],
  potassium: ['K'],
  dietary_fiber: ['AOACFIB', 'ENGFIB'],
  sugars: ['TOTSUG'],
  calcium: ['CA'],
  iron: ['FE'],
  vitamin_a: ['RETEQU'],
  vitamin_c: ['VITC'],
  water_ml: ['WATER'],
  alcohol_g: ['ALCO'],
} as const;

// "Protein (g)" -> Protein, g; "Energy (kcal) (kcal)" -> Energy (kcal), kcal.
function parseColumnLabel(label: string): CofidNutrientColumn {
  const match = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(label.trim());
  return match
    ? { name: match[1].trim(), unit: match[2].trim() }
    : { name: label.trim(), unit: '' };
}

function parseCofidValue(raw: string | undefined): number | undefined {
  const text = raw?.trim();
  if (!text || text === 'N') return undefined;
  if (text === 'Tr') return 0;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

function readSheetFoods(rows: XlsxRow[], dataset: CofidDataset): void {
  const labels = rows[0] ?? [];
  const codes = rows[1] ?? [];
  const nutrientColumns: Array<{ index: number; code: string }> = [];
  for (let index = FIRST_NUTRIENT_COLUMN; index < codes.length; index++) {
    const code = codes[index]?.trim();
    const label = labels[index]?.trim();
    // Fatty acid columns per 100 g of fatty acids are not per 100 g of food.
    if (!code || !label || /\/\s*100\s*g\s*FA\b/i.test(label)) continue;
    nutrientColumns.push({ index, code });
    if (!dataset.columns.has(code)) {
      dataset.columns.set(code, parseColumnLabel(label));
    }
  }

  // The 2021 release gives two foods one code (13-669 is both a roasted
  // aubergine and raw watercress). The sheets list foods in the same order, so
  // the nth row with a code is the same food in every sheet; repeats get
  // "<code>#<n>".
  const seenCodes = new Map<string, number>();
  for (const row of rows.slice(FIRST_FOOD_ROW)) {
    const sourceCode = row[0]?.trim();
    const name = row[1]?.trim();
    if (!sourceCode || !name) continue;
    const occurrence = (seenCodes.get(sourceCode) ?? 0) + 1;
    seenCodes.set(sourceCode, occurrence);
    const code = occurrence === 1 ? sourceCode : `${sourceCode}#${occurrence}`;
    let food = dataset.byCode.get(code);
    if (!food) {
      food = { code, name, group: row[3]?.trim() ?? '', values: {} };
      dataset.byCode.set(code, food);
      dataset.foods.push(food);
    }
    for (const { index, code: nutrientCode } of nutrientColumns) {
      const value = parseCofidValue(row[index]);
      if (value !== undefined) food.values[nutrientCode] = value;
    }
  }
}

/** Parses the CoFID workbook into foods keyed by CoFID food code. */
export function parseCofidWorkbook(buffer: Buffer): CofidDataset {
  const sheets = readXlsxSheets(buffer, COFID_SHEETS);
  const dataset: CofidDataset = {
    foods: [],
    byCode: new Map(),
    columns: new Map(),
  };
  for (const name of COFID_SHEETS) {
    readSheetFoods(sheets.get(name) ?? [], dataset);
  }
  if (dataset.foods.length === 0) {
    throw new Error('The CoFID workbook contained no foods');
  }
  return dataset;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export function mapCofidFood(
  food: CofidFoodRecord,
  columns: Map<string, CofidNutrientColumn>
): CofidMappedFood {
  const labelsByCode: Record<string, string> = {};
  const providerNutrients: Record<string, number> = {};
  const providerNutrientUnits: Record<string, string> = {};
  for (const [code, value] of Object.entries(food.values)) {
    const column = columns.get(code);
    if (!column) continue;
    labelsByCode[code] = column.name;
    providerNutrients[column.name] = value;
    if (column.unit) providerNutrientUnits[column.name] = column.unit;
  }

  const { values: standard, providerNutrientStandard } =
    mapStandardNutrientsByCode(
      STANDARD_NUTRIENT_CODES,
      food.values,
      labelsByCode
    );

  const protein = round1(standard.protein);
  const carbs = round1(standard.carbs);
  const fat = round1(standard.fat);
  let calories = food.values.KCALS;
  if (calories === undefined) {
    calories = protein * 4 + carbs * 4 + fat * 9;
  } else if (labelsByCode.KCALS) {
    providerNutrientStandard[labelsByCode.KCALS] = 'calories';
  }

  // CoFID gives alcoholic drinks (food groups Q*) per 100 ml.
  const isDrinkPer100ml = food.group.startsWith('Q');

  const defaultVariant: CofidVariant = {
    serving_size: 100,
    serving_unit: isDrinkPer100ml ? 'ml' : 'g',
    calories: Math.round(calories),
    protein,
    carbs,
    fat,
    saturated_fat: round1(standard.saturated_fat),
    polyunsaturated_fat: round1(standard.polyunsaturated_fat),
    monounsaturated_fat: round1(standard.monounsaturated_fat),
    trans_fat: round1(standard.trans_fat),
    cholesterol: round1(standard.cholesterol),
    sodium: round1(standard.sodium),
    potassium: round1(standard.potassium),
    dietary_fiber: round1(standard.dietary_fiber),
    sugars: round1(standard.sugars),
    calcium: round1(standard.calcium),
    iron: round1(standard.iron),
    vitamin_a: round1(standard.vitamin_a),
    vitamin_c: round1(standard.vitamin_c),
    water_ml: round1(standard.water_ml),
    alcohol_g: round1(standard.alcohol_g),
    provider_nutrients: providerNutrients,
    provider_nutrient_units: providerNutrientUnits,
    provider_nutrient_standard: providerNutrientStandard,
    custom_nutrients: {},
    is_default: true,
  };

  return {
    name: food.name,
    brand: COFID_BRAND,
    provider_external_id: food.code,
    provider_type: 'cofid',
    is_custom: false,
    default_variant: defaultVariant,
    variants: [defaultVariant],
  };
}

// The 2021 dataset is the current release and is not updated in place, so it
// is kept for the life of the process.
const datasetLoader = createDatasetLoader(downloadCofidDataset);

export function clearCofidDatasetCache(): void {
  datasetLoader.clear();
}

async function downloadCofidDataset(): Promise<CofidDataset> {
  log('info', 'Downloading the CoFID dataset');
  const response = await guardedFetch(COFID_DATASET_URL, {
    method: 'GET',
    headers: { 'User-Agent': 'SparkyFitness/1.0' },
  });
  if (!response.ok) {
    throw new Error(`CoFID dataset download returned HTTP ${response.status}`);
  }
  const dataset = parseCofidWorkbook(Buffer.from(await response.arrayBuffer()));
  log('info', `Loaded ${dataset.foods.length} CoFID foods`);
  return dataset;
}

export function getCofidDataset(): Promise<CofidDataset> {
  return datasetLoader.get();
}

export async function getCofidFoodDetails(
  externalId: string
): Promise<CofidMappedFood | null> {
  const dataset = await getCofidDataset();
  const food = dataset.byCode.get(externalId.trim());
  return food ? mapCofidFood(food, dataset.columns) : null;
}

export async function searchCofidFoods(query: string, page = 1, pageSize = 20) {
  const dataset = await getCofidDataset();
  const { items, pagination } = paginate(
    matchDatasetItems(dataset.foods, query, (food) => food.name),
    page,
    pageSize
  );
  return {
    foods: items.map((food) => mapCofidFood(food, dataset.columns)),
    pagination,
  };
}
