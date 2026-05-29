# EditWithMe Hardening Mission Log

Started: 2026-05-28
Operator: EVE / Hermes

## Objective
Patch all findings from the full project review while preserving service stability.

## Findings being remediated

1. Stored XSS in Markdown preview via `marked` + `dangerouslySetInnerHTML`.
2. Production fallback to hardcoded `EWM_SECRET`.
3. Vulnerable direct dependencies: `next`, `marked`.
4. WebSocket size limit enforced after mutation.
5. Missing brute-force/rate-limit protection on password auth.
6. Spoofable/memory-only note creation rate limit.
7. Malformed WebSocket payloads can destabilize server.
8. Awareness cleanup removes server doc client ID instead of disconnected clients.
9. Debounced saves can be lost during shutdown/deploy.
10. Protected-note UX prompts despite valid cookie.
11. ESLint failures.
12. No automated tests.
13. README env mismatch: `NEXT_PUBLIC_WS_PORT` vs `NEXT_PUBLIC_WS_URL`.
14. Deploy smoke check misses WebSocket.
15. Source Compose exposes web on all interfaces while deployed copy binds loopback.

## Patch strategy

- Add tests first where practical.
- Extract reusable helpers for sanitization, auth config, rate limiting, safe JSON parsing, and WebSocket validation.
- Keep deployment changes conservative and reversible.
- Verify with lint, typecheck, build, tests, audit, Compose config.

## Progress

- [x] Tests added
- [x] Security helpers patched
- [x] WebSocket hardening patched
- [x] Dependencies updated
- [x] Docs/deploy updated
- [x] Full verification passed
- [x] Independent review completed
- [x] Independent review blockers patched

## Independent review blocker fixes

- `server/Dockerfile` now copies the full `server/` directory, including `server/ws-helpers.ts`.
- Yjs update validation now checks both `content` text length and total encoded candidate document size before mutating the live document.
- Markdown sanitization now fails closed outside a browser DOM instead of using a regex sanitizer fallback.
- Deploy WebSocket smoke check now sends an `Origin` header so origin validation is exercised.

## Verification commands

```bash
bun test
bun run lint
bunx tsc --noEmit
bunx tsc --noEmit -p server/tsconfig.json
EWM_SECRET=test-secret NEXT_PUBLIC_WS_URL=ws://localhost:4444 bun run build
EWM_SECRET=test-secret NEXT_PUBLIC_WS_URL=ws://localhost:4444 docker compose config
bun audit
docker build -f server/Dockerfile -t ewm-ws-review:latest .
```

Runtime smoke also passed against isolated local HTTP and WebSocket ports.
