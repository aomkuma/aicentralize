# Next-Day Handover - 2026-06-24

This note captures the current AI runtime and Meeting Studio status so the next session can resume quickly.

## What Changed Today

1. Meeting Studio now supports DOCX upload for meeting content.
- Browser-side DOCX text extraction is wired in.
- The page can treat a `.docx` file as meeting input instead of only audio/video.

2. DOCX files can be processed into a structured minute draft flow.
- The extracted text is loaded into the transcript area.
- Summary and minute template fields are auto-filled when AI analysis succeeds.
- If AI analysis is unavailable, the page still keeps the extracted text and falls back to a non-blocking processed state.

3. Ollama connectivity is now configurable.
- `OLLAMA_BASE_URL` was added to env loading.
- Local development defaults to `http://127.0.0.1:11434`.
- Docker deployment defaults to `http://ollama:11434`.

4. Docker deployment now includes an Ollama service.
- `docker-compose.yml` now starts an Ollama container alongside API and Postgres.
- The API startup script waits briefly for Ollama before booting the server.

## What We Still Need

1. True AI provider routing is not implemented yet.
- The backend can now talk to a configurable Ollama host.
- It still does not select between local LLM, ChatGPT, Claude, or other providers from a single abstraction layer.

2. System Settings only expose basic AI toggles.
- There is currently no UI to choose provider type or provider-specific credentials.
- No model registry or per-workflow provider mapping exists yet.

3. Runtime validation is partly blocked by the local AI host.
- Ollama connectivity is now wired in the app, but end-to-end analysis still depends on a running Ollama instance and a pulled model.

## Next Session Plan

1. Add an AI provider abstraction.
- Define a shared interface for `local-llm`, `openai`, `anthropic`, and future providers.
- Route Meeting Studio generation through that abstraction instead of calling Ollama directly.

2. Add provider settings to System Settings.
- Let admins choose the default provider per workflow.
- Store API keys and base URLs safely in system settings or environment variables.

3. Add fallback behavior.
- Prefer local LLM when available.
- Fall back to a remote provider when local inference is unavailable.
- Keep the DOCX minute flow non-blocking.

4. Re-test the Meeting Studio DOCX path.
- Upload a real `.docx` file.
- Confirm transcript extraction, summary autofill, and save flow.

## Code Touched Today

- `src/config/env.ts`
- `src/services/aiService.ts`
- `apps/api/src/config/env.ts`
- `apps/api/src/services/aiService.ts`
- `docker-compose.yml`
- `docker/start.sh`
- `.env.example`
- `.env.production.example`
- `README.md`
- `apps/web/src/pages/MeetingStudioPage.tsx`

## Risks / Caveats

1. `qwen2.5:7b` must exist in Ollama for generation to work without model errors.
2. Network or container startup timing can still delay the first AI request.
3. The app currently has a single Ollama-backed path; provider multiplexing is still a follow-up task.

## Resume Point

When we come back, the next highest-value change is to replace the direct Ollama call with a provider router.

Current state:
- DOCX upload and extraction work in Meeting Studio.
- Ollama is configurable through `OLLAMA_BASE_URL` and can run in Docker.
- The UI can process extracted text, but the app still assumes one local AI backend.

Still blocked / not finished:
- No unified way to select between local LLM, ChatGPT, Claude, or future AI agents.
- No central provider settings UI yet.
- No fallback chain or provider-specific auth handling yet.

Next implementation step:
1. Introduce a provider abstraction in the API service layer.
2. Add config fields for provider type and credentials.
3. Route Meeting Studio generation through that abstraction.