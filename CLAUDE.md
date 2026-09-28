# NSA External Dashboard

## Git / GitHub restriction — CRITICAL

NEVER perform any Git push operation.
NEVER push commits, branches, tags, or any other data to GitHub or any remote repository.
NEVER run git push under any circumstances unless the user explicitly changes this rule in a future instruction.
Do not automatically publish, sync, or upload project changes to GitHub.
Local Git operations such as status, diff, log, add, commit, and branch operations may be performed when necessary, but NOTHING may be pushed to a remote repository.
Before executing any command that could upload project data externally, stop and ask for explicit permission.

Also: no GitHub write operations (`gh` PR/repo/release writes), no GitHub Actions that push or publish, and no `Co-Authored-By: Claude` (or any Claude/Anthropic) trailers in commits or PR bodies — the user does not want Claude listed as a GitHub contributor.

## Source system

- The "original NSA dashboard" is the ERPNext / Frappe v15 desk at `http://10.1.2.99:8080` (apps: frappe, erpnext, hrms, nsa_import, and others).
- Local source of the custom `nsa_import` app: `~/frappe-bench/apps/nsa_import` (the local bench is not the live server).
- The external dashboard reads data only through the Frappe REST API (`/api/resource/...`, `/api/method/...`) using token auth (`Authorization: token <api_key>:<api_secret>`), called server-side only. Never store source data locally and never ship the key/secret to the browser.
