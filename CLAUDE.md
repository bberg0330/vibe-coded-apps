# Movie Night

## Figma sync

Figma file: `ajsVg5LjRT7Y5D346WMif3` (Movie Night — UX/UI Baseline). Components live in `src/components/`, styles in `src/styles.css`, and each component has a Code Connect mapping in a sibling `*.figma.ts`.

Figma changes never update the React code automatically. When the user shares Figma links (with a `node-id`) or says a component was updated in Figma, review and compare without being asked:

1. For each node, call `get_design_context` (with `disableCodeConnect: true` so the full design comes back, not just the Code Connect snippet) and read the component description too.
2. Compare against the matching React component and its CSS in `src/styles.css`: layout, sizes, spacing, colour tokens, typography, states/variants, and what content is shown.
3. Report what matches and what differs. Treat the component description in Figma as authoritative when it conflicts with a raw frame value (e.g. a 52px frame vs. a "44x44" description); flag the conflict instead of picking silently.
4. Implement differences that are clearly design updates. Ask before changes that alter behaviour or remove content, and don't invent changes when nothing differs.
5. If code changed, update the matching `*.figma.ts` if props changed, run `npm test` and `npm run build`, then commit, push and open a draft PR.
