# Feedback and collaboration acceptance — 2026-09-30

## Scope

Internal product feedback and study, section, and question comments. Panel recruitment is deferred. Lyssna is a product reference for anchored discussion; its full feature set is not claimed here.

## Implementation

- Permit every active authenticated role to create feature requests. Keep inbox viewing and management permissions unchanged.
- Apply `20260930000017_feature_request_submission_roles.sql` before expecting non-admin submissions in any environment. The migration replaces only the request and event INSERT policies; it retains actor identity, active membership, and organization checks.
- Validate server-action input types, text bounds, and captured context size before storage. The widget supports native form submission and accessible field labels.
- Separate study, section, and question threads; filter open/resolved threads; count roots rather than replies; link directly to a thread; close other comment popovers when one opens.
- No third-party package was added. `bebsworthy/feedbacker` uses local storage and base64 screenshots, which do not fit the existing tenant-scoped action and 32 KB snapshot limit. The widget still stores DOM/geometry context, not a screenshot.

## Files changed

- Feedback: `apps/web/components/feedback-widget.tsx`, `apps/web/app/(app)/feature-requests/actions.ts`, `apps/web/app/(app)/feature-requests/input.ts`.
- Comments: `apps/web/app/(app)/studies/[id]/comments-panel.tsx`, `apps/web/app/(app)/studies/[id]/builder/modern-builder.tsx`, `apps/web/app/(app)/studies/[id]/results/result-comment-popover.tsx`, `apps/web/lib/comment-threads.ts`.
- Access and migration: `packages/domain/src/permissions.ts`, `supabase/migrations/20260930000017_feature_request_submission_roles.sql`.
- Tests: `packages/domain/test/permissions.test.ts`, `apps/web/test/comment-threads.test.ts`, `apps/web/test/feature-request-input.test.ts`, `apps/web/test/feature-request-submission-rls.test.ts`, `apps/web/e2e/feedback-comments.spec.ts`.
- Acceptance record: `docs/feedback-collaboration-acceptance-2026-09-30.md`.

## Acceptance gates

| Gate | Result | Evidence / remaining work |
| --- | --- | --- |
| Source typecheck | PASS | Direct Node TypeScript check for web and domain returned 0. |
| Source lint | PASS | Web lint returned 0 errors; 1 warning in unchanged results page. |
| Production build | PASS | `next build` completed and generated routes. |
| Local migration | PASS | PGlite status showed 17/17 migrations, latest `20260930000017`. No hosted migration ran. |
| RLS: viewer own organization and cross-organization denial | PASS locally | Direct `cx_app` transaction inserted request + event within own organization, rejected foreign organization with SQLSTATE `42501`, and rolled back all test rows. |
| Pure validation and comment scope | PASS locally | 8 direct runtime assertions passed. |
| Browser UI smoke | PARTIAL | Researcher opened widget and selected an area. Study, section, and question comment views rendered; opening a question popover closed the section popover. Browser persistence tests could not use valid RLS because the available `next start` / PGlite combination ran as the database superuser. |
| Vitest and automated Playwright | BLOCKED | Windows group policy returned `spawn EPERM` before test collection/browser launch. New unit, RLS, and E2E specs remain unexecuted here. |
| Hosted readiness and release | OUT | Migration, role checks, and browser smoke on hosted Preview were not performed. No commit, push, or deployment. |

## Remaining manual verification

1. Run migration 17 in an approved hosted test environment; verify readiness and migration identity before testing.
2. In a runner that starts Next with RLS enforced, execute web/domain unit tests, the feedback RLS test, and `e2e/feedback-comments.spec.ts`.
3. Test feedback submission as viewer and researcher, a rejected cross-organization write, inbox visibility for owner/admin, and no inbox access for viewer.
4. Test study, section, question, and results discussion: create, reply, resolve/reopen, copy link, reload, mobile layout, and keyboard access. Test both classic and modern UI.
5. Decide separately whether screenshots, @mentions, notifications, and distinct builder/results conversations are required for broader Lyssna parity.

The local PGlite database contains one synthetic feedback item from an earlier smoke run against `next start`. That run was not counted as RLS evidence because the server ran as the PGlite superuser. No cleanup SQL was run.
