# AGENTS.md: guide for contributors

Writeflow is a rebranded, extended fork of sgaofen/humanizer-local-model (see `NOTICE`, `docs/UPSTREAM.md`).

- App: Go launcher in `app/` serving a plain JavaScript page from `app/web/`. The model runs in llama-server.
- Our code lives in `app/web/js/wf/` (score, facts, style, panel), `app/web/css/wf-theme.css`, `app/web/test/`.
  Keep edits to upstream files small so merges stay clean. Do not rename the `X-Writeflow` header or the model name.
- Never touch a user's Writeflow data. Writeflow uses its own `Writeflow` data folder and port 47620.
- Do not tune rewrites against AI detectors, and do not promise detector results.
- Before finishing: `cd app && go vet ./... && go test ./... && node devtools/webtest.mjs && node --test web/test/wf.test.mjs`.
- Brand: coral `#E56458`, plum `#5E0F31`, blush `#FCECED` (assets in `brand/`).
