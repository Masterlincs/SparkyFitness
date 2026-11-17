import { z } from 'zod';

// Logging several foods from one spoken or typed sentence.

export const quickLogMatchBodySchema = z.object({
  text: z.string().trim().min(1).max(1000),
});
export type QuickLogMatchBody = z.infer<typeof quickLogMatchBodySchema>;

const quantitySchema = z.number().positive().max(100_000);

export const quickLogItemSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('library'),
    food_id: z.uuid(),
    variant_id: z.uuid(),
    quantity: quantitySchema,
    unit: z.string().trim().min(1).max(60),
  }),
  z.object({
    source: z.enum(['intake24', 'cofid']),
    provider_external_id: z.string().trim().min(1).max(40),
    serving_size: z.number().positive(),
    serving_unit: z.string().trim().min(1).max(120),
    quantity: quantitySchema,
  }),
]);
export type QuickLogItem = z.infer<typeof quickLogItemSchema>;

export const quickLogBodySchema = z.object({
  entry_date: z.iso.date(),
  meal_type_id: z.uuid(),
  items: z.array(quickLogItemSchema).min(1).max(20),
});
export type QuickLogBody = z.infer<typeof quickLogBodySchema>;

// POST /api/v2/quick-log/match response.

export type QuickLogSource = 'library' | 'intake24' | 'cofid';

export interface QuickLogVariant {
  id?: string;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  [nutrient: string]: unknown;
}

export interface QuickLogCandidate {
  source: QuickLogSource;
  food_id: string | null;
  provider_external_id: string | null;
  name: string;
  brand: string | null;
  variants: QuickLogVariant[];
  /** Index into variants of the portion chosen for the phrase. */
  variant_index: number;
  /** Amount in the chosen variant's serving unit. */
  quantity: number;
}

export interface QuickLogMatchItem {
  phrase: {
    raw: string;
    quantity: number | null;
    unit: string | null;
    size: 'small' | 'medium' | 'large' | null;
    name: string;
    note: string | null;
  };
  match: QuickLogCandidate | null;
  alternatives: QuickLogCandidate[];
}

export interface QuickLogMatchResponse {
  items: QuickLogMatchItem[];
}
