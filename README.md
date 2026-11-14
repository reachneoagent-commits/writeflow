<p align="center">
  <img src="brand/logo full color.svg" alt="Writeflow" width="320">
</p>

<p align="center"><b>Rewrite AI-sounding drafts so they read like you. Free, on your own computer.</b></p>

Writeflow is part of the FlowApps suite. It runs a 12B rewriting model locally, so your text never leaves
your machine, and it adds a writing coach around it.

## What it does

- **Scan first, then humanize.** Paste text and press Scan to see its AI-sounding score and the exact sentences and phrases behind it. Humanize the whole text, or just a sentence or a selection.
- **Rewrite** a draft so it sounds like a person wrote it, keeping numbers, names, dates and quotes.
- **AI-sounding score** (0 to 100) with the exact phrases that give it away, highlighted in your draft.
- **Before and after.** Score the draft, rewrite it, score it again.
- **Facts check.** Tells you if the rewrite dropped or invented a number, date, quote or name.
- **Reading level.** Shows the grade level and whether it fits middle school, high school or college.
- **Sounds like you.** Paste a few things you wrote yourself and Writeflow shows where a rewrite drifts from your habits.
- **Cloud model (optional).** Prefer OpenAI, Claude, NVIDIA, Gemini or OpenRouter? Add your own API key from the menu or at setup. Off by default, and text is sent to that provider when it's on.
- Works offline after a one-time model download. Mac (Apple silicon) and Windows.

Try it with the sample texts in `docs/TEST-SAMPLES.md`.

## Use it well

The score is a guide to writing habits, not an AI-detector verdict. Formal and non-native writing can score high
too, and no tool can promise a result with any detector. Edit the rewrite in your own words before you use it, and
follow your school's or workplace's rules on AI help. The model can still change details, so check numbers and names.

## Download and install

**Easiest:** install and update Writeflow with the [FlowApps launcher](https://github.com/reachneoagent-commits/FlowApps-Launcher/releases/latest), one app that also manages Gramflow, Voxflow, Mailflow and TVflow on Mac and Windows. Or download an installer yourself below.

| Platform | Download |
|---|---|
| macOS, Apple silicon (M1 or newer) | [DMG](https://github.com/reachneoagent-commits/writeflow/releases/latest) (`Writeflow-<version>-macos-arm64.dmg`) |
| Windows x64 | [Installer](https://github.com/reachneoagent-commits/writeflow/releases/latest) (`Writeflow-<version>-windows-x64-setup.exe`) |
| Windows x64, no install | [Portable zip](https://github.com/reachneoagent-commits/writeflow/releases/latest) (`Writeflow-<version>-windows-x64-portable.zip`) |

Open the latest release and pick the file for your computer. The first launch downloads the model that fits your computer's memory (3.9 GB to 12.7 GB). The app is not code-signed yet, so macOS and Windows show a warning the first time you open it. Step-by-step help for that, and for checking a download against `SHA256SUMS.txt`, is in [docs/INSTALL-WRITEFLOW.md](docs/INSTALL-WRITEFLOW.md).

**Already use the Humanizer app?** In Writeflow's storage settings, point the models folder at the one Humanizer
uses and Writeflow will find the model without downloading it again. (On Windows, uninstalling Writeflow removes
`humanizer-*.gguf` files in a models folder you picked, so keep a separate folder if you also use Humanizer there.)

## Build and test

```bash
cd app
go test ./...
node devtools/webtest.mjs && node --test web/test/wf.test.mjs
go run . --web-dir web        # opens http://127.0.0.1:47620
```

See `docs/UPSTREAM.md` for how updates from the projects we build on are reviewed and merged.

## Credits and license

Apache 2.0. Built on [sgaofen/humanizer-local-model](https://github.com/sgaofen/humanizer-local-model) and the
[jialinyyzz/humanizer](https://huggingface.co/jialinyyzz/humanizer) model. Full credits in `NOTICE`.
