// Shared domain types, mirroring the SQLite hierarchy in
// `src-tauri/src/db/schema.rs`: notebooks -> sections -> pages -> blocks.

export interface Notebook {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Section {
  id: string;
  notebookId: string;
  name: string;
  position: number;
}

export interface Page {
  id: string;
  sectionId: string;
  title: string;
  position: number;
}

// Phase 2 adds the full block union (text, heading, image, checklist,
// table, code, divider); phase 3 adds a "canvas" block for Excalidraw.
export type BlockType =
  | "text"
  | "heading"
  | "image"
  | "checklist"
  | "table"
  | "code"
  | "divider"
  | "canvas";

export interface Block {
  id: string;
  pageId: string;
  type: BlockType;
  content: unknown;
  position: number;
}
