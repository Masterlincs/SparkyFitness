import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../services/foodIntegrationService.js', () => ({
  getFatSecretNutrients: vi.fn(),
  searchFatSecretFoods: vi.fn(),
  searchMealieFoods: vi.fn(),
  searchTandoorFoods: vi.fn(),
  searchNorishFoods: vi.fn(),
}));

vi.mock('../integrations/fatsecret/fatsecretService.js', () => ({
  mapFatSecretSearchItem: vi.fn((item) => item),
  mapFatSecretFood: vi.fn(),
  foodNutrientCache: new Map(),
  getFatSecretAccessToken: vi.fn(),
}));

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../services/externalProviderService.js', () => ({
  default: {
    getExternalDataProviderDetails: vi.fn(),
    getActiveOpenFoodFactsProviderId: vi.fn(),
  },
}));
vi.mock('../services/preferenceService.js', () => ({
  default: { getUserPreferences: vi.fn() },
}));
vi.mock('../integrations/openfoodfacts/openFoodFactsService.js', () => ({
  searchOpenFoodFacts: vi.fn(),
  mapOpenFoodFactsProduct: vi.fn(),
}));
vi.mock('../integrations/usda/usdaService.js', () => ({
  searchUsdaFoods: vi.fn(),
  mapUsdaBarcodeProduct: vi.fn(),
}));
vi.mock('../integrations/yazio/yazioService.js', () => ({
  searchYazioFoods: vi.fn(),
}));
vi.mock('../integrations/swissfood/swissFoodService.js', () => ({
  searchSwissFoods: vi.fn(),
}));
vi.mock('../integrations/cnf/cnfService.js', () => ({
  searchCanadianNutrientFoods: vi.fn(),
  getCanadianNutrientFoodDetails: vi.fn(),
}));
vi.mock('../integrations/livsmedelsverket/livsmedelsverketService.js', () => ({
  searchLivsmedelsverketFoods: vi.fn(),
  getLivsmedelsverketFoodDetails: vi.fn(),
}));
vi.mock('../integrations/cofid/cofidService.js', () => ({
  searchCofidFoods: vi.fn(),
  getCofidFoodDetails: vi.fn(),
}));
vi.mock('../integrations/intake24/intake24Service.js', () => ({
  searchIntake24Foods: vi.fn(),
  getIntake24FoodDetails: vi.fn(),
}));

import {
  searchCofidFoods,
  getCofidFoodDetails,
} from '../integrations/cofid/cofidService.js';
import {
  searchIntake24Foods,
  getIntake24FoodDetails,
} from '../integrations/intake24/intake24Service.js';
import {
  searchProviderFoods,
  resolveProviderCredentials,
} from '../services/externalFoodSearchService.js';
import { fetchProviderFoodDetails } from '../services/foodProviderDetailService.js';

const mockSearchCofidFoods = vi.mocked(searchCofidFoods);
const mockGetCofidFoodDetails = vi.mocked(getCofidFoodDetails);

const beans = {
  name: 'Baked beans, canned in tomato sauce',
  brand: "McCance and Widdowson's CoFID (UK)",
  provider_external_id: '13-532',
  provider_type: 'cofid' as const,
  is_custom: false,
  default_variant: {
    serving_size: 100,
    serving_unit: 'g',
    calories: 81,
    protein: 5,
    carbs: 15,
    fat: 0.5,
    is_default: true,
  },
  variants: [],
};

describe('externalFoodSearchService - cofid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('needs no credentials when providerId is omitted', async () => {
    const creds = await resolveProviderCredentials(
      'user-1',
      undefined,
      'cofid'
    );
    expect(creds).toEqual({});
  });

  it('delegates search to searchCofidFoods and ranks matches', async () => {
    mockSearchCofidFoods.mockResolvedValue({
      foods: [beans],
      pagination: { page: 1, pageSize: 20, totalCount: 1, hasMore: false },
    });

    const res = await searchProviderFoods('user-1', 'cofid', 'baked beans', {
      page: 1,
      pageSize: 20,
    });

    expect(mockSearchCofidFoods).toHaveBeenCalledWith('baked beans', 1, 20);
    expect(res.foods).toHaveLength(1);
    expect((res.foods[0] as { name: string }).name).toBe(beans.name);
  });

  it('delegates details to getCofidFoodDetails without a providerId', async () => {
    mockGetCofidFoodDetails.mockResolvedValue(beans);

    const result = await fetchProviderFoodDetails({
      credentialUserId: 'user-1',
      dataUserId: 'user-1',
      providerType: 'cofid',
      externalId: '13-532',
      language: 'en',
    });

    expect(mockGetCofidFoodDetails).toHaveBeenCalledWith('13-532');
    expect((result as { name: string } | null)?.name).toBe(beans.name);
  });
});

describe('externalFoodSearchService - intake24', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const egg = {
    ...beans,
    name: 'Boiled eggs',
    brand: 'Intake24 (UK)',
    provider_external_id: 'BOEG',
    provider_type: 'intake24' as const,
  };

  it('delegates search and details without credentials', async () => {
    vi.mocked(searchIntake24Foods).mockResolvedValue({
      foods: [egg],
      pagination: { page: 1, pageSize: 20, totalCount: 1, hasMore: false },
    });
    vi.mocked(getIntake24FoodDetails).mockResolvedValue(egg);

    const res = await searchProviderFoods('user-1', 'intake24', 'egg', {
      page: 1,
      pageSize: 20,
    });
    const details = await fetchProviderFoodDetails({
      credentialUserId: 'user-1',
      dataUserId: 'user-1',
      providerType: 'intake24',
      externalId: 'BOEG',
      language: 'en',
    });

    expect(searchIntake24Foods).toHaveBeenCalledWith('egg', 1, 20);
    expect(res.foods).toHaveLength(1);
    expect(getIntake24FoodDetails).toHaveBeenCalledWith('BOEG');
    expect((details as { name: string } | null)?.name).toBe('Boiled eggs');
  });
});
