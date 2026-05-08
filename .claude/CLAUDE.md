# Project: Nano Banana Studio (AI Creative Studio)

Multi-provider AI image generation studio. Web (Next.js) + Electron desktop wrapper.
Node-based canvas (ReactFlow) with chat-driven director, multi-provider routing
(Gemini "Nano Banana", OpenAI GPT-Image, Pudding, iThink), and skill-driven prompts.

## Stack
- Language: TypeScript 5
- Framework: Next.js 15.3.3 (App Router) + React 19
- Desktop: Electron 35 (`electron/main.cjs`, packaged via electron-builder)
- Styling: Tailwind v4 (PostCSS), `clsx`, `tailwind-merge`
- State: Zustand 5 (`app/lib/chatStore.ts`, `providerSettingsStore.ts`)
- Canvas: ReactFlow 11 (`app/components/canvas`, `app/components/nodes`)
- Animation: framer-motion
- Backend storage: Supabase (`@supabase/supabase-js`)
- Image gen SDKs: `@google/genai`, `@google/generative-ai`, `openai` v6
- Image processing: `sharp`, `heic-convert`, `heic2any`
- Lint: ESLint 9 (`eslint-config-next`)
- Package manager: **npm** (package-lock.json)
- Node runtime: standard (Vercel-compatible)

## Dev Commands
```bash
npm run dev            # Next.js dev server on :3005
npm run build          # production build
npm run start          # start built app
npm run lint           # eslint
npm run electron:dev   # Electron + Next dev
npm run dist:win       # build Windows installer
```

## Layout
- `app/api/*` — route handlers per provider: `generate`, `generate-openai`,
  `generate-openai-stream`, `pudding`, `pudding-openai`, `ithink-openai`,
  `chat`, `convert-heic`, `assets`, `sessions`, `upload`, `config`.
- `app/lib/providers/{gemini,openai,index,types}.ts` — provider abstraction.
- `app/lib/prompts/{gemini-director,openai-director}.ts` — director prompts.
- `app/lib/chatStore.ts` + `providerSettingsStore.ts` — Zustand stores.
- `app/components/nodes/*` — ReactFlow nodes (Prompt, Output, Upload, Setting, ModelCreation, CarouselPrompt).
- `app/components/chat/*` — chat UI (Drawer, Window, Message, DirectorBlockActions).
- `nano-banana-creator/` — skill bundle (SKILL.md + assets).
- `relay/` — relay server (deployed separately, see `data/`).
- `tools/` — one-off scripts (origin finder, compression test, etc.).
- `data/assets.json`, `data/sessions/` — local persistence.

## Architecture Notes
- **Provider routing**: `app/lib/providers/index.ts` is the dispatch layer.
  Adding a new model means: add SDK call in a `providers/<name>.ts`, register
  in `index.ts`, add API route under `app/api/`, expose in `ProviderSelector.tsx`.
- **Director pattern**: chat → director prompt → structured blocks → canvas
  actions. Director prompts live in `app/lib/prompts/`. Parser is
  `app/lib/directorParser.ts`. Don't bypass the director — every generation
  request flows through it for consistency across providers.
- **Settings mapping**: `settingsMapper.ts` converts UI settings into
  provider-specific request shapes. Add provider-specific knobs here, not
  in route handlers.
- **Skill loader**: `skillLoader.ts` loads SKILL.md from `nano-banana-creator/`
  as system context. See `memory/gpt_image2_prompting.md` for the GPT-Image-2
  prompting rules.
- **Proxy**: `proxyFetch.ts` + `relayClient.ts` are for the optional self-hosted
  relay (when calling SDKs from desktop without exposing keys client-side).

## Conventions
- Provider SDK calls live ONLY in `app/lib/providers/*` or `app/api/*` route
  handlers — never in components.
- Secrets in `.env.local` only. Never hardcode keys (existing API keys in
  `~/.claude/settings.json` allow lists are for proxy testing — do not copy).
- Image inputs: HEIC must go through `/api/convert-heic` first.
- New API routes: place under `app/api/<feature>/route.ts`, follow Next 15
  App Router signatures.
- TypeScript strict mode is on — fix types, don't `// @ts-ignore`.

## Do NOT
- Do not commit without my approval.
- Do not modify `.env.local`, secrets, or anything in `relay/` config without asking.
- Do not delete files under `app/components/_archive/` — that is the deliberate archive.
- Do not regenerate `package-lock.json` casually (run `npm install` only when needed).
- Do not bypass the director parser when adding generation flows.
- Do not push directly — branch + PR.

## Compact Instructions (project-specific)
Also preserve on /compact:
- Active provider being debugged (Gemini / OpenAI / Pudding / iThink)
- Current director-prompt or skill-loader changes in progress
- Any open bug in the canvas migration (`canvasMigration.ts`) or chat store
- Migration / schema state of Supabase tables touched this session
