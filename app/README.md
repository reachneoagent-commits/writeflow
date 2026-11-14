# Writeflow app

A small Go program (the launcher) serves the web page from `web/` on `127.0.0.1` and runs llama.cpp's `llama-server`
(the engine) with the downloaded model. The page talks only to the launcher; nothing leaves your computer unless you turn
on a cloud model.

```
web/ (plain JavaScript, no CDN)  <-->  launcher (Go, internal/launcher)  <-->  llama-server (bundled engine)
```

## Layout

- `main.go`, `internal/launcher/`: launcher (downloads and verifies the model, starts and restarts the engine, settings,
  app and model updates, document import, the external-service proxy).
- `web/`: the page. Writeflow's own code is in `web/js/wf/` and `web/css/wf-theme.css`; tests in `web/test/`.
- `config/default.json`: model sizes by memory, sampling, update source.
- `packaging/`: macOS app and DMG, Windows installer and portable zip.
- `devtools/`: fake engine and fake servers for tests, end-to-end script, web tests.

## Develop and test

```bash
go test ./...
node devtools/webtest.mjs
node --test web/test/wf.test.mjs
bash devtools/e2e.sh                       # fake engine, fake download source
go run . --web-dir web --no-browser        # http://127.0.0.1:47620
```

Environment variables for development: `WRITEFLOW_DATA_DIR`, `WRITEFLOW_PORT`, `WRITEFLOW_WEB_DIR`, `WRITEFLOW_ENGINE`,
`WRITEFLOW_BASE_URL`, `WRITEFLOW_NO_BROWSER`, `WRITEFLOW_IDLE_EXIT`, `WRITEFLOW_UPDATE_API`.

See `../docs/UPSTREAM.md` for how changes from the projects we build on are reviewed and merged.
