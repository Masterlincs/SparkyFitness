import { describe, expect, it } from 'vitest';
import {
  createDatasetLoader,
  datasetSearchText,
  matchDatasetItems,
  paginate,
} from '../utils/datasetSearch.js';

describe('datasetSearch', () => {
  it('normalises apostrophes and punctuation', () => {
    expect(datasetSearchText("Shepherd's pie, (homemade)")).toBe(
      'shepherds pie homemade'
    );
  });

  it('ranks names that start with the term, then whole words, then substrings', () => {
    const names = [
      'Beef fillet steak, fried',
      'Melba toast',
      'Toast, white bread',
      'Tea',
      'Iced tea',
    ];

    expect(matchDatasetItems(names, 'tea', (n) => n)).toEqual([
      'Tea',
      'Iced tea',
      'Beef fillet steak, fried',
    ]);
    expect(matchDatasetItems(names, 'toast', (n) => n)).toEqual([
      'Toast, white bread',
      'Melba toast',
    ]);
  });

  it('pages and reports whether more remain', () => {
    expect(paginate([1, 2, 3], 2, 2)).toEqual({
      items: [3],
      pagination: { page: 2, pageSize: 2, totalCount: 3, hasMore: false },
    });
  });

  it('loads once, and again after a failure', async () => {
    let calls = 0;
    const loader = createDatasetLoader(async () => {
      calls += 1;
      if (calls === 1) throw new Error('down');
      return calls;
    });

    await expect(loader.get()).rejects.toThrow('down');
    expect(await loader.get()).toBe(2);
    expect(await loader.get()).toBe(2);
  });
});
