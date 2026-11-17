import { vi, beforeEach, describe, expect, it } from 'vitest';
import {
  COFID_DATASET_URL,
  clearCofidDatasetCache,
  getCofidFoodDetails,
  mapCofidFood,
  parseCofidWorkbook,
  searchCofidFoods,
} from '../integrations/cofid/cofidService.js';
import { createMockXlsx } from './helpers/mockXlsx.js';

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const ID = ['Food Code', 'Food Name', 'Description', 'Group'];
const ID_PAD = [null, null, null, null, null, null, null];
const food = (code: string, name: string, group: string) => [
  code,
  name,
  'samples',
  group,
  null,
  'ref',
  null,
];

// The three sheets the service reads, laid out like CoFID 2021: labels in row
// 1, codes in row 2, a description row, then foods. 13-669 appears twice, as
// in the real dataset.
function buildWorkbook(): Buffer {
  return createMockXlsx({
    '1.1 Notes': [['Notes']],
    '1.3 Proximates': [
      [
        ...ID,
        'Previous',
        'Main data references',
        'Footnote',
        'Protein (g)',
        'Fat (g)',
        'Carbohydrate (g)',
        'Energy (kcal) (kcal)',
        'Total sugars (g)',
        'Alcohol (g)',
        'NSP (g)',
        'AOAC fibre (g)',
        'Satd FA /100g FA (g)',
        'Satd FA /100g fd (g)',
      ],
      [
        ...ID_PAD,
        'PROT',
        'FAT',
        'CHO',
        'KCALS',
        'TOTSUG',
        'ALCO',
        'ENGFIB',
        'AOACFIB',
        'SATFAC',
        'SATFOD',
      ],
      [...ID_PAD, 'Protein', 'Fat'],
      [
        ...food('13-532', 'Baked beans, canned in tomato sauce', 'DG'),
        5,
        0.5,
        15,
        81,
        4.8,
        null,
        3.8,
        4.9,
        20.1,
        0.1,
      ],
      [
        ...food('17-752', 'Wine, red', 'QE'),
        0.1,
        0,
        0.2,
        76,
        0.2,
        10.7,
        0,
        'N',
        'N',
        'N',
      ],
      [
        ...food('13-669', "Aubergine, roasted, cook's recipe", 'DG'),
        2.1,
        3.8,
        5.2,
        'N',
        'Tr',
        null,
        3,
        'N',
        null,
        0.3,
      ],
      [...food('13-669', 'Watercress, raw', 'DG'), 1.9, 0.3, 'Tr', 10],
    ],
    '1.4 Inorganics': [
      [
        ' ',
        'Food Name',
        'Description',
        'Group',
        'Previous',
        'Main data references',
        'Footnote',
        'Sodium (mg)',
        'Iron (mg)',
      ],
      [...ID_PAD, 'NA', 'FE'],
      [...ID_PAD, 'Sodium', 'Iron'],
      [
        ...food('13-532', 'Baked beans, canned in tomato sauce', 'DG'),
        261,
        1.4,
      ],
      [...food('17-752', 'Wine, red', 'QE'), 7, 0.9],
      [...food('13-669', "Aubergine, roasted, cook's recipe", 'DG'), 2, 'Tr'],
      [...food('13-669', 'Watercress, raw', 'DG'), 37, 2.2],
    ],
    '1.5 Vitamins': [
      [...ID, 'Previous', 'Main data references', 'Footnote', 'Vitamin C (mg)'],
      [...ID_PAD, 'VITC'],
      [...ID_PAD, 'Vitamin C'],
      [...food('13-532', 'Baked beans, canned in tomato sauce', 'DG'), 'Tr'],
    ],
  });
}

function respondWithWorkbook() {
  const workbook = buildWorkbook();
  mockFetch.mockResolvedValue(
    new Response(new Uint8Array(workbook), { status: 200 })
  );
}

describe('cofidService - parseCofidWorkbook', () => {
  it('merges the sheets per food and reads Tr as 0 and N as missing', () => {
    const dataset = parseCofidWorkbook(buildWorkbook());

    expect(dataset.foods.map((f) => f.code)).toEqual([
      '13-532',
      '17-752',
      '13-669',
      '13-669#2',
    ]);
    const beans = dataset.byCode.get('13-532');
    expect(beans?.values).toMatchObject({
      PROT: 5,
      KCALS: 81,
      NA: 261,
      FE: 1.4,
      VITC: 0,
    });
    const aubergine = dataset.byCode.get('13-669');
    expect(aubergine?.values.KCALS).toBeUndefined();
    expect(aubergine?.values.TOTSUG).toBe(0);
  });

  it('keeps foods that share a code apart', () => {
    const dataset = parseCofidWorkbook(buildWorkbook());

    expect(dataset.byCode.get('13-669')?.name).toBe(
      "Aubergine, roasted, cook's recipe"
    );
    expect(dataset.byCode.get('13-669')?.values.NA).toBe(2);
    expect(dataset.byCode.get('13-669#2')?.name).toBe('Watercress, raw');
    expect(dataset.byCode.get('13-669#2')?.values.NA).toBe(37);
  });

  it('skips fatty acid columns given per 100 g of fatty acids', () => {
    const dataset = parseCofidWorkbook(buildWorkbook());

    expect(dataset.columns.has('SATFAC')).toBe(false);
    expect(dataset.byCode.get('13-532')?.values.SATFAC).toBeUndefined();
    expect(dataset.columns.get('SATFOD')).toEqual({
      name: 'Satd FA /100g fd',
      unit: 'g',
    });
    expect(dataset.columns.get('KCALS')).toEqual({
      name: 'Energy (kcal)',
      unit: 'kcal',
    });
  });

  it('throws when the workbook has no foods', () => {
    const empty = createMockXlsx({
      '1.3 Proximates': [ID],
      '1.4 Inorganics': [ID],
      '1.5 Vitamins': [ID],
    });
    expect(() => parseCofidWorkbook(empty)).toThrow('contained no foods');
  });
});

describe('cofidService - mapCofidFood', () => {
  const dataset = parseCofidWorkbook(buildWorkbook());

  it('maps standard nutrients per 100 g and badges their labels', () => {
    const mapped = mapCofidFood(dataset.byCode.get('13-532')!, dataset.columns);

    expect(mapped).toMatchObject({
      name: 'Baked beans, canned in tomato sauce',
      provider_external_id: '13-532',
      provider_type: 'cofid',
      is_custom: false,
    });
    expect(mapped.default_variant).toMatchObject({
      serving_size: 100,
      serving_unit: 'g',
      calories: 81,
      protein: 5,
      carbs: 15,
      fat: 0.5,
      saturated_fat: 0.1,
      sugars: 4.8,
      dietary_fiber: 4.9,
      sodium: 261,
      iron: 1.4,
      vitamin_c: 0,
      is_default: true,
    });
    expect(mapped.default_variant.provider_nutrients).toMatchObject({
      'Energy (kcal)': 81,
      NSP: 3.8,
    });
    expect(mapped.default_variant.provider_nutrient_units?.Sodium).toBe('mg');
    expect(mapped.default_variant.provider_nutrient_standard).toMatchObject({
      'Energy (kcal)': 'calories',
      'AOAC fibre': 'dietary_fiber',
      Sodium: 'sodium',
    });
    expect(mapped.variants).toEqual([mapped.default_variant]);
  });

  it('gives alcoholic drinks per 100 ml', () => {
    const wine = mapCofidFood(dataset.byCode.get('17-752')!, dataset.columns);

    expect(wine.default_variant.serving_unit).toBe('ml');
    expect(wine.default_variant.alcohol_g).toBe(10.7);
  });

  it('falls back to NSP fibre and works out missing energy', () => {
    const aubergine = mapCofidFood(
      dataset.byCode.get('13-669')!,
      dataset.columns
    );

    expect(aubergine.default_variant.dietary_fiber).toBe(3);
    expect(aubergine.default_variant.provider_nutrient_standard?.NSP).toBe(
      'dietary_fiber'
    );
    // 2.1 * 4 + 5.2 * 4 + 3.8 * 9
    expect(aubergine.default_variant.calories).toBe(63);
    expect(
      aubergine.default_variant.provider_nutrient_standard?.['Energy (kcal)']
    ).toBeUndefined();
  });
});

describe('cofidService - search and details', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCofidDatasetCache();
  });

  it('downloads the dataset once and matches every search term', async () => {
    respondWithWorkbook();

    const beans = await searchCofidFoods('BEANS tomato', 1, 20);
    const roasted = await searchCofidFoods('roasted', 1, 20);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(COFID_DATASET_URL);
    expect(beans.foods.map((f) => f.name)).toEqual([
      'Baked beans, canned in tomato sauce',
    ]);
    expect(beans.pagination).toEqual({
      page: 1,
      pageSize: 20,
      totalCount: 1,
      hasMore: false,
    });
    expect(roasted.foods.map((f) => f.provider_external_id)).toEqual([
      '13-669',
    ]);
  });

  it('ignores apostrophes and punctuation in names and queries', async () => {
    respondWithWorkbook();

    const plain = await searchCofidFoods('cooks recipe');
    const quoted = await searchCofidFoods('Cook’s');
    const commas = await searchCofidFoods('watercress, raw');

    expect(plain.foods.map((f) => f.provider_external_id)).toEqual(['13-669']);
    expect(quoted.foods.map((f) => f.provider_external_id)).toEqual(['13-669']);
    expect(commas.foods.map((f) => f.provider_external_id)).toEqual([
      '13-669#2',
    ]);
  });

  it('pages through matches', async () => {
    respondWithWorkbook();

    const page2 = await searchCofidFoods('e', 2, 2);

    // No name starts with "e", so shorter names come first: Wine, red and
    // Watercress, raw on page 1, then the aubergine and the baked beans.
    expect(page2.foods.map((f) => f.provider_external_id)).toEqual([
      '13-669',
      '13-532',
    ]);
    expect(page2.pagination).toEqual({
      page: 2,
      pageSize: 2,
      totalCount: 4,
      hasMore: false,
    });
  });

  it('returns details by code, or null for an unknown code', async () => {
    respondWithWorkbook();

    const watercress = await getCofidFoodDetails('13-669#2');
    const missing = await getCofidFoodDetails('99-999');

    expect(watercress?.name).toBe('Watercress, raw');
    expect(watercress?.default_variant.calories).toBe(10);
    expect(missing).toBeNull();
  });

  it('retries the download after a failure', async () => {
    mockFetch.mockResolvedValueOnce(new Response('gone', { status: 503 }));

    await expect(searchCofidFoods('beans')).rejects.toThrow('HTTP 503');

    respondWithWorkbook();
    const result = await searchCofidFoods('beans');
    expect(result.foods).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
