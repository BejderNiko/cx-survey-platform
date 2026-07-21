-- Security Advisor hardening (staging lint 0028/0029): current_org_ids() is
-- SECURITY DEFINER and PostgreSQL grants EXECUTE on functions to PUBLIC by
-- default, so on hosted Supabase it was callable by `anon` through the
-- PostgREST RPC surface. The function only returns the caller's own active
-- org memberships (auth.uid()-scoped; empty for anon), so nothing leaked —
-- this narrows the surface as defense-in-depth.
--
-- `authenticated` keeps EXECUTE: every tenant RLS policy calls the helper as
-- the querying role (cx_app locally / cx_app_hosted hosted, both members of
-- `authenticated`). Revoking there would break all tenant reads.

revoke execute on function public.current_org_ids() from public;
revoke execute on function public.current_org_ids() from anon;
grant execute on function public.current_org_ids() to authenticated;
