-- Run in Supabase SQL editor, then set this function as the Auth custom access token hook.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  claims jsonb;
  user_org_id uuid;
  user_roles text[];
  user_permissions text[];
BEGIN
  SELECT u.organization_id
    INTO user_org_id
  FROM public.users u
  WHERE u.id = (event->>'user_id')::uuid;

  SELECT COALESCE(array_agg(DISTINCT r.name), ARRAY[]::text[])
    INTO user_roles
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = (event->>'user_id')::uuid;

  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::text[])
    INTO user_permissions
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON rp.role_id = ur.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ur.user_id = (event->>'user_id')::uuid;

  claims := event->'claims';
  claims := jsonb_set(claims, '{app_metadata,organization_id}', to_jsonb(user_org_id), true);
  claims := jsonb_set(claims, '{app_metadata,roles}', to_jsonb(user_roles), true);
  claims := jsonb_set(claims, '{app_metadata,permissions}', to_jsonb(user_permissions), true);

  RETURN jsonb_set(event, '{claims}', claims, true);
END;
$$;
