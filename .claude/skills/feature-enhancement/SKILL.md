---
name: feature-enhancement
description: Implement a feature enhancement for the NoteApp project starting from any Jira issue key in the NTA project (NTA-1, NTA-42, NTA-<any number>, etc.) or a jira link like https://sandeep12biswas.atlassian.net/browse/NTA-<number>. Fetches and summarizes the story, gets explicit user confirmation before writing any code, implements the change following this repo's architecture rules, and finishes by writing/running whatever checks apply to the layer touched. Use this whenever the user says things like "implement NTA-12", "work on this jira ticket", "pick up the story at <jira link>", or "start the enhancement for <issue key>" — not for bug fixes with no Jira ticket, and not for ad-hoc requests that don't reference a Jira issue.
arguments : JIRA-number [base-branch]
---

# Feature Enhancement (Jira-driven)

Turns a Jira story into a reviewed, tested code change for this repo. The whole point of
this skill is the confirmation gate in step 3: never start editing code before the user has
seen a plain-language summary of what the ticket is asking for and explicitly said to proceed.
Stories get reworded, mis-scoped, or contain assumptions that don't fit this codebase — catching
that *before* writing code is cheaper than catching it after.

## Input

The user gives a Jira issue key $NTA# (`NTA-<number>` — any number, this isn't limited to a specific
issue) or a full issue URL (`https://sandeep12biswas.atlassian.net/browse/NTA-<number>`). If
neither is present in the request, ask for it before doing anything else — don't guess an issue
key, and don't assume it's always the same one from a previous run of this skill.

Extract the key from a URL with the pattern `/browse/([A-Z]+-\d+)`; otherwise the input is
already the key. This pattern matches any project prefix, not just NTA, in case the site ever
has more than one project.

Optionally, the user may also supply a git branch name to build on (e.g. "implement NTA-23 off
feature/working-app-V2"). If given, that's the **base branch** the new feature branch gets created
from in Step 4. If not given, the base branch defaults to `develop` — this repo's working branch
(`main` is reserved for PRs/releases, per this repo's git conventions) — don't ask unless the
request is genuinely ambiguous about which existing branch it relates to.

## Step 1 — Fetch the issue

1. Resolve `cloudId`: try the site hostname (`sandeep12biswas.atlassian.net`) directly as
   `cloudId` first. If that fails, call `mcp__atlassian__getAccessibleAtlassianResources` and use
   the returned `id`.
2. Call `mcp__atlassian__getJiraIssue` with the resolved `cloudId`, the issue key, and
   `fields: ["summary","description","status","issuetype","priority","labels","components","assignee","reporter"]`.
3. If the issue has linked sub-tasks or an epic that materially changes scope, it's fine to
   fetch those too, but don't go spelunking through the whole project — one issue is the unit of
   work here.
4. Change the jira status from 'TODO' to 'In Progress'

If the issue can't be found (bad key, no access), say so plainly and stop — don't fall back to
inventing requirements.

## Step 2 — Summarize

Present a short, plain-language summary before anything else — no code, no file exploration
beyond what's needed to sanity-check feasibility. Cover:

- **What's being asked**, in your own words (don't just paste the Jira description back).
- **Where it likely lands** in this codebase's layers — see the Architecture section of
  `CLAUDE.md`. This is a pnpm + Turborepo workspace, one package per plugin, not a flat app:
  - `apps/desktop/src/` — the React/TypeScript frontend: `shell/` (menu, toolbar, panes),
    `registry/` (plugin lifecycle), `canvas-core/` (viewport, undo/redo), `persistence/`
    (the `PersistenceProvider` interface), `store/` (Zustand), `lib/tauri.ts` (typed
    `invoke()` wrappers for the rare custom Rust command).
  - `apps/desktop/src-tauri/` — the Tauri v2 (Rust) app shell. Per `docs/architecture.md` §8,
    **no bespoke native Rust code is required for v1** — persistence and file/link opening go
    through standard Tauri plugins (`plugin-fs`, `plugin-shell`) called directly from
    TypeScript, not through custom `#[tauri::command]`s.
  - `packages/` — shared, non-plugin code: `plugin-sdk` (the `Plugin`/`PluginManifest`/
    `PluginContext` contract), `plugin-playground` (isolated-dev harness), `contrast-util`,
    `rich-text-engine` (shared TipTap wrapper).
  - `plugins/` — one package per feature (`@linnote/plugin-<name>`): formatting commands
    (`format-*`), canvas element types (`element-*`), cloud-sync providers (`sync-onedrive`,
    `sync-google-drive`). A new feature is very often a new `plugins/*` package, not a change
    inside `apps/desktop/`.
  This is a quick read of the ticket against that layering, not a full design doc.
- **Anything ambiguous or underspecified** in the story — acceptance criteria that seem to
  contradict the plan in `docs/architecture.md`, missing detail on edge cases, or scope that
  seems bigger than a single story. Ask about these now, before the confirmation step, if
  they'd change what "done" means.
- Check `docs/architecture.md` (plugin architecture, data model, phase breakdown) and
  `CLAUDE.md` (module-boundary notes, e.g. the `WorkspaceNode`/`NotePage`/`CanvasElement` data
  model and the plugin-isolation rule) for anything relevant to the feature — flag it if the
  story looks like it conflicts with an existing decision, rather than silently overriding it.

## Step 3 — Confirm before starting (hard gate)

Use `AskUserQuestion` to get an explicit go-ahead. Something like:

- **Question**: "Ready to start implementing `<the resolved issue key>` as summarized above?"
  (use the actual key from step 1, e.g. `NTA-23` — never a hardcoded example key)
- **Options**: proceed as scoped / hold off (I want to change something first) / narrow or
  adjust the scope

Do not write, edit, or run anything beyond read-only exploration until the user confirms. If
they want changes to scope, update the summary and ask again — don't silently reinterpret.

## Step 4 — Branch setup

Once confirmed, before touching any files, set up an isolated branch for this story — never
implement directly on top of whatever branch happened to be checked out when the skill started.

1. **Resolve the base branch**: the git branch name supplied in the input (see Input section)
   if there was one, otherwise `develop`.
2. **Import the base branch into the local repo** — it may only exist on `origin` (e.g. another
   session pushed it, or it was never checked out locally):
   - `git fetch origin <base-branch>`
   - If `<base-branch>` has no local ref yet, create one tracking the remote:
     `git checkout -b <base-branch> origin/<base-branch>`.
   - If it already exists locally, fast-forward it instead of recreating it:
     `git checkout <base-branch> && git pull --ff-only origin <base-branch>`.
   - If the fetch fails because the branch doesn't exist on `origin` either, stop and tell the
     user — don't silently fall back to `develop` without asking, since they explicitly named a
     different base.
3. **Check for uncommitted local changes** (`git status --porcelain`) before switching anything.
   If there are changes unrelated to this story, stop and ask how to handle them (stash, commit,
   discard) rather than dragging them onto the new branch unasked.
4. **Create the feature branch** off the now-local base branch, using a `feature/<slug>` name:
   `git checkout -b feature/<issue-key-lowercased>[-<short-kebab-slug>] <base-branch>`
   (e.g. `feature/nta-23-dark-mode-toggle`), using the issue key from Step 1 so the branch is
   traceable back to the ticket.
   - If a branch with that name already exists locally, ask the user whether to reuse it (e.g.
     resuming earlier work on the same story) or pick a different name — don't force-overwrite
     silently.

All implementation work from Step 5 onward happens on this new branch.

## Step 5 — Implement

Once the branch is set up, implement the change following this repo's rules from `CLAUDE.md`:

- **Plugin isolation is the primary rule now.** A `plugins/*` package may depend only on
  `@linnote/plugin-sdk` and on any other plugin it lists explicitly in its manifest's
  `dependencies` — never by importing another plugin's source directly. If the story is "add a
  new formatting command / canvas element type / sync provider," it's very likely a new
  `plugins/*` package (`pnpm create-plugin <kebab-case-name>`, see `docs/architecture.md`
  §10), not a change bolted onto an existing one. Run `pnpm lint:boundaries`
  (`dependency-cruiser`) after touching `plugins/*` — it fails the build on a cross-plugin
  source import, so a violation should be visible before you even get to Step 6.
- Respect the persistence boundary: `apps/desktop/src/persistence/` (the `PersistenceProvider`
  interface) is the only thing that talks to `@tauri-apps/plugin-fs`; everything else goes
  through it. Native Rust is the exception, not the default — per `docs/architecture.md` §8, add
  a `#[tauri::command]` only when a capability genuinely needs it: fn in
  `apps/desktop/src-tauri/src/commands/mod.rs`, registered in the `generate_handler![...]` list
  in `apps/desktop/src-tauri/src/lib.rs`, wrapped by a typed function in
  `apps/desktop/src/lib/tauri.ts` that components call — never `invoke()` directly.
- Keep the data model in sync: `apps/desktop/src/types/index.ts` (`WorkspaceNode`, `NotePage`,
  `CanvasElement` union) is the one place this is defined — there is no separate Rust schema to
  keep in step with it (v1 persistence is flat JSON, not SQLite). Update
  `docs/architecture.md` §3-§4 alongside it if the shape of a canvas element or the tree node
  changes.
- Keep the change scoped to what was confirmed in step 3. If while implementing you discover the
  story needs more than expected (e.g. a new package boundary or a data-model change nobody
  flagged), stop and check with the user rather than expanding scope unilaterally.
- Follow existing patterns in the touched files rather than introducing a new style: the
  `TODO(phase-N)` comment convention tying stub code back to a plan phase (see
  `docs/architecture.md` §9 for the phase list), one Zustand store per concern in
  `apps/desktop/src/store/`, one plugin package per feature under `plugins/*` (copy
  `plugins/_template`'s shape: `package.json`, `src/index.ts`, `src/index.test.ts`,
  `playground.tsx`), one Rust module per genuine native need under `apps/desktop/src-tauri/src/`.

## Step 6 — Testing

Vitest is already configured workspace-wide (each `plugins/*`/`packages/*` package has its own
`test` script; every plugin scaffold ships a `src/index.test.ts` manifest-id smoke test) and
`rustc`/`cargo` **are installed** in this sandbox — verify with `cargo -V` rather than assuming
either fact from an older note. What to actually run depends on what you touched:

1. **TypeScript changes anywhere in the workspace**: run `pnpm typecheck` (turbo: `tsc --noEmit`
   across every package) — this is the baseline enforced check. If you touched `plugins/*`, also
   run `pnpm lint:boundaries` (dependency-cruiser plugin-isolation check).
2. **A plugin package (`plugins/*`) or shared package (`packages/*`)**: run its tests with
   `pnpm --filter <package-name> test` (e.g. `pnpm --filter @linnote/plugin-format-bold test`).
   Extend the existing `src/index.test.ts` rather than starting a new file, unless the change
   genuinely needs more than one test file's worth of coverage. If the change is meaningfully
   testable and the scaffolded smoke test is all that exists, add real assertions to it (or a
   sibling `*.test.ts`) using the same Vitest convention — don't introduce a different runner.
3. **`apps/desktop` changes**: `pnpm --filter desktop typecheck` and, if the change is in
   `src/`, `pnpm --filter desktop build` (`tsc -b && vite build`) to confirm the Vite build
   still succeeds.
4. **Rust changes (`apps/desktop/src-tauri/`)**: write idiomatic `#[cfg(test)] mod tests { ... }`
   inline in the touched module, and run `cargo check` and `cargo test` from
   `apps/desktop/src-tauri/`. Report the actual output — if a future environment genuinely lacks
   a Rust toolchain, say so plainly and don't claim the tests passed, but don't assume that's the
   case here without checking (`cargo -V`) first.
5. Run whatever suite(s) apply and report the actual pass/fail output — don't stop at "the new
   test passes" if other tests in the same runner could have been affected, and don't claim a
   suite is green without having actually run it.

## Step 7 — Code commit, push the code to git hub

Only after Step 6's checks are green (or, for Rust, written and honestly reported as unverified
if no toolchain is available):

1. Review scope before staging: `git status` / `git diff` to confirm everything staged actually
   belongs to this story. `git add` the touched files (or `git add -A` only if the whole diff is
   in-scope) — don't sweep in unrelated stray changes.
2. Commit with a message in this format:
   `<Verb> feature # <issue-key> - <short plain-language description>`
   (e.g. `Added feature # NTA-8 - font family to the text editor`), using the real issue key
   from Step 1. End the commit message with:
   `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
3. Push the feature branch created in Step 4 to `origin`, never `main` or `develop` directly:
   `git push -u origin <feature-branch>` on the first push (plain `git push` after that, since
   `-u` already set the upstream).
4. If the push is rejected (e.g. the remote has diverged), stop and ask the user how to proceed —
   don't force-push without being explicitly told to.
5. Report the branch name pushed and confirm success from the actual `git push` output — don't
   claim it pushed without having run it. Opening a pull request is optional and belongs in Step 9
   (wrap-up) as something to offer, not do unasked.

## Step 8 — Update the Jira ticket

Once the feature branch is pushed, close the loop on the ticket itself — do this automatically as
part of finishing the story, not as something to offer/ask permission for (unlike opening a PR in
Step 9):

1. Post a summary comment on the issue via `mcp__atlassian__addCommentToJiraIssue` covering what
   changed (files touched), how it maps back to the story's acceptance criteria, the test result
   (counts, not just "tests pass" — and say plainly if Rust tests were written but unverified,
   per Step 6), and the feature branch name — the same level of detail you'd give the user in
   Step 9's wrap-up.
2. Transition the issue via `mcp__atlassian__getTransitionsForJiraIssue` +
   `mcp__atlassian__transitionJiraIssue` to whichever returned transition's target status is named
   **"Done"** — look it up rather than hardcoding a transition ID, since IDs can differ across
   projects/workflows.

## Step 9 — Wrap up

- Summarize what changed: files touched, and a one-line mapping back to the story's acceptance
  criteria (does each point from the ticket have a corresponding change?).
- Report the final test run result verbatim (counts, not just "tests pass"; note explicitly if
  a Rust toolchain genuinely wasn't available to run tests written in `src-tauri/` — don't
  assume that's the case without checking `cargo -V` first).
- `docs/architecture.md` and `README.md` get updated per *phase* (per `docs/architecture.md`
  §9's phase list and `CLAUDE.md`'s "Project tracking" section — e.g. Phase 1 is tracked as
  NTA-7 with subtasks NTA-8..NTA-15, and NTA-16 with NTA-17..NTA-31), not per individual
  task/subtask — don't update them reflexively here. If this story completes a phase of work,
  ask the user whether they want those docs updated now.
- Optionally offer (don't do it unasked) to open a pull request from the pushed feature branch
  (e.g. via `gh pr create`) targeting the base branch resolved in Step 4.
