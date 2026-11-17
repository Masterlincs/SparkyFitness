import { describe, expect, it } from 'vitest';
import {
  parseFoodPhrase,
  parseFoodPhrases,
  splitFoodPhrases,
} from '@workspace/shared';

const parsed = (text: string) => {
  const { quantity, unit, size, name, note } = parseFoodPhrase(text);
  return { quantity, unit, size, name, note };
};

describe('parseFoodPhrase', () => {
  it.each([
    ['two eggs', { quantity: 2, unit: null, size: null, name: 'eggs' }],
    ['a slice of toast', { quantity: 1, unit: 'slice', name: 'toast' }],
    [
      '500 ml semi-skimmed milk',
      { quantity: 500, unit: 'ml', name: 'semi-skimmed milk' },
    ],
    ['250g beef mince', { quantity: 250, unit: 'g', name: 'beef mince' }],
    ['half a banana', { quantity: 0.5, unit: null, name: 'banana' }],
    ['1 1/2 cups rice', { quantity: 1.5, unit: 'cup', name: 'rice' }],
    ['½ tin baked beans', { quantity: 0.5, unit: 'tin', name: 'baked beans' }],
    ['a couple of biscuits', { quantity: 2, unit: null, name: 'biscuits' }],
    ['2 large eggs', { quantity: 2, unit: null, size: 'large', name: 'eggs' }],
    [
      'a large bowl of porridge',
      { quantity: 1, unit: 'bowl', size: 'large', name: 'porridge' },
    ],
    ['3 tbsp. olive oil', { quantity: 3, unit: 'tbsp', name: 'olive oil' }],
    [
      '10 fl oz orange juice',
      { quantity: 10, unit: 'fl oz', name: 'orange juice' },
    ],
    ['I had some toast', { quantity: null, unit: null, name: 'toast' }],
    ['toast', { quantity: null, unit: null, name: 'toast' }],
  ])('reads "%s"', (text, expected) => {
    expect(parsed(text)).toMatchObject(expected);
  });

  it('reads recipe lines: metric in brackets wins and notes are kept apart', () => {
    expect(parsed('*2 lb (900 g) neck of lamb or mutton')).toMatchObject({
      quantity: 900,
      unit: 'g',
      name: 'neck of lamb or mutton',
    });
    expect(parsed('2 large potatoes, sliced')).toMatchObject({
      quantity: 2,
      size: 'large',
      name: 'potatoes',
      note: 'sliced',
    });
  });

  it('keeps a unit word that is the food itself', () => {
    expect(parsed('a can')).toMatchObject({
      quantity: 1,
      unit: null,
      name: 'can',
    });
  });
});

describe('splitFoodPhrases', () => {
  it('splits spoken and typed lists', () => {
    expect(
      splitFoodPhrases('two eggs and a slice of toast, a coffee\nplus an apple')
    ).toEqual(['two eggs', 'a slice of toast', 'a coffee', 'an apple']);
  });

  it('drops empty and number-only parts', () => {
    expect(parseFoodPhrases('and, 2, banana').map((p) => p.name)).toEqual([
      'banana',
    ]);
  });
});
