// NTA-13 — mounts the app shell's static 4-region layout
// (docs/architecture.md §2). The actual menu bar / toolbar / pane
// composition lives in `./shell` (see `shell/AppShell.tsx`) so this file
// stays a thin entry point, matching `shell/`'s ownership of the layout.

import { AppShell } from "./shell";
import "./App.css";

function App() {
  return <AppShell />;
}

export default App;
