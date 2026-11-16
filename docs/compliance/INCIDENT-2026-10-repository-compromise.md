# Security incident record: repository compromise (October-November 2026)

**Status:** contained on `main`; follow-up actions open (see below).
**Severity:** high (code execution on developer machines and CI runners).
**Patient data involved:** none. The system held only synthetic records and the
de-identified public MIMIC-IV-ED Demo dataset.
**Record prepared:** 16 November 2026, from the GitHub repository activity log and the
repository history. To be reviewed and completed by the security officer.

## Summary

An automated process rewrote the newest commit on every branch of
`mson-wagz/Afyaflow-AI`, adding a hidden JavaScript payload, and force-pushed the
branches. It preserved the original authors and dates, so the commits looked
legitimate. The pushes were made with the `mson-wagz` and `JecintaK` GitHub
accounts, most likely by malware on those developers' computers using stored Git
credentials. The payload ran when the repository was opened in VS Code or built.

## Timeline (UTC)

| When | Event |
| --- | --- |
| 15 Oct, 21:01 | PR #28 merged through GitHub (clean merge `22de5ff`). |
| 16 Oct, 12:41 | First force-push sweep from the `mson-wagz` account rewrites all 28 branches, including `main` (`22de5ff` replaced). |
| 19 Oct, 11:14 | Second sweep (`mson-wagz`), all branches. |
| 25 Oct, 20:14 | Third sweep (`mson-wagz`), all branches. |
| 30 Oct, 13:46 | Fourth sweep (`mson-wagz`), all branches. |
| 5 Nov, 13:01 | Fifth sweep from the `JecintaK` account, 8 branches; `main` becomes `ae56f03`. |
| 16 Nov, ~10:05 | During a code review, checking out `main` writes the payload files to a developer computer; Microsoft Defender quarantines them. |
| 16 Nov | Investigation identifies the payload and the sweeps. PR #30 removes the payload from `main` (merged as `884c88c`); the next deploy rebuilds staging from clean code. |

Each sweep force-pushed the branches 2-3 seconds apart, consistent with automation.
Commit dates in the rewritten commits are not reliable evidence of timing.

## Payload and how it ran

- `.vscode/tasks.json` and `.vscode/settings.json` (`task.allowAutomaticTasks: true`)
  ran `node public/fonts/fa-solid-700.otf` automatically when the folder was opened in
  VS Code. The "font" was obfuscated JavaScript.
- `src/backend/package.json` and `src/frontend/package.json` were changed so `build`,
  `start` and `dev` ran `node init` first.
- `src/frontend/vite.config.js` carried code hidden after a long run of spaces on its
  last line, executed by every Vite build and test.
- The code fetched instructions through blockchain RPC calls (`eth_getTransaction…`),
  a pattern used by credential-stealing malware.
- `.gitignore` was changed to hide the worm's own push scripts
  (`temp_auto_push.bat`, `temp_interactive_push.bat`).

## Where the payload may have run

- Computers of anyone who opened an infected branch in VS Code or ran its npm scripts
  after 16 October, including the computers used by the `mson-wagz` and `JecintaK`
  accounts.
- GitHub Actions runners for every frontend build after 16 October, and the Docker
  image builds for staging deploys. The runtime container served only built files.
- One reviewer's computer on 16 November, where Defender quarantined the files.

## Actions taken

- Payload removed from `main` without rewriting history (PR #30); the resulting tree
  equals the original clean merge plus later reviewed changes, and was scanned for
  payload signatures.
- Staging redeployed from the clean build; the served JavaScript was checked for
  payload signatures (none).
- The reviewer's working copy cleaned; auto-run task files removed.

## Open actions

| Action | Owner | Status |
| --- | --- | --- |
| Clean or reinstall the computers used by `mson-wagz` and `JecintaK`; full antivirus scan | Account owners | Open |
| From a clean device: change GitHub passwords, sign out all sessions, revoke tokens, SSH keys, OAuth apps and stored Git credentials | All contributors | Open |
| Add a repository ruleset blocking force pushes on all branches | Repository owner | Open |
| Revoke the OpenAI API key and delete SSM parameter `/afyaflow/staging/openai-api-key` | Project lead | Open |
| Review CloudTrail for the GitHub deploy role and instance role, 16 Oct-16 Nov | Project lead | Open |
| Decide what to do with the 27 other branches, which still contain the payload; until then, never open them in VS Code or run their scripts | Team | Open (branches kept by decision, 16 Nov) |
| Offline antivirus scan of the reviewer's computer | Reviewer | Open |

## Lessons

- Require a ruleset that blocks force pushes and requires pull requests on `main`.
- Disable VS Code automatic tasks (`task.allowAutomaticTasks: off` in user settings)
  and review `.vscode/`, `package.json` scripts and build configs in every pull request.
- Treat build tooling changes as security-sensitive in review.
