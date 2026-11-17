-- Migration: store the Nutri-Score letter Open Food Facts reports for a food,
-- so a product keeps its grade after it is imported into the library.
-- File: SparkyFitnessServer/db/migrations/20261117130000_add_food_nutriscore_grade.sql

ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS nutriscore_grade TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_foods_nutriscore_grade'
  ) THEN
    ALTER TABLE public.foods
      ADD CONSTRAINT chk_foods_nutriscore_grade
      CHECK (nutriscore_grade IS NULL OR nutriscore_grade IN ('a', 'b', 'c', 'd', 'e'));
  END IF;
END $$;
