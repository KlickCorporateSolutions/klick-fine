-- ============================================================
-- Klick FINE — Fix Onboarding RLS
-- Migration: 0002_create_organization_with_owner
--
-- Problema: ao criar a primeira org, o INSERT + .select() encadeado
-- falhava porque a SELECT policy só permite ver orgs onde já és membro,
-- e a membership só é criada DEPOIS do INSERT da org. Daí o erro
-- "new row violates row-level security policy".
--
-- Solução: função SECURITY DEFINER que faz INSERT da org + INSERT da
-- membership numa única operação atómica, bypassando RLS de forma segura
-- (a função verifica auth.uid() ela própria).
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  org_name text,
  org_slug text,
  org_bdp_registry text DEFAULT NULL,
  org_app_name text DEFAULT NULL
)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  new_org public.organizations;
  caller_id uuid;
  attempt_slug text := org_slug;
  retry_count int := 0;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;

  LOOP
    BEGIN
      INSERT INTO public.organizations (name, slug, bdp_registry_number, branding_app_name)
      VALUES (org_name, attempt_slug, NULLIF(org_bdp_registry, ''), NULLIF(org_app_name, ''))
      RETURNING * INTO new_org;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      retry_count := retry_count + 1;
      IF retry_count >= 5 THEN
        RAISE EXCEPTION 'Não foi possível gerar um slug único após 5 tentativas';
      END IF;
      attempt_slug := org_slug || '-' || substr(md5(random()::text), 1, 4);
    END;
  END LOOP;

  INSERT INTO public.memberships (user_id, organization_id, role)
  VALUES (caller_id, new_org.id, 'owner');

  RETURN new_org;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(text, text, text, text) TO authenticated;
