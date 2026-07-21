# ADR-003: Local credential auth behind a clean OIDC boundary

**Status:** accepted · 2026-07-16

## Decision

Local development authenticates seeded users with bcrypt password hashes and a
signed httpOnly session cookie (`jose`, HS256, 12 h). All of it lives in
`apps/web/lib/auth.ts`; the rest of the app only consumes
`requireSession()`/`withAuthorized()` and the `SessionUser` shape
(user, org, role, locale).

## Rationale

Enterprise SSO (Microsoft Entra ID via Supabase Auth) requires a hosted
Supabase project and OK tenant credentials — neither exists in this milestone,
and pretending otherwise is prohibited. The boundary is real: replacing
`verifyCredentials` + cookie issuance with Supabase Auth session handling
leaves every caller unchanged, and `users.auth_user_id` is ready to link
identities.

## Consequences

- The login screen states plainly that production sign-in is Entra ID and not
  yet enabled.
- Password hashes exist only for `*@example.invalid` dev users; the admin
  invite flow generates one-time passwords locally and becomes an email invite
  under Supabase Auth.
