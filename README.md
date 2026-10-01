# Acceptrics agent skills

Skills that let an AI agent (Claude Code, Cursor, Codex, and others that read
`SKILL.md`) work with [Acceptrics](https://acceptrics.com) cookie consent.

## acceptrics-compliance

Scans a website, reports which cookies it sets on first load and whether the
consent banner covers them, then fixes the gap. Existing Acceptrics banners are
fixed through the Acceptrics API, with the owner's approval and a 24-hour key.
New sites get a pre-filled setup link.

Install by copying `acceptrics-compliance/` into your agent's skills folder
(e.g. `~/.claude/skills/`). Overview, example report and one-line install:
https://acceptrics.com/ai-compliance-skill

Cookies the library doesn't recognise come back as `functional` with
`unrecognised: true`, and the report names each one so the owner can check what
sets it.

It uses:
- `POST /v1/public/scans` on api.acceptrics.com: public, no account needed;
- the [Partner API](https://acceptrics.com/developer), for existing customers
  only.

## Eval

The report contains statements people may read as legal ones, so their wording
is tested:

```sh
npm install
npm test            # the checker's own tests (no API calls)
npm run eval:plan   # what a full run would do
npm run eval        # 6 fixture scans × 2 models; needs Anthropic credentials
```

`eval/check-report.mjs` grades deterministically. A report must never call a
site compliant, non-compliant or illegal, must not mention fines, and must not
say "before consent" until the scanner can prove it. It must state its limits.
Run the eval after every change to `SKILL.md`.

`observed_before_consent` in step 3 is reserved: the scan API does not return
it yet. Until it does, the skill always says "on first load".
