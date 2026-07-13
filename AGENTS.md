# Project instructions

## Architecture

- Preserve the existing application architecture.
- Use the established Supabase client and data-access patterns.
- Follow existing authentication and authorization conventions.
- Treat Vercel and Supabase configuration as production-sensitive.

## Working method

- Inspect relevant files before editing.
- Use create-plan for multi-file or architectural changes.
- Prefer small, reviewable changes.
- Do not add dependencies without explaining the need.
- Run type checking, linting, and relevant tests after modifications.
- Report commands run and their results.

## Git

- Do not commit, push, rebase, reset, force-push, or change remotes unless explicitly instructed.
- Do not create branches unless explicitly instructed.
- Do not use GitHub integrations or APIs.
- Local read-only Git commands are allowed.

## Security

- Never print, copy, modify, or expose secrets.
- Do not commit `.env` files.
- Do not run destructive Supabase SQL.
- Do not modify production data.
- Ask before running migrations.
- Preserve row-level security policies.
- Flag any operation that could affect production.

## Output

At the end of a task, report:
- files changed
- behavior changed
- tests run
- unresolved risks
- manual verification required
