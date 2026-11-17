// Helpers for food providers that ship as one downloadable dataset searched in
// memory (CoFID, Intake24) rather than through a search API.

// "Shepherd's pie" matches "shepherds pie"; commas and brackets in names
// ("Beans, baked") do not get in the way of a term.
export function datasetSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Items whose name contains every term of the query. Names that start with
 * the first term ("Toast, white bread") come first, then names where every
 * term starts a word ("Melba toast"), then names that only contain a term
 * ("tea" in "steak"); shorter names first, otherwise in dataset order.
 */
export function matchDatasetItems<T>(
  items: readonly T[],
  query: string,
  nameOf: (item: T) => string
): T[] {
  const terms = datasetSearchText(query).split(' ').filter(Boolean);
  const matched: Array<{
    item: T;
    rank: number;
    length: number;
    index: number;
  }> = [];
  items.forEach((item, index) => {
    const name = datasetSearchText(nameOf(item));
    if (!terms.every((term) => name.includes(term))) return;
    const words = name.split(' ');
    const atWordStart = terms.every((term) =>
      words.some((word) => word.startsWith(term))
    );
    const leads = terms[0] !== undefined && name.startsWith(terms[0]);
    matched.push({
      item,
      rank: atWordStart ? (leads ? 0 : 1) : 2,
      length: words.length,
      index,
    });
  });
  return matched
    .sort((a, b) => a.rank - b.rank || a.length - b.length || a.index - b.index)
    .map(({ item }) => item);
}

export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number
) {
  const offset = (page - 1) * pageSize;
  return {
    items: items.slice(offset, offset + pageSize),
    pagination: {
      page,
      pageSize,
      totalCount: items.length,
      hasMore: offset + pageSize < items.length,
    },
  };
}

/**
 * Loads a dataset once per process and shares the result. A failed load is
 * forgotten, so the next caller tries again.
 */
export function createDatasetLoader<T>(load: () => Promise<T>) {
  let pending: Promise<T> | null = null;
  return {
    get(): Promise<T> {
      if (!pending) {
        pending = load().catch((error) => {
          pending = null;
          throw error;
        });
      }
      return pending;
    },
    clear(): void {
      pending = null;
    },
  };
}
