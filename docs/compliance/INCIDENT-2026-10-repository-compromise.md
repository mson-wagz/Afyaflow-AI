# Security incident record: repository compromise (October-November 2026)

**Status:** recurred on 16 November 2026 (sixth sweep, below); branches restored and cleaned; account and device actions open.
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
| Add a repository ruleset blocking force pushes on all branches | Repository owner | Open. **This would have prevented both incidents; highest priority.** |
| Revoke the OpenAI API key and delete SSM parameter `/afyaflow/staging/openai-api-key` | Project lead | Open |
| Review CloudTrail for the GitHub deploy role and instance role, 16 Oct-16 Nov | Project lead | Open |
| Decide what to do with the 27 other branches, which still contain the payload; until then, never open them in VS Code or run their scripts | Team | Done: deleted after the sixth sweep, 16 Nov |
| **Sixth sweep:** from a clean device, secure the `majorkiema` account (password, all sessions, 2FA, tokens, SSH keys, OAuth apps, stored Git credentials) | Account owner | Open, urgent |
| **Sixth sweep:** identify the pushing device and IP from the GitHub security log (16 Nov, ~21:28 UTC) and scan or reinstall that device | Account owner | Open, urgent |
| **Sixth sweep:** confirm no new pushes after the restore, and re-check all branches for `init` and `.vscode/tasks.json` | Repository owner | Open |
| Offline antivirus scan of the reviewer's computer | Reviewer | Open |

## Sixth sweep (16 November 2026, evening)

### What happened

| When (UTC) | Event |
| --- | --- |
| 21:02 | PR #39 merged through GitHub (clean merge `e273a0b`, signed by GitHub). |
| ~21:28 | All 29 branches force-pushed. `main` became `12ba056`: same parents as `e273a0b` but a different tree, committed locally as "Major Mbandi" rather than by GitHub. On other branches the newest commit was replaced by a look-alike with the same message and author plus the payload (for example `docs/pilot-protocol` `e7755e5` → `e8c0cba`). |
| 21:28 | CI ran on `12ba056`. *Application tests and builds* ran `node init && tsc`, so **the payload executed on the GitHub Actions runner**. The Lambda image build failed (`Cannot find module '/app/init'`), so **the deploy job was skipped and staging was not changed**. |
| ~21:45 | Detected when PRs #44 and #45 showed conflicts in files they had not changed and CI failed. |
| ~21:48 | Restored and cleaned (below). |

The commits carry the identity of the `majorkiema` account (display names "mejja" and "Major
Mbandi"), where earlier sweeps used `mson-wagz` and `JecintaK`. The account and device that
pushed must be confirmed from the GitHub security log. Whichever it was, it held push access.

### Payload (same family as October)

- `.vscode/tasks.json` runs hidden on folder open (`runOn: folderOpen`), calling
  `.vscode/eslint-check.cmd` / `.sh`, which run `node .vscode/eslint` (16.6 KB,
  disguised as an ESLint config); `.vscode/settings.json` sets `task.allowAutomaticTasks: true`.
- `init` files (17.2 KB each) at the root, `src/backend` and `src/frontend`; root, backend and
  frontend `package.json` scripts (build, start, dev, `dev:db`, `start:mcp`) changed to run
  `node init` first.
- `src/backend/eslint.config.mjs` and `src/frontend/vite.config.js` changed, with a long run of
  whitespace on the last line (the October hiding technique).
- `.gitignore` stopped ignoring `.env` and `.env.*` (secrets would be committed) and started
  ignoring `config.bat` (likely the worm's own push script).
- Unrelated `.vscode/launch.json` from another project (AWS profile `flo-ct-flo360`), suggesting
  the files were copied from a template used across victims.

The files were read as text only during the investigation; none were run.

### Where the payload may have run

- The GitHub Actions runner for the CI run on `12ba056` (ephemeral; that job has no AWS
  credentials; the deploy job, which assumes the AWS role, did not run).
- Any computer that opened or built an infected branch after ~21:28 on 16 November. The
  investigating computer's working copy and local branches were checked and are clean (no
  `.vscode`, `init` or push scripts in the repository or top-level user folders).
- The computer or token that made the pushes.

### Response

- `main` restored to the genuine merge `e273a0b` and `docs/pilot-protocol` (open PR #44) to
  `e7755e5`, both from verified clean local copies, checked for the payload files before pushing.
- The other 27 infected branches deleted. Every one belonged to an already merged PR, so no
  unmerged work was lost. This closes the open action on the 27 branches kept in November.
- Every push used `--force-with-lease` on the exact infected commit, so nothing newer was overwritten.
- After restoring: PRs #44 and #45 mergeable again; CI passing on the restored `main`.

Infected commits (evidence; GitHub may keep unreachable commits for a limited time):

| Branch | Infected commit | Action |
| --- | --- | --- |
| `ci/low-cost-aws-staging` | `6d6f43d` | Deleted (work merged in PR #16) |
| `department-routing` | `c2bd5bb` | Deleted (work merged in PR #26) |
| `docs/architecture-diagram` | `f1b1681` | Deleted (work merged in PR #28) |
| `docs/pilot-protocol` | `e8c0cba` | Restored to `e7755e5` (open PR #44) |
| `feat/bedrock-staging` | `e1e6a52` | Deleted (work merged in PR #32) |
| `feat/fhir-export` | `ce3a195` | Deleted (work merged in PR #42) |
| `feat/in-country-processing` | `d934f16` | Deleted (work merged in PR #41) |
| `feat/mimic-research-data` | `baa4dbf` | Deleted (work merged in PR #19) |
| `feat/more-personas` | `3522891` | Deleted (work merged in PR #37) |
| `feat/openai-provider` | `637a5a0` | Deleted (work merged in PR #18) |
| `feat/operations-dashboard` | `e26f525` | Deleted (work merged in PR #36) |
| `feat/queue-tie-breaking` | `f8f3eff` | Deleted (work merged in PR #38) |
| `feat/sats-adult-age` | `8850a62` | Deleted (work merged in PR #40) |
| `feat/security-safeguards` | `7e8c502` | Deleted (work merged in PR #34) |
| `feat/strong-auth` | `c3366cc` | Deleted (work merged in PR #35) |
| `feat/visit-outcomes` | `d6b96c3` | Deleted (work merged in PR #39) |
| `feature/active-reassessment` | `621e7de` | Deleted (work merged in PR #25) |
| `feature/backend-patient-workflow` | `c6ee1c0` | Deleted (work merged in PR #15) |
| `feature/competition-foundation` | `e508e8a` | Deleted (work merged in PR #22) |
| `feature/local-voice-intake` | `ae0b319` | Deleted (work merged in PR #27) |
| `feature/missing-evidence-assistant` | `6ad8c81` | Deleted (work merged in PR #24) |
| `fix/lock-pin-retry` | `6735e54` | Deleted (work merged in PR #21) |
| `fix/remove-login-personas` | `cfe5310` | Deleted (work merged in PR #33) |
| `fix/remove-malware` | `d4adc46` | Deleted (work merged in PR #30) |
| `fix/research-unlock-loading` | `817cfeb` | Deleted (work merged in PR #20) |
| `fix/review-findings` | `c80ab40` | Deleted (work merged in PR #31) |
| `fix/staging-oidc-subject` | `198314e` | Deleted (work merged in PR #17) |
| `main` | `12ba056` | Restored to `e273a0b` |
| `queue-management` | `f3d0d82` | Deleted (work merged in PR #23) |

## Lessons

- Require a ruleset that blocks force pushes and requires pull requests on `main`. The
  sixth sweep happened because this was still open.
- A pull request showing conflicts in files it never changed is a warning sign: compare
  the base branch with its last known good commit before resolving anything.
- Disable VS Code automatic tasks (`task.allowAutomaticTasks: off` in user settings)
  and review `.vscode/`, `package.json` scripts and build configs in every pull request.
- Treat build tooling changes as security-sensitive in review.
