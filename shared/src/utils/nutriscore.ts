// Nutri-Score letters as Open Food Facts reports them. OFF also sends
// "unknown" and "not-applicable", which mean there is no grade.
export const NUTRISCORE_GRADES = ['a', 'b', 'c', 'd', 'e'] as const;

export type NutriscoreGrade = (typeof NUTRISCORE_GRADES)[number];

export function normalizeNutriscoreGrade(
  grade: unknown
): NutriscoreGrade | null {
  if (typeof grade !== 'string') return null;
  const letter = grade.trim().toLowerCase();
  return (NUTRISCORE_GRADES as readonly string[]).includes(letter)
    ? (letter as NutriscoreGrade)
    : null;
}
