# Acceptance status — 18 September 2026

## Scope boundary

- Local commit approved. No push, hosted database change, production deploy or production-data operation.
- Migration `20260812000013` changed by explicit approval without hosted proof.
- Respondent data must not be sent to OpenAI. Synthesize is intentionally out of scope and absent from application source.

## Status

| Area | Status | Local evidence | Remaining condition |
| --- | --- | --- | --- |
| Recruitment | BLOCKED | Page handles known schema failures without raw SQL; readiness checks table, six required columns, named constraint and unique index. | Automated browser flow did not start on managed Windows. Hosted schema intentionally unverified. |
| Panel filters and comments | PARTIAL | Clear action resets filters, search and pending UI navigation; comment labels match requested text. | Tenant-isolation acceptance needs CI or hosted browser evidence. |
| Question authoring | PARTIAL | Likert removed from authoring; legacy types disabled; linear scales accept numeric values. | Automated builder test runner unavailable. |
| Navigation and visual theme | PARTIAL | Home redirects to studies; app navigation has no Home item; `classic`/`modern` theme gate exists; old accent literal has zero source hits. | Full accessibility and 375/768/1440 pixel browser review remains. |
| Synthesize/OpenAI | OUT | No respondent data is sent to OpenAI. No Synthesize implementation is included. | User explicitly excluded this feature. |
| Figma OAuth | BLOCKED | Safe local configuration example and OAuth setup guide added. | Actual authorized account, file access and provider flow not tested. |
| WebR workbench | PARTIAL | Local browser computes `nrow = 94`; preview shows `94`; difference is `94 - 94 = 0`. Version pin, async Shelter creation and 20-second timeout added. | Cross-browser and CI test evidence remains. |
| Feedback | PARTIAL | Submit UI locks while pending; server errors map to safe Danish text. | Automated component flow unavailable. |
| Migration 13 | LOCAL PASS | Fresh local database applied all `16 / 16` migrations. Isolated index check accepted valid input and rejected duplicates. | No hosted execution or hosted readiness proof by explicit scope. |
| Release | OUT | Local commit only. | No push, Preview or production release requested. |

`PARTIAL` means local implementation and direct local evidence exist, but a required automated, hosted or external-provider check is missing. It is not full acceptance.

## Validation record

| Check | Result | Meaning |
| --- | --- | --- |
| Local migrations | PASS: `16 / 16` | Fresh synthetic local database reached latest migration `20260911000016_recruitment_filter_questions.sql`. |
| Database tests | PASS: `26 / 26` | Local assertions passed. |
| Type check | PASS | No TypeScript errors. |
| Lint | PASS with `1` pre-existing warning | `0` lint errors. Warning: unused `LegacyResultsPage`. |
| Production build | PASS | Fresh build created `.next/BUILD_ID`; local application smoke completed. |
| Diff whitespace | PASS | `git diff --check` exited `0`. |
| Vitest | BLOCKED: `0` assertions | Managed Windows stopped process creation before collection: `spawn UNKNOWN`. |
| Playwright | BLOCKED: `0` collected tests | Run record says `failed`; `failedTests` is empty. Existing port `3000` process was not stopped or changed. |

## Manual local evidence

- `/studies`, `/panel/recruitment`, `/analytics` and builder opened in local browser.
- Recruitment view showed no uncontrolled error alert.
- WebR generated matching preview/output row count: `94 = 94`.
- No hosted migration, production operation or production deploy ran.

## Commit gate

This commit contains local implementation plus evidence above. It does not assert completion for `BLOCKED`, `PARTIAL` or `OUT` rows. Run blocked CI/browser/provider checks before a release decision.
