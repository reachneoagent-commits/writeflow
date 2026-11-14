# Keeping up with upstream

Writeflow is built on [sgaofen/humanizer-local-model](https://github.com/sgaofen/humanizer-local-model)
(Apache 2.0). We also borrow ideas from other open projects. This is how we pull in their updates
without losing our own features.

## What lives where

| Ours (never touched by upstream) | Upstream's (we change as little as possible) |
|---|---|
| `app/web/js/wf/` (score, facts, style, panel) | everything else under `app/` |
| `app/web/css/wf-theme.css` | `humanizer/`, `eval/`, `space/`, `hf/` |
| `app/web/test/` | |
| `scripts/wf_*`, `upstream/`, `docs/UPSTREAM.md` | |
| `brand/`, `README.md`, `NOTICE` | |

Our small edits inside upstream files are only: the `<title>`, header and icons in `app/web/index.html`,
two lines that load our CSS and `wf/panel.js`, the `Writeflow` to `Writeflow` names in `app/web/js/i18n.js`
and the Go files under `app/internal/launcher/`, the default config (port, update repo), packaging
scripts and CI. A merge conflict will only ever be in those places.

## Weekly check

The **Upstream check** workflow runs every Monday. It compares each watched project with the commit
we last reviewed (`upstream/reviewed.json`) and opens an issue listing what changed. For sgaofen's app
it also does a dry-run merge and says whether it would be clean or which files conflict.

## Folders we removed

Writeflow doesn't ship sgaofen's research and demo material: `eval/`, `space/`, `hf/`, `humanizer/` (the Python `hz` command line tool),
`tests/`, `assets/`, `pyproject.toml`, and their English and Chinese docs. If a merge reports "modified by them, deleted by us"
for one of those paths, keep it deleted: `git rm -r <path>`. Everything is still in sgaofen's history if we ever want it
(`git checkout upstream/main -- <path>`).

## Merging sgaofen's updates

```bash
git config merge.ours.driver true
git remote add upstream https://github.com/sgaofen/humanizer-local-model.git   # once
git fetch upstream
git checkout -b upstream-sync
git merge upstream/main
```

Fix any conflicts (usually a renamed string), then run all tests:

```bash
cd app && go test ./... && node devtools/webtest.mjs && node devtools/webtest_update.mjs && node --test web/test/wf.test.mjs
```

Open a pull request, and once it is merged mark it as reviewed:

```bash
python3 scripts/wf_upstream_report.py --approve sgaofen-app
```

If upstream adds new user-visible text containing "Writeflow", rename it to "Writeflow" in
`app/web/js/i18n.js` (the `X-Writeflow` request header and the model name stay as they are).

## Other projects

For the pattern lists (blader, Aboudjem, brandonwise) the report only says something changed. A person
decides whether any new pattern belongs in `app/web/js/wf/score.js`, written in our own words, and
adds a test. Check the license of anything before using it. kastrah/humaniser and houtini-ai/ai-detect
show no clear license on GitHub, so treat them as ideas until that is cleared.
