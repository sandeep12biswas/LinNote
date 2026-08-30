// Seed dataset for NTA-49's in-memory WorkspaceNode tree store — one
// notebook with a small folder/page tree, standing in for
// `FileSystemPersistenceProvider.readTree()` (Phase 8, NTA-69, currently
// "not implemented" on purpose — see ../persistence/index.ts) until that
// ticket lands. Not meant to be exhaustive, just varied enough to
// exercise the Folder Tree pane's nesting/expand-collapse (NTA-50) and
// the Page List pane's subpage nesting (NTA-51):
//
//   My Notebook
//   ├─ Work
//   │  ├─ Projects
//   │  │  └─ Roadmap (page)
//   │  │     └─ Q1 milestones (page, subpage of Roadmap)
//   │  └─ Meeting Notes (page)
//   └─ Personal
//      └─ Groceries (page)
//
// Fixed ids (not `crypto.randomUUID()`) so the seed is deterministic
// across store resets/tests, unlike `createNode`'s runtime-generated ids.

import { generateKeyBetween } from "fractional-indexing";
import type { WorkspaceNode } from "../types";

const SEED_TIMESTAMP = "2026-08-01T00:00:00.000Z";

// Two sibling-order keys, reused across every sibling group below —
// fine, since `order` is only ever compared among nodes sharing a
// `parentId` (see `getChildren` in ./index.ts).
const FIRST = generateKeyBetween(null, null);
const SECOND = generateKeyBetween(FIRST, null);

function node(fields: Pick<WorkspaceNode, "id" | "parentId" | "type" | "title" | "order">): WorkspaceNode {
  return { ...fields, createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP, trashedAt: null };
}

export function createSeedWorkspaceNodes(): WorkspaceNode[] {
  return [
    node({ id: "notebook-1", parentId: null, type: "notebook", title: "My Notebook", order: FIRST }),

    node({ id: "folder-work", parentId: "notebook-1", type: "folder", title: "Work", order: FIRST }),
    node({ id: "folder-personal", parentId: "notebook-1", type: "folder", title: "Personal", order: SECOND }),

    node({ id: "folder-projects", parentId: "folder-work", type: "folder", title: "Projects", order: FIRST }),
    node({ id: "page-meeting-notes", parentId: "folder-work", type: "page", title: "Meeting Notes", order: SECOND }),

    node({ id: "page-roadmap", parentId: "folder-projects", type: "page", title: "Roadmap", order: FIRST }),
    node({ id: "page-roadmap-q1", parentId: "page-roadmap", type: "page", title: "Q1 milestones", order: FIRST }),

    node({ id: "page-groceries", parentId: "folder-personal", type: "page", title: "Groceries", order: FIRST }),
  ];
}
