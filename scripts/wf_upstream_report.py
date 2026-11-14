#!/usr/bin/env python3
"""Writeflow upstream watch. Standard library only.

Compares each project we build on with the commit we last reviewed (upstream/reviewed.json).
  python3 scripts/wf_upstream_report.py            print a Markdown report; exit 10 if anything changed, 0 if not
  python3 scripts/wf_upstream_report.py --approve all|id [id...]   mark the current state as reviewed
Nothing here changes Writeflow itself: a person reads the report, tries the update, then approves it.
"""
import json, os, sys, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REVIEWED = ROOT / "upstream" / "reviewed.json"

WATCH = [
    {"id": "sgaofen-app", "kind": "gh", "repo": "sgaofen/humanizer-local-model",
     "what": "Rewrite app and engine. Merge into our code (see docs/UPSTREAM.md)."},
    {"id": "hf-model", "kind": "hf", "repo": "jialinyyzz/humanizer",
     "what": "Model weights. The app's own model updater handles new files; test quality before approving."},
    {"id": "blader", "kind": "gh", "repo": "blader/humanizer",
     "what": "Pattern list. Look for new patterns to add to app/web/js/wf/score.js."},
    {"id": "aboudjem", "kind": "gh", "repo": "Aboudjem/humanizer-skill",
     "what": "55 patterns, voices, scoring ideas. Look for new patterns."},
    {"id": "brandonwise", "kind": "gh", "repo": "brandonwise/humanizer",
     "what": "Pattern list and statistical checks."},
    {"id": "houtini", "kind": "gh", "repo": "houtini-ai/ai-detect",
     "what": "Sentence-level local detector. Candidate for a future detector step (license unclear)."},
]


def get(url):
    h = {"User-Agent": "writeflow-upstream-watch", "Accept": "application/json"}
    tok = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if tok and "api.github.com" in url:
        h["Authorization"] = "Bearer " + tok
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=30) as r:
        return json.load(r)


def current(w):
    if w["kind"] == "gh":
        c = get(f"https://api.github.com/repos/{w['repo']}/commits?per_page=1")[0]
        return {"sha": c["sha"], "date": c["commit"]["committer"]["date"], "msg": c["commit"]["message"].splitlines()[0]}
    m = get(f"https://huggingface.co/api/models/{w['repo']}")
    return {"sha": m["sha"], "date": m.get("lastModified", ""), "msg": "model files changed"}


def new_commits(w, old, new):
    if w["kind"] != "gh" or not old:
        return []
    try:
        c = get(f"https://api.github.com/repos/{w['repo']}/compare/{old}...{new}")
        return [x["commit"]["message"].splitlines()[0] for x in c.get("commits", [])][-12:]
    except Exception:
        return []


def main(argv):
    reviewed = json.loads(REVIEWED.read_text()) if REVIEWED.exists() else {}
    if argv and argv[0] == "--approve":
        ids = [w["id"] for w in WATCH] if argv[1:] == ["all"] else argv[1:]
        for w in WATCH:
            if w["id"] in ids:
                reviewed[w["id"]] = current(w)
        REVIEWED.parent.mkdir(exist_ok=True)
        REVIEWED.write_text(json.dumps(reviewed, indent=2) + "\n")
        print("approved:", ", ".join(ids))
        return 0
    lines, changed = ["# Writeflow upstream changes to review", ""], False
    for w in WATCH:
        try:
            cur = current(w)
        except (urllib.error.URLError, KeyError, IndexError) as e:
            lines += [f"## {w['id']}: could not check ({e})", ""]
            continue
        old = reviewed.get(w["id"], {})
        if old.get("sha") == cur["sha"]:
            continue
        changed = True
        link = f"https://github.com/{w['repo']}" if w["kind"] == "gh" else f"https://huggingface.co/{w['repo']}"
        lines += [f"## {w['id']}: [{w['repo']}]({link})", w["what"], "",
                  f"- Last reviewed: `{old.get('sha', 'never')[:10]}` ({old.get('date', '-')})",
                  f"- Now: `{cur['sha'][:10]}` ({cur['date']}): {cur['msg']}"]
        for m in new_commits(w, old.get("sha"), cur["sha"]):
            lines.append(f"  - {m}")
        lines.append("")
    if changed:
        lines += ["After reviewing, mark things as seen with:",
                  "`python3 scripts/wf_upstream_report.py --approve <id> ...` and commit `upstream/reviewed.json`."]
    print("\n".join(lines))
    return 10 if changed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
