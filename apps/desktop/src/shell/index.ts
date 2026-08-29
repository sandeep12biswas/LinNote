// App shell — docs/architecture.md §4: menu bar, toolbar, and the 4-region
// layout (menu | toolbar | Folder Tree pane | Page List pane | Editor
// Canvas pane). Renders `menu`/`toolbar` contributions from the registry
// (../registry/), grouped and sorted per §4.1; the Folder Tree and Page
// List panes read from the WorkspaceNode tree (../../types#WorkspaceNode)
// via ../persistence/.
//
// TODO(phase-1): menu bar + toolbar contribution rendering.
// TODO(phase-2): Folder Tree pane + Page List pane (§4.1, §5.4), fractional
// -index drag-to-reorder, breadcrumb trail.
