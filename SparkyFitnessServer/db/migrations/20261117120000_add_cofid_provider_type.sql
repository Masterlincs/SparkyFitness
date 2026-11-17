-- Migration: Add McCance and Widdowson's CoFID (UK) provider type
-- File: SparkyFitnessServer/db/migrations/20261117120000_add_cofid_provider_type.sql


-- 1. Insert 'cofid' into external_provider_types lookup table
INSERT INTO public.external_provider_types (id, display_name, description)
VALUES (
  'cofid',
  'McCance and Widdowson''s CoFID (UK)',
  'UK Composition of Foods Integrated Dataset (CoFID) 2021 reporting nutritional values for ~2,900 foods eaten in the UK.'
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

UPDATE public.external_provider_types
SET categories = ARRAY['food'],
    required_fields = ARRAY[]::VARCHAR[],
    is_strictly_private = FALSE,
    supports_barcode = FALSE
WHERE id = 'cofid';

-- 2. Update create_global_default_providers to include cofid
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
      v_admin_id, 'McCance and Widdowson''s CoFID (UK)', 'cofid', TRUE, TRUE, now(), now()
    ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;
  END IF;
END $$;
