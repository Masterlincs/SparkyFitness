// Turns what someone says or types about food ("two eggs and a slice of
// toast", "500 ml semi-skimmed milk") and recipe ingredient lines
// ("2 lb (900 g) neck of lamb, diced") into an amount, a unit and a food name.
// Matching the name to a food is the server's job; this only reads the words.

export type PortionSize = 'small' | 'medium' | 'large';

export interface ParsedFoodPhrase {
  /** The phrase as it was given. */
  raw: string;
  /** Number of units; null when no amount was given ("toast"). */
  quantity: number | null;
  /** Canonical unit ("g", "ml", "tbsp", "slice"), or null for a count. */
  unit: string | null;
  /** Size word given with a count ("a large egg"). */
  size: PortionSize | null;
  /** What was eaten, without amounts, units or preparation notes. */
  name: string;
  /** Preparation after a comma in a recipe line ("diced"). */
  note: string | null;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  half: 0.5,
  quarter: 0.25,
  couple: 2,
  few: 3,
  dozen: 12,
};

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅛': 0.125,
};

// Spoken and written unit words mapped to the unit the app stores. Weight and
// volume units match servingSizeConversions; the rest are household units a
// food's portions are named after.
const UNIT_WORDS: Record<string, string> = {
  g: 'g',
  gm: 'g',
  gms: 'g',
  gr: 'g',
  gram: 'g',
  grams: 'g',
  gramme: 'g',
  grammes: 'g',
  kg: 'kg',
  kgs: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  ml: 'ml',
  mls: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  l: 'l',
  litre: 'l',
  litres: 'l',
  liter: 'l',
  liters: 'l',
  pint: 'pint',
  pints: 'pint',
  tbsp: 'tbsp',
  tbs: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  cup: 'cup',
  cups: 'cup',
  mug: 'mug',
  mugs: 'mug',
  glass: 'glass',
  glasses: 'glass',
  can: 'can',
  cans: 'can',
  tin: 'tin',
  tins: 'tin',
  slice: 'slice',
  slices: 'slice',
  piece: 'piece',
  pieces: 'piece',
  bowl: 'bowl',
  bowls: 'bowl',
  bowlful: 'bowl',
  portion: 'portion',
  portions: 'portion',
  serving: 'serving',
  servings: 'serving',
  handful: 'handful',
  handfuls: 'handful',
  packet: 'packet',
  packets: 'packet',
  pack: 'packet',
  packs: 'packet',
  bag: 'bag',
  bags: 'bag',
  bar: 'bar',
  bars: 'bar',
  pot: 'pot',
  pots: 'pot',
  tub: 'tub',
  tubs: 'tub',
  bottle: 'bottle',
  bottles: 'bottle',
  rasher: 'rasher',
  rashers: 'rasher',
  fillet: 'fillet',
  fillets: 'fillet',
  clove: 'clove',
  cloves: 'clove',
  pinch: 'pinch',
  dash: 'dash',
  knob: 'knob',
  sprinkle: 'sprinkle',
  splash: 'splash',
};

const SIZE_WORDS: Record<string, PortionSize> = {
  small: 'small',
  little: 'small',
  medium: 'medium',
  regular: 'medium',
  large: 'large',
  big: 'large',
  huge: 'large',
};

// Words that carry no food meaning at the start of a phrase.
const LEADING_FILLER =
  /^(?:i\s+(?:had|ate|drank)\s+|(?:i've|i have)\s+(?:had|eaten)\s+|some\s+|a\s+bit\s+of\s+|a\s+little\s+(?:bit\s+of\s+)?|about\s+|around\s+|roughly\s+|approximately\s+)+/i;

const NUMBER_TOKEN = /^(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+)|\/(\d+))?/;
const FRACTION_TOKEN = /^([½⅓⅔¼¾⅛])/;

/** The first word of the text, lower-cased, and the text after it. */
function firstWord(text: string): { word: string; rest: string } | null {
  const match = /^([a-z]+)\b/i.exec(text);
  const word = match?.[1];
  return word
    ? { word: word.toLowerCase(), rest: text.slice(word.length).trim() }
    : null;
}

function readFraction(text: string): { value: number; rest: string } | null {
  const symbol = FRACTION_TOKEN.exec(text)?.[1];
  const value = symbol ? UNICODE_FRACTIONS[symbol] : undefined;
  return value === undefined ? null : { value, rest: text.slice(1).trim() };
}

function readNumber(text: string): { value: number; rest: string } | null {
  const fraction = readFraction(text);
  if (fraction) return fraction;

  const digits = NUMBER_TOKEN.exec(text);
  if (digits) {
    const [whole, base, mixedTop, mixedBottom, bottom] = digits;
    let value = Number(base);
    if (mixedTop && mixedBottom) {
      value += Number(mixedTop) / Number(mixedBottom);
    } else if (bottom) {
      value /= Number(bottom);
    }
    let rest = text.slice(whole.length).trim();
    // "1½"
    const trailing = readFraction(rest);
    if (trailing) {
      value += trailing.value;
      rest = trailing.rest;
    }
    return Number.isFinite(value) && value > 0 ? { value, rest } : null;
  }

  const first = firstWord(text);
  const firstValue = first ? NUMBER_WORDS[first.word] : undefined;
  if (!first || firstValue === undefined) return null;
  let value = firstValue;
  let rest = first.rest;
  // "a couple of", "a dozen", "a half"
  const next = firstWord(rest);
  const nextValue = next ? NUMBER_WORDS[next.word] : undefined;
  if (
    (first.word === 'a' || first.word === 'an') &&
    next &&
    nextValue !== undefined
  ) {
    value = nextValue;
    rest = next.rest;
  }
  // "half a"
  if (first.word === 'half') rest = rest.replace(/^an?\b\s*/i, '');
  return { value, rest: rest.replace(/^of\b\s*/i, '') };
}

function readUnit(text: string): { unit: string; rest: string } | null {
  // "2x", "2 x"
  const cleaned = text.replace(/^x\s+/i, '');
  const fluid = /^fl\.?\s*oz\b\.?/i.exec(cleaned);
  if (fluid) {
    return { unit: 'fl oz', rest: cleaned.slice(fluid[0].length).trim() };
  }
  const match = /^([a-z]+)\.?(?=\s|$|[^a-z])/i.exec(cleaned);
  const word = match?.[1];
  const unit = word ? UNIT_WORDS[word.toLowerCase()] : undefined;
  if (!match || !unit) return null;
  const rest = cleaned
    .slice(match[0].length)
    .trim()
    .replace(/^of\b\s*/i, '');
  // "2 g" must leave a food behind; a bare "can" or "bar" is the food.
  return rest ? { unit, rest } : null;
}

function readSize(text: string): { size: PortionSize; rest: string } | null {
  const first = firstWord(text);
  const size = first ? SIZE_WORDS[first.word] : undefined;
  return first && size && first.rest ? { size, rest: first.rest } : null;
}

// "2 lb (900 g) neck of lamb": the metric amount in brackets wins.
function metricInBrackets(
  text: string
): { quantity: number; unit: string } | null {
  const inside = /\(([^)]*)\)/.exec(text)?.[1];
  const amount = inside ? readNumber(inside.trim()) : null;
  if (!amount) return null;
  const unit = /^(g|kg|ml|l)\b/i.exec(amount.rest)?.[1];
  return unit ? { quantity: amount.value, unit: unit.toLowerCase() } : null;
}

/** Reads one food phrase or recipe ingredient line. */
export function parseFoodPhrase(raw: string): ParsedFoodPhrase {
  let text = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-*•]\s*/, '');
  text = text.replace(LEADING_FILLER, '');

  const metric = metricInBrackets(text);
  let quantity: number | null = null;
  let unit: string | null = null;
  let size: PortionSize | null = null;

  const number = readNumber(text);
  if (number) {
    quantity = number.value;
    text = number.rest;
    const unitWord = readUnit(text);
    if (unitWord) {
      unit = unitWord.unit;
      text = unitWord.rest;
    }
  }
  // Sizes come after a count or a household unit: "2 large eggs", "a large bowl of".
  const sizeWord = readSize(text);
  if (sizeWord) {
    size = sizeWord.size;
    text = sizeWord.rest;
    if (!unit) {
      const unitAfterSize = readUnit(text);
      if (unitAfterSize) {
        unit = unitAfterSize.unit;
        text = unitAfterSize.rest;
      }
    }
  }
  if (metric) {
    quantity = metric.quantity;
    unit = metric.unit;
  }

  text = text.replace(/\([^)]*\)/g, ' ');
  let note: string | null = null;
  const comma = text.indexOf(',');
  if (comma >= 0) {
    note = text.slice(comma + 1).trim() || null;
    text = text.slice(0, comma);
  }
  const name = text
    .replace(/^(?:of|the)\s+/i, '')
    .replace(/[.;:!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { raw, quantity, unit, size, name, note };
}

/**
 * Splits a spoken or typed list into phrases: lines, commas, semicolons,
 * "and", "plus" and "&". "Fish and chips" becomes two foods, which logs the
 * same meal.
 */
export function splitFoodPhrases(text: string): string[] {
  return text
    .split(/\r?\n|[,;]|\s+(?:and|plus|&|then)\s+/i)
    .map((part) =>
      part
        .trim()
        .replace(/^(?:(?:and|plus|then|also)\b|&)\s*/i, '')
        .trim()
    )
    .filter((part) => /[a-z]/i.test(part));
}

/** Splits and reads a spoken or typed list of foods. */
export function parseFoodPhrases(text: string): ParsedFoodPhrase[] {
  return splitFoodPhrases(text)
    .map(parseFoodPhrase)
    .filter((phrase) => phrase.name.length > 0);
}
