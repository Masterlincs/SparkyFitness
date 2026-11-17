-- Migration: Add UK Foods & Portions (Intake24) provider type
-- File: SparkyFitnessServer/db/migrations/20261117140000_add_intake24_provider_type.sql


-- 1. Insert 'intake24' into external_provider_types lookup table
INSERT INTO public.external_provider_types (id, display_name, description)
VALUES (
  'intake24',
  'UK Foods & Portions (Intake24)',
  'Intake24 UK food database: ~2,500 everyday UK foods with NDNS nutrients and household portion sizes.'
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

UPDATE public.external_provider_types
SET categories = ARRAY['food'],
    required_fields = ARRAY[]::VARCHAR[],
    is_strictly_private = FALSE,
    supports_barcode = FALSE
WHERE id = 'intake24';

-- 2. Update create_global_default_providers to include intake24
CREATE OR REPLACE FUNCTION public.create_global_default_providers(p_admin_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Free Exercise DB
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'Free Exercise DB', 'free-exercise-db', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;

  -- Wger
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'Wger', 'wger', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;

  -- Open Food Facts
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'Open Food Facts', 'openfoodfacts', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;

  -- Swiss Food Database
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'Swiss Food Database', 'swissfood', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;

  -- Canadian Nutrient File
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'Canadian Nutrient File', 'canadian-nutrient-file', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;

  -- Swedish Food Agency (Livsmedelsverket)
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'Swedish Food Agency (Livsmedelsverket)', 'livsmedelsverket', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;

  -- McCance and Widdowson's CoFID (UK)
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'McCance and Widdowson''s CoFID (UK)', 'cofid', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;

  -- UK Foods & Portions (Intake24)
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'UK Foods & Portions (Intake24)', 'intake24', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;

  -- NIH Dietary Supplement Label Database
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'NIH Dietary Supplement Label Database', 'dsld', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;
END;
$$;

-- 3. Seed for existing admin user if one exists
DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT id INTO v_admin_id FROM public."user" WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL THEN
    INSERT INTO public.external_data_providers (
      user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
    ) VALUES (
      v_admin_id, 'UK Foods & Portions (Intake24)', 'intake24', TRUE, TRUE, now(), now()
    ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;
  END IF;
END $$;
