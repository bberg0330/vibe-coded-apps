# Movie Night

## Branches

Name branches after the work, as `<type>/<short-kebab-summary>`: `feature/…` for new behaviour, `fix/…` for bugs, `design/…` for Figma-driven UI syncs, `chore/…` for tooling and docs (e.g. `feature/recommendation-score-floor`). Don't use generated or random names, even if a session suggests one. Start each piece of work on a fresh branch from `main`; once its PR merges, start the next change on a new branch rather than reusing the old one.

## Figma sync

Figma file: `ajsVg5LjRT7Y5D346WMif3` (Movie Night — UX/UI Baseline). Components live in `src/components/`, styles in `src/styles.css`, and each component has a Code Connect mapping in a sibling `*.figma.ts`.

### Design first

Review designs before changing UI code. Unless the user has provided Figma designs for the change, draft the proposed UI in Figma first (on a new "Proposal — …" page, leaving existing components untouched), share the link, and wait for approval before writing or merging code. Behaviour-only changes with no visual difference don't need this. If UI code was already written without a design, set the PR to draft and design it in Figma before it goes further.

Figma changes never update the React code automatically. When the user shares Figma links (with a `node-id`) or says a component was updated in Figma, review and compare without being asked:

1. For each node, call `get_design_context` (with `disableCodeConnect: true` so the full design comes back, not just the Code Connect snippet) and read the component description too.
2. Compare against the matching React component and its CSS in `src/styles.css`: layout, sizes, spacing, colour tokens, typography, states/variants, and what content is shown. Go through **layout per container**, not just per element: for every frame in Figma's output, check direction, `justify`/`align` (e.g. `justify-center`), gap, padding and each child's size and position (frame metadata x/y/width/height) against the matching CSS rule. A row Figma centres needs an explicit `justify-content: center`; a plain flex row is left-aligned.
3. Report what matches and what differs. Treat the component description in Figma as authoritative when it conflicts with a raw frame value (e.g. a 52px frame vs. a "44x44" description); flag the conflict instead of picking silently.
4. Implement differences that are clearly design updates. Ask before changes that alter behaviour or remove content, and don't invent changes when nothing differs.
5. **Compare it rendered, not just on paper.** Before opening a PR, render the affected components in headless Chromium (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; install `playwright-core` outside the repo, e.g. in the scratchpad, never as a repo dependency): add a temporary, untracked `harness.html` + `src/harness.tsx` that renders each Figma variant with sample data at 375px in dark mode, run the Vite dev server on a spare port, and use `getBoundingClientRect()` to measure the boxes (card, poster, text rows, action column, buttons) plus computed colours/opacity/font-size. Compare them with Figma's `get_metadata` coordinates and `get_screenshot`. Treat differences of about 2px in text-row heights as font-metric noise (Figma uses SF Pro); anything larger, or any alignment, size or colour difference, is a finding to fix or report. Delete the harness files before committing.
6. If code changed, update the matching `*.figma.ts` if props changed, run `npm test` and `npm run build`, then commit, push and open the PR ready for review (not as a draft).
7. Enable auto-merge on the PR (squash) so it merges once checks pass. Don't merge by hand or bypass failing checks; if a check fails, fix it and push.

### Features added, edited or removed in Figma

Visual props aren't the only thing that changes. A button, field, state or whole interaction can be added or dropped in Figma, and a size/colour comparison misses it. So in step 2, also diff the *structure*:

- Call `get_metadata` on each node and list what it contains (every button/control in `card-actions`, text rows, badges, states/variants, hidden layers). Compare that list with what the React component renders and which props/handlers it takes, then trace where the component is used (`src/App.tsx`, `src/screens/`).
- **Removed in Figma:** remove the UI, its props and handler plumbing through every screen, its tests, and any Code Connect prop. Leave the data layer (`src/data/`, stored entries, types) and screens that Figma doesn't show alone; list them in the PR as now-orphaned and ask before deleting stored data or screens.
- **Added in Figma:** add the UI, props and handlers. If it needs new data, storage, an API call or a new screen, ask before building that part.
- **Edited in Figma:** update the component and every place it's used; keep behaviour the same unless the design says otherwise.
- Figma component descriptions can go stale after a feature change (e.g. still mentioning a removed button). Flag any mismatch between description and frames so the user can update the description.
- In the PR description, add a "Feature changes" list of what was added, edited or removed, and what was deliberately left in place.
