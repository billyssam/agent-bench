# Agent Bench

We give models the same task and publish what it cost them.

Every number on the site comes from a request this repo sent. Nothing is typed by hand.

## What's here

| | |
|---|---|
| `bench/probe-all.mjs` | Calls every model the API lists, one at a time |
| `bench/verify-unknown.mjs` | Re-asks models that returned 429, spaced far apart |
| `bench/tasks.mjs` | The task suite. Each task is pass/fail decided by code |
| `bench/run-tasks.mjs` | Runs every model against every task |
| `build.mjs` | Turns `data/*.json` into static HTML. No dependencies |
| `run.sh` | Daily runner (launchd) |

## Why verify-unknown exists

A spent quota returns `429 RESOURCE_EXHAUSTED` for models that do not exist at all — the server
never gets as far as looking them up. **429 hides 404.** A sweep large enough to be useful is large
enough to exhaust the quota and corrupt its own results, so anything that came back 429 is re-asked
individually, minutes apart, before we call it missing.

## Run it

```bash
export GEMINI_API_KEY=...
node bench/probe-all.mjs      # every listed model
node bench/run-tasks.mjs <model> [<model>...]
node build.mjs                # → dist/
```

No install step. Node only.
