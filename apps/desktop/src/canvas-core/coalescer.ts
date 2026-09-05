// NTA-67 — gesture coalescing: "dragging a segment or painting a long
// stroke coalesces into one command per gesture, not one per pointer
// event." Generalized here (not segment-specific) since the same shape
// applies to every continuous-callback mutation this app has: segment
// move/resize/content, file-attachment/youtube-embed move, and — once
// built — an ink stroke.
//
// The uniform rule: the *first* `update(id, value)` call in a burst
// captures the pre-burst value (via `getCurrent`, called *before*
// `apply`); every call applies its value live, immediately, synchronously
// (so a caller reading real state right after a pointer event — or a
// test asserting the same — always sees the latest value, exactly as
// before this ticket); once `settleMs` passes with no further calls for
// that `id`, one `Command` covering the whole burst (`before` -> final
// `value`) is committed via `commit` (../canvas-core/commandStack.ts's
// `commit`, never `execute` — the mutation already happened live, so
// `execute`ing it again would be a no-op at best and wrong if `execute`
// has side effects beyond setting the value).
//
// This intentionally does NOT try to distinguish "kinds" of edit within
// one settle window — e.g. toggling Bold immediately followed by typing
// more text, both inside `settleMs` of each other, coalesce into a
// single undo step covering both. Simpler than gesture-boundary
// heuristics, and consistent with how most editors group rapid
// successive edits into one undo step.
//
// No pointerup/blur-driven "flush now" hook exists — every caller
// (SegmentLayerHost, FileAttachmentHost, YouTubeEmbedHost) just calls
// `update` on every live change and lets the timer settle it; `cancelAll`
// exists for the one case that does need an explicit signal: a
// component unmounting or switching to a different open page, where a
// stale pending timer must never fire later against the wrong page.
//
// `flushAll` exists for a different explicit signal, found by actually
// driving the app end-to-end (not by inspection): pressing Ctrl+Z very
// soon after typing — before the ~400ms settle window elapses — popped
// the *wrong* command off the undo stack (whatever was already
// committed, e.g. the segment's own insert, since the just-made edit
// wasn't on the stack yet at all). Every Host registers its
// coalescers' combined `flushAll` via `registerFlushHook`
// (./commandStack.ts), which `undo`/`redo` call before popping — so a
// pending burst always commits (becoming the top of the stack) before
// undo/redo look at it.
//
// `flushInSequenceOrder` exists for a THIRD signal, one level up from a
// single coalescer, also found by driving the app: a Host (e.g.
// SegmentLayerHost) owns *several* coalescers — move, resize, content —
// and a naive "flush move, then resize, then content" fixed order
// commits whichever channel happens to still be pending *last* in that
// list on top of the undo stack, regardless of which edit the user
// actually made most recently. Reproduced concretely: type text (starts
// a content burst), then immediately drag the segment (starts a move
// burst) before the content burst's timer had fired — flushing
// move-then-content on undo committed content last, so the first Ctrl+Z
// undid the *typing*, not the *drag*, even though the drag was the more
// recent action. Every pending burst, across every coalescer a Host
// owns, now carries a shared, module-level, monotonically increasing
// `sequence` — assigned once, when that burst *starts* — so they can be
// committed in true chronological order regardless of which channel
// each belongs to.

import type { Command } from "./commandStack";

/** Shared across every `Coalescer` instance in the app — see this file's header comment on `flushInSequenceOrder` for why it has to be global, not per-coalescer. */
let sequenceCounter = 0;

export interface Coalescer<T> {
  update(id: string, value: T): void;
  /** Clears every pending timer WITHOUT committing — for unmount / a page switch, where a stale in-flight burst must never later commit against the wrong page. */
  cancelAll(): void;
  /**
   * Immediately settles (commits) every pending burst, without waiting
   * out its timer — see this file's header comment on why
   * `./commandStack.ts`'s `undo`/`redo` call this (via
   * `registerFlushHook`) before popping the stack: without it, Ctrl+Z
   * right after typing (before the ~400ms settle window elapses) would
   * undo whatever command *was already on the stack* instead of the
   * edit the user just made, since the just-made edit isn't there yet.
   *
   * A Host with more than one coalescer (SegmentLayerHost's move/resize/
   * content) should use `flushInSequenceOrder` below instead of calling
   * this on each one in a fixed order — see this file's header comment
   * on why.
   */
  flushAll(): void;
  /** The oldest still-pending burst's sequence number, or `null` if nothing is pending — `flushInSequenceOrder`'s own building block, not meant to be called directly by a Host. */
  oldestPendingSequence(): number | null;
  /** Settles (commits) just the single oldest still-pending burst, if any — `flushInSequenceOrder`'s own building block. */
  flushOldest(): void;
}

/**
 * Commits every pending burst across all of `coalescers`, in the true
 * chronological order each burst *started* (not grouped by which
 * coalescer/channel it belongs to) — what a Host owning more than one
 * coalescer should register with `./commandStack.ts`'s
 * `registerFlushHook` instead of calling `flushAll()` on each
 * individually. See this file's header comment for the bug this fixes.
 */
export function flushInSequenceOrder(coalescers: ReadonlyArray<Coalescer<unknown>>): void {
  while (true) {
    let oldest: { coalescer: Coalescer<unknown>; sequence: number } | null = null;
    for (const coalescer of coalescers) {
      const sequence = coalescer.oldestPendingSequence();
      if (sequence !== null && (!oldest || sequence < oldest.sequence)) oldest = { coalescer, sequence };
    }
    if (!oldest) return;
    oldest.coalescer.flushOldest();
  }
}

export interface CoalescerOptions<T> {
  /** Performs the live mutation — called synchronously and immediately on every `update()`. */
  apply: (id: string, value: T) => void;
  /** Reads the current value back — called once per burst (before the first `apply`) to capture `before`, and once at settle time to capture the burst's final `after`. */
  getCurrent: (id: string) => T;
  /** ../canvas-core/commandStack.ts's `commit` (or a test double of the same shape). */
  commit: (command: Command) => void;
  label: (id: string) => string;
  /** @default (a, b) => a === b */
  isEqual?: (a: T, b: T) => boolean;
  /** Inactivity window before a burst commits as one command. @default 400 */
  settleMs?: number;
}

const DEFAULT_SETTLE_MS = 400;

export function createCoalescer<T>(options: CoalescerOptions<T>): Coalescer<T> {
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const isEqual = options.isEqual ?? ((a: T, b: T) => a === b);
  const pending = new Map<string, { before: T; timer: ReturnType<typeof setTimeout>; sequence: number }>();

  function settle(id: string) {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    const before = entry.before;
    const after = options.getCurrent(id);
    if (isEqual(before, after)) return; // e.g. a click that started then immediately reverted — nothing to undo
    options.commit({
      label: options.label(id),
      execute: () => options.apply(id, after),
      undo: () => options.apply(id, before),
    });
  }

  return {
    update(id, value) {
      if (!pending.has(id)) {
        // First call of a new burst — capture the pre-burst value BEFORE
        // applying, so `before` reflects the state right before this
        // gesture started, not after its first increment. `sequence` is
        // assigned here too, once, for the same reason: it has to mark
        // when the burst *started*, not when it last changed.
        const before = options.getCurrent(id);
        pending.set(id, { before, timer: setTimeout(() => settle(id), settleMs), sequence: sequenceCounter++ });
      }
      options.apply(id, value);
      const entry = pending.get(id)!;
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => settle(id), settleMs);
    },
    cancelAll() {
      for (const entry of pending.values()) clearTimeout(entry.timer);
      pending.clear();
    },
    flushAll() {
      // Snapshot ids first — `settle` deletes from `pending` as it goes,
      // and mutating a Map while iterating it is exactly the kind of
      // thing that silently skips entries.
      for (const id of [...pending.keys()]) {
        clearTimeout(pending.get(id)!.timer);
        settle(id);
      }
    },
    oldestPendingSequence() {
      let oldest: number | null = null;
      for (const entry of pending.values()) {
        if (oldest === null || entry.sequence < oldest) oldest = entry.sequence;
      }
      return oldest;
    },
    flushOldest() {
      let oldestId: string | null = null;
      let oldestSequence = Infinity;
      for (const [id, entry] of pending) {
        if (entry.sequence < oldestSequence) {
          oldestId = id;
          oldestSequence = entry.sequence;
        }
      }
      if (oldestId === null) return;
      clearTimeout(pending.get(oldestId)!.timer);
      settle(oldestId);
    },
  };
}
