# Repository Guidelines

## Project Structure & Module Organization

This is a pnpm TypeScript workspace. Application artifacts live in `artifacts/`: `mobile/` is the Expo Router React Native app, `api-server/` is the Express API, and `mockup-sandbox/` is a Vite UI sandbox. Shared packages live in `lib/`: `db/` contains Drizzle schema and database exports, `api-spec/` owns `openapi.yaml` and Orval config, and generated clients live in `api-client-react/` and `api-zod/`. Utility scripts are in `scripts/`. Mobile routes are grouped under `artifacts/mobile/app`, with assets in `artifacts/mobile/assets`.

## Build, Test, and Development Commands

Install dependencies with `pnpm install` from the repository root. Use package filters for local work:

- `pnpm --filter @workspace/mobile run dev` starts Expo in the Replit-oriented development mode.
- `pnpm --filter @workspace/mobile run typecheck` validates the mobile app.
- `pnpm --filter @workspace/api-server run build` bundles the API server to `dist/`.
- `pnpm --filter @workspace/api-server run start` runs the built API server.
- `pnpm --filter @workspace/mockup-sandbox run dev` starts the Vite sandbox.
- `pnpm --filter @workspace/db run push` applies Drizzle schema changes.
- `pnpm --filter @workspace/api-spec run codegen` regenerates API clients from `lib/api-spec/openapi.yaml`.

## Coding Style & Naming Conventions

Use TypeScript throughout and keep strict compiler settings passing. Follow existing React conventions: PascalCase components (`AppointmentCard.tsx`), camelCase hooks and utilities (`useColors.ts`, `timeInput.ts`), and route files matching Expo Router names. Prefer two-space indentation and run Prettier before committing generated or heavily edited files. Do not hand-edit files under `src/generated`; update the OpenAPI spec and rerun codegen.

## Testing Guidelines

No dedicated test runner is currently configured. For now, treat `typecheck` as the required verification for changed packages, and build the API or sandbox when those surfaces change. If adding tests, colocate them near the code as `*.test.ts` or `*.test.tsx`, document the new command in the relevant package, and keep generated clients out of direct test edits.

## Commit & Pull Request Guidelines

Recent commits use short, imperative summaries such as `sync project state` and `Add necessary configuration for mobile push notifications and development`. Keep commit subjects concise and action-oriented. Pull requests should describe the change, list verification commands run, link related issues when available, and include screenshots or screen recordings for mobile or sandbox UI changes.

## Security & Configuration Tips

Keep secrets in local `.env` files and out of commits. Preserve the `minimumReleaseAge` supply-chain setting in `pnpm-workspace.yaml`; use `minimumReleaseAgeExclude` only for trusted urgent exceptions.

## Agent Communication Rules

Use the local `.agents/skills/caveman` guidance when the user says `caveman`, `/caveman`, `talk like caveman`, `use caveman`, `less tokens`, or `be brief`. Default to `full` mode unless the user selects another level. The mode persists until the user says `stop caveman` or `normal mode`.

Keep all technical substance exact while removing fluff. Drop articles, filler, pleasantries, and hedging; fragments are acceptable. Use short clear synonyms, but keep code blocks, commands, API names, function names, commit types, and exact error strings unchanged. Preserve the user's dominant language and compress style only.

Do not announce or label the style. Avoid self-reference such as "caveman mode on" or "me caveman think." Prefer the pattern `[thing] [action] [reason]. [next step].`

Available levels:

- `lite`: remove filler and hedging; keep normal sentence structure.
- `full`: default; drop articles and filler; concise fragments OK.
- `ultra`: maximum compression; use obvious acronyms only, arrows for causality, and no invented abbreviations.
- `wenyan-lite`, `wenyan-full`, `wenyan-ultra`: classical Chinese compression levels when requested.

Drop caveman style for security warnings, irreversible-action confirmations, ambiguous multi-step instructions, or when the user asks for clarification or repeats a question. Resume after the clear part is complete. Write code, commit messages, and PR text in normal required format unless the user invokes a caveman-specific skill.

Related local skills: `/caveman-help`, `/caveman-commit`, `/caveman-review`, `/caveman-stats`, `/caveman-compress <file>`, and `cavecrew`.
