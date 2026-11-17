import { describe, expect, it } from 'vitest';
import { normalizeNutriscoreGrade } from '@workspace/shared';
import { mapOpenFoodFactsProduct } from '../integrations/openfoodfacts/openFoodFactsService.js';

const product = (nutriscore_grade?: unknown) => ({
  product_name: 'Digestive biscuits',
  code: '5000168001142',
  nutriments: { 'energy-kcal_100g': 480 },
  nutriscore_grade,
});

describe('OpenFoodFacts Nutri-Score mapping', () => {
  it('keeps a reported grade as a lower-case letter', () => {
    expect(mapOpenFoodFactsProduct(product('D')).nutriscore_grade).toBe('d');
    expect(mapOpenFoodFactsProduct(product('a')).nutriscore_grade).toBe('a');
  });

  it('drops OFF placeholders and missing grades', () => {
    expect(
      mapOpenFoodFactsProduct(product('unknown')).nutriscore_grade
    ).toBeNull();
    expect(
      mapOpenFoodFactsProduct(product('not-applicable')).nutriscore_grade
    ).toBeNull();
    expect(mapOpenFoodFactsProduct(product()).nutriscore_grade).toBeNull();
  });
});

describe('normalizeNutriscoreGrade', () => {
  it('accepts only the letters a to e', () => {
    expect(normalizeNutriscoreGrade(' E ')).toBe('e');
    expect(normalizeNutriscoreGrade('f')).toBeNull();
    expect(normalizeNutriscoreGrade(3)).toBeNull();
    expect(normalizeNutriscoreGrade(null)).toBeNull();
  });
});
