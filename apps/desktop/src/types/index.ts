// Shared domain types, mirroring docs/architecture.md §5-§10 (mirrors the
// Notion "Desing architecture" page — keep both in sync when the data
// model changes). Two data models, kept deliberately separate per §5.1:
// the workspace tree (navigation metadata only) and page content.

// ---- §5: Workspace, Notebook & Page Hierarchy -----------------------------

export type NodeType = "notebook" | "folder" | "page";

export interface WorkspaceNode {
  id: string; // stable UUID, never reused
  parentId: string | null; // null only for root-level notebooks
  type: NodeType;
  title: string;
  order: string; // fractional-index sort key among siblings, §5.3
  icon?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
  trashedAt?: string | null; // soft delete, §5.5
}

// ---- §6: Page Document Data Model -----------------------------------------

export interface NotePage {
  id: string; // same id as the corresponding `page`-type WorkspaceNode.id
  header: {
    title: string;
    date?: string; // ISO date, optional
    align: "left" | "center" | "right"; // default "left"
  };
  background: {
    kind: "color" | "pattern";
    color?: string; // hex, when kind === "color"
    pattern?: "plain" | "ruled" | "grid" | "dotted";
    suggestedTextColor?: string; // via @linnote/contrast-util, §6.1
  };
  elements: CanvasElement[]; // open, plugin-extensible union — see below
  createdAt: string;
  updatedAt: string;
}

// `CanvasElement` is intentionally open-ended: it's whatever the currently
// active `canvasElementTypes` plugin contributions register (§3.3). The
// variants below are the core.* element plugins shipped today
// (plugins/element-*); a future plugin can add another without touching
// this file's `elements: CanvasElement[]` contract.

// ---- §7: Segment Block Model -----------------------------------------------

export interface SegmentBlock {
  id: string;
  type: "segment";
  visibility: "invisible" | "visible"; // border shown to the user, or not
  x: number;
  y: number;
  width: number; // user-resizable via side drag handles
  height: number; // auto-grows downward
  content: unknown; // RichTextDoc, produced by @linnote/rich-text-engine, §8
  zIndex: number;
}

// ---- §9: Ink Rendering Pipeline --------------------------------------------

export interface InkStroke {
  id: string;
  type: "ink";
  points: Array<{ x: number; y: number; pressure: number; t: number }>;
  color: string;
  size: number;
  tool: "pen" | "highlighter" | "eraser";
  zIndex: number;
}

// ---- §10: File Attachments & Embeds ----------------------------------------

export interface FileAttachment {
  id: string;
  type: "file-attachment";
  x: number;
  y: number;
  width: number;
  height: number;
  originalName: string;
  extension: string; // docx, xlsx, txt, md, ...
  assetPath: string; // assets/<id>/<originalName>
  zIndex: number;
}

export interface YouTubeEmbed {
  id: string;
  type: "youtube-embed";
  x: number;
  y: number;
  width: number;
  height: number;
  videoUrl: string;
  playMode: "inline" | "external"; // set once, at insert time
  zIndex: number;
}

export interface ImageElement {
  id: string;
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  assetPath: string;
  zIndex: number;
}

export type CanvasElement = SegmentBlock | InkStroke | ImageElement | FileAttachment | YouTubeEmbed;
