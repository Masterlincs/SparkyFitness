import { describe, expect, it, vi } from 'vitest';
import {
  choosePortion,
  nameScore,
} from '../services/foodPhraseMatchService.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const egg = [
  { serving_size: 100, serving_unit: 'g' },
  { serving_size: 1, serving_unit: 'small egg (47 g)' },
  { serving_size: 1, serving_unit: 'medium egg (50 g)' },
  { serving_size: 1, serving_unit: 'large egg (61 g)' },
];
const bread = [
  { serving_size: 100, serving_unit: 'g' },
  { serving_size: 1, serving_unit: 'small portion (40 g)' },
  { serving_size: 1, serving_unit: 'Bread sliced, medium (27 g)' },
];

describe('choosePortion', () => {
  it('converts a weight or volume into the matching reference', () => {
    expect(
      choosePortion({ quantity: 250, unit: 'g', size: null }, egg)
    ).toEqual({ variantIndex: 0, quantity: 250 });
    expect(choosePortion({ quantity: 8, unit: 'oz', size: null }, egg)).toEqual(
      { variantIndex: 0, quantity: 226.8 }
    );
    expect(
      choosePortion({ quantity: 1, unit: 'pint', size: null }, [
        { serving_size: 100, serving_unit: 'ml' },
      ])
    ).toEqual({ variantIndex: 0, quantity: 568.3 });
  });

  it('uses the medium single-item portion for a bare count', () => {
    expect(choosePortion({ quantity: 2, unit: null, size: null }, egg)).toEqual(
      { variantIndex: 2, quantity: 2 }
    );
  });

  it('uses the size that was said', () => {
    expect(
      choosePortion({ quantity: 1, unit: null, size: 'large' }, egg)
    ).toEqual({ variantIndex: 3, quantity: 1 });
  });

  it('matches a household unit by name', () => {
    expect(
      choosePortion({ quantity: 2, unit: 'slice', size: null }, bread)
    ).toEqual({ variantIndex: 2, quantity: 2 });
  });

  it('falls back to servings of the first portion when nothing fits', () => {
    expect(
      choosePortion({ quantity: 2, unit: 'bowl', size: null }, [
        { serving_size: 100, serving_unit: 'g' },
      ])
    ).toEqual({ variantIndex: 0, quantity: 200 });
  });
});

describe('nameScore', () => {
  it('prefers names containing every word, and shorter names', () => {
    expect(nameScore('eggs', 'Boiled eggs')).toBeGreaterThan(
      nameScore('eggs', 'Scotch eggs with sausage meat coating')
    );
    expect(nameScore('baked beans', 'Baked beans')).toBeGreaterThan(
      nameScore('baked beans', 'Beans, green, boiled')
    );
    expect(nameScore('toast', 'Bananas')).toBeLessThanOrEqual(0);
  });
});
