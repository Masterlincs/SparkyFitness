import { vi, beforeEach, describe, expect, it } from 'vitest';
import {
  INTAKE24_FOODS_URL,
  INTAKE24_AS_SERVED_URL,
  INTAKE24_GUIDE_URL,
  INTAKE24_NUTRIENTS_URL,
  clearIntake24DatasetCache,
  getIntake24FoodDetails,
  mapIntake24Food,
  parseIntake24Data,
  portionUnitLabel,
  searchIntake24Foods,
} from '../integrations/intake24/intake24Service.js';

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const FOODS_XML = `<?xml version='1.0' encoding='utf-8'?>
<foods>
  <food code="BOEG" description="Boiled eggs" groupCode="1">
    <nutrient-table id="NDNS" code="10"/>
    <portion-size method="standard-portion" description="use_a_standard_portion" imageUrl="x.jpg" useForRecipes="true">
      <param name="units-count" value="2"/>
      <param name="unit0-name" value="medium_eggs"/>
      <param name="unit0-weight" value="50.0"/>
      <param name="unit1-name" value="sandwiches_made_with_two_slices_of_bread"/>
      <param name="unit1-weight" value="120.0"/>
    </portion-size>
  </food>
  <food code="BEAN" description="Baked beans &amp; sausages" groupCode="2">
    <nutrient-table id="NDNS" code="20"/>
    <portion-size method="as-served" description="use_an_image" imageUrl="x.jpg" useForRecipes="false">
      <param name="serving-image-set" value="beans"/>
      <param name="leftovers-image-set" value="beans_leftovers"/>
    </portion-size>
    <portion-size method="guide-image" description="in_a_can" imageUrl="x.jpg" useForRecipes="false">
      <param name="guide-image-id" value="Gcans"/>
    </portion-size>
  </food>
  <food code="TBLT" description="Sweetener tablets" groupCode="3">
    <nutrient-table id="NDNS" code="30"/>
  </food>
  <food code="NONE" description="No nutrient link" groupCode="3">
  </food>
</foods>`;

const AS_SERVED_XML = `<as-served-sets>
  <as-served-set description="Beans" id="beans">
    <as-served-image weight="150" url="3.jpg" />
    <as-served-image weight="40" url="1.jpg" />
    <as-served-image weight="90" url="2.jpg" />
  </as-served-set>
</as-served-sets>`;

const GUIDE_XML = `<guide-images>
  <guide-image id="Gcans" description="No description">
    <weight id="1" description="Heinz - standard tin" value="415.0"/>
    <weight id="2" description="No description" value="99.0"/>
  </guide-image>
</guide-images>`;

const NUTRIENTS_CSV = [
  'Food Code,Name,Base Value,Water,Estimate,Protein,Estimate,Fat,Estimate,Carbohydrate,Estimate,Energy (kcal),Estimate,Englyst fibre,Total sugars,Satd FA,Cis-Mon FA,Cis-n3 FA,Cis-n6 FA,Trans FA,Cholesterol,Vitamin A,Vitamin C,Sodium,Potassium,Calcium,Iron,Alcohol',
  '10,EGGS BOILED,100,75,,12.5,,10,,0,,143,,0,0,2.8,4,0.1,1.2,0,380,126,0,140,130,57,1.9,0',
  '20,BAKED BEANS WITH SAUSAGES,100,70,,6,,4.6,,12,,106,,3.1,4,1.5,,,,,,,,450,,,,',
  '30,SWEETENER TABLETS,1,0,,0,,0,,0,,0,,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0',
].join('\n');

const parse = () =>
  parseIntake24Data(FOODS_XML, AS_SERVED_XML, GUIDE_XML, NUTRIENTS_CSV);

function respondWithData() {
  const bodies: Record<string, string> = {
    [INTAKE24_FOODS_URL]: FOODS_XML,
    [INTAKE24_AS_SERVED_URL]: AS_SERVED_XML,
    [INTAKE24_GUIDE_URL]: GUIDE_XML,
    [INTAKE24_NUTRIENTS_URL]: NUTRIENTS_CSV,
  };
  mockFetch.mockImplementation(
    async (url: string) => new Response(bodies[url], { status: 200 })
  );
}

describe('intake24Service - portionUnitLabel', () => {
  it('makes the first plural word singular and drops underscores', () => {
    expect(portionUnitLabel('medium_handfuls')).toBe('medium handful');
    expect(portionUnitLabel('pastries')).toBe('pastry');
    expect(portionUnitLabel('glasses')).toBe('glass');
    expect(portionUnitLabel('sandwiches_made_with_two_slices_of_bread')).toBe(
      'sandwich made with two slices of bread'
    );
    expect(portionUnitLabel('treble_measures')).toBe('treble measure');
  });
});

describe('intake24Service - parseIntake24Data', () => {
  it('joins foods to NDNS nutrients and skips foods it cannot use', () => {
    const dataset = parse();

    expect(dataset.foods.map((f) => f.code)).toEqual(['BOEG', 'BEAN']);
    expect(dataset.byCode.get('BEAN')?.name).toBe('Baked beans & sausages');
    expect(dataset.byCode.get('BOEG')?.values).toMatchObject({
      protein: 12.5,
      calories: 143,
      sodium: 140,
    });
    expect(dataset.byCode.get('BEAN')?.values.monounsaturated_fat).toBe(
      undefined
    );
  });

  it('reads standard, as-served and guide-image portions', () => {
    const dataset = parse();

    expect(dataset.byCode.get('BOEG')?.portions).toEqual([
      { label: 'medium egg', grams: 50 },
      { label: 'sandwich made with two slices of bread', grams: 120 },
    ]);
    expect(dataset.byCode.get('BEAN')?.portions).toEqual([
      { label: 'small portion', grams: 40 },
      { label: 'medium portion', grams: 90 },
      { label: 'large portion', grams: 150 },
      { label: 'Heinz - standard tin', grams: 415 },
    ]);
  });

  it('throws when nothing could be read', () => {
    expect(() => parseIntake24Data('<foods/>', '', '', '')).toThrow(
      'contained no foods'
    );
  });
});

describe('intake24Service - mapIntake24Food', () => {
  it('keeps a per-100 g default and scales each portion', () => {
    const egg = mapIntake24Food(parse().byCode.get('BOEG')!);

    expect(egg).toMatchObject({
      name: 'Boiled eggs',
      provider_type: 'intake24',
      provider_external_id: 'BOEG',
    });
    expect(egg.default_variant).toMatchObject({
      serving_size: 100,
      serving_unit: 'g',
      calories: 143,
      protein: 12.5,
      polyunsaturated_fat: 1.3,
      is_default: true,
    });
    expect(egg.variants[1]).toMatchObject({
      serving_size: 1,
      serving_unit: 'medium egg (50 g)',
      calories: 72,
      protein: 6.3,
      is_default: false,
    });
    expect(egg.default_variant.provider_nutrient_standard).toMatchObject({
      'Energy (kcal)': 'calories',
      Protein: 'protein',
    });
  });
});

describe('intake24Service - search and details', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearIntake24DatasetCache();
  });

  it('downloads the four data files once and searches names', async () => {
    respondWithData();

    const eggs = await searchIntake24Foods('egg');
    const beans = await searchIntake24Foods('beans sausages');

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(eggs.foods.map((f) => f.provider_external_id)).toEqual(['BOEG']);
    expect(beans.foods.map((f) => f.name)).toEqual(['Baked beans & sausages']);
  });

  it('returns details by code, or null for an unknown code', async () => {
    respondWithData();

    expect((await getIntake24FoodDetails('BEAN'))?.variants).toHaveLength(5);
    expect(await getIntake24FoodDetails('ZZZZ')).toBeNull();
  });

  it('retries after a failed download', async () => {
    mockFetch.mockResolvedValue(new Response('down', { status: 502 }));
    await expect(searchIntake24Foods('egg')).rejects.toThrow('HTTP 502');

    respondWithData();
    expect((await searchIntake24Foods('egg')).foods).toHaveLength(1);
  });
});
