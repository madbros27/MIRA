-- Remove the obsolete 7-parameter create_project overload.
-- Keep the current 10-parameter version from 20250201000200_platform_rpc.sql.

drop function if exists public.create_project(
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  text
);