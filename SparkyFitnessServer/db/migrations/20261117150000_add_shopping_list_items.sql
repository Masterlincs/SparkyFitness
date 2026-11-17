-- Migration: shopping list
-- File: SparkyFitnessServer/db/migrations/20261117150000_add_shopping_list_items.sql
--
-- One row per thing to buy. Items come from typing them in or from a meal
-- plan; food_id links an item back to the library food it was made from.

CREATE TABLE IF NOT EXISTS public.shopping_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  quantity NUMERIC(10, 2) CHECK (quantity IS NULL OR quantity > 0),
  unit TEXT CHECK (unit IS NULL OR char_length(unit) <= 40),
  food_id UUID REFERENCES public.foods(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'meal_plan')),
  checked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_user
  ON public.shopping_list_items (user_id, checked, created_at);
