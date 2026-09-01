// NTA-56 — shared constant between FolderTreePane.tsx/PageListPane.tsx and
// App.css: the fixed row height (px) both panes' `react-window`
// `FixedSizeList` use. Must equal `.folder-tree__row`/`.page-list__item`'s
// CSS `height` exactly — `FixedSizeList` positions every row by
// `index * itemSize`, so any mismatch between this and the actual
// rendered row height shows up as visible gaps or overlap while
// scrolling.
export const PANE_ROW_HEIGHT = 32;
