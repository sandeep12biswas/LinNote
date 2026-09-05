import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCoalescer, flushInSequenceOrder, type Coalescer } from "./coalescer";
import type { Command } from "./commandStack";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

interface Harness {
  coalescer: Coalescer<number>;
  values: Map<string, number>;
  commits: Command[];
}

function makeHarness(overrides: Partial<Parameters<typeof createCoalescer<number>>[0]> = {}): Harness {
  const values = new Map<string, number>();
  const commits: Command[] = [];
  const coalescer = createCoalescer<number>({
    getCurrent: (id) => values.get(id) ?? 0,
    apply: (id, value) => values.set(id, value),
    commit: (command) => commits.push(command),
    label: (id) => `Move ${id}`,
    settleMs: 100,
    ...overrides,
  });
  return { coalescer, values, commits };
}

describe("createCoalescer", () => {
  it("applies live, on the next animation frame — not synchronously (NTA-75: RAF-batched)", () => {
    const { coalescer, values } = makeHarness();

    coalescer.update("a", 1);
    expect(values.get("a")).toBeUndefined(); // not yet — waiting for the frame
    vi.advanceTimersToNextFrame();
    expect(values.get("a")).toBe(1);

    coalescer.update("a", 2);
    vi.advanceTimersToNextFrame();
    expect(values.get("a")).toBe(2);
  });

  it("collapses several updates within one frame into a single apply() call, using the latest value", () => {
    const values = new Map<string, number>();
    const applyCalls: number[] = [];
    const coalescer = createCoalescer<number>({
      getCurrent: (id) => values.get(id) ?? 0,
      apply: (id, value) => {
        applyCalls.push(value);
        values.set(id, value);
      },
      commit: () => {},
      label: () => "Move",
      settleMs: 100,
    });

    coalescer.update("a", 1);
    coalescer.update("a", 2);
    coalescer.update("a", 3); // all three before the frame fires
    vi.advanceTimersToNextFrame();

    expect(applyCalls).toEqual([3]); // one apply(), with the latest value — not [1, 2, 3]
    expect(values.get("a")).toBe(3);
  });

  it("commits exactly one command after a burst settles, covering the whole burst's net effect", () => {
    const { coalescer, commits } = makeHarness();

    coalescer.update("a", 1);
    vi.advanceTimersByTime(50);
    coalescer.update("a", 2);
    vi.advanceTimersByTime(50);
    coalescer.update("a", 3);
    vi.advanceTimersByTime(100); // settles now — no update in the last 100ms

    expect(commits).toHaveLength(1);
    expect(commits[0].label).toBe("Move a");
  });

  it("the committed command's execute()/undo() apply the burst's final value / pre-burst value", () => {
    const { coalescer, values, commits } = makeHarness();
    values.set("a", 10); // pre-burst value

    coalescer.update("a", 11);
    coalescer.update("a", 12);
    vi.advanceTimersByTime(100);

    expect(commits).toHaveLength(1);
    values.set("a", 999); // simulate something else changed it since
    commits[0].undo();
    expect(values.get("a")).toBe(10);
    commits[0].execute();
    expect(values.get("a")).toBe(12);
  });

  it("does not commit anything if no update ever settles (still pending)", () => {
    const { coalescer, commits } = makeHarness();
    coalescer.update("a", 1);
    vi.advanceTimersByTime(50); // less than settleMs
    expect(commits).toHaveLength(0);
  });

  it("tracks separate bursts per id independently", () => {
    const { coalescer, commits } = makeHarness();

    coalescer.update("a", 1);
    vi.advanceTimersByTime(50);
    coalescer.update("b", 100);
    vi.advanceTimersByTime(100); // "a" settles (started 150ms ago), "b" also settles (started 100ms ago)

    expect(commits.map((c) => c.label).sort()).toEqual(["Move a", "Move b"]);
  });

  it("skips committing when the burst's final value equals the pre-burst value (isEqual)", () => {
    const { coalescer, values, commits } = makeHarness();
    values.set("a", 5);

    coalescer.update("a", 9);
    coalescer.update("a", 5); // back to where it started
    vi.advanceTimersByTime(100);

    expect(commits).toHaveLength(0);
  });

  it("flushAll() commits every pending burst immediately, without waiting for its timer", () => {
    const { coalescer, commits } = makeHarness();

    coalescer.update("a", 1);
    coalescer.update("b", 2);
    coalescer.flushAll();

    expect(commits.map((c) => c.label).sort()).toEqual(["Move a", "Move b"]);
  });

  it("flushAll() leaves nothing pending — a later timer tick commits nothing more", () => {
    const { coalescer, commits } = makeHarness();

    coalescer.update("a", 1);
    coalescer.flushAll();
    vi.advanceTimersByTime(1000);

    expect(commits).toHaveLength(1);
  });

  it("cancelAll() clears pending timers without committing", () => {
    const { coalescer, commits } = makeHarness();

    coalescer.update("a", 1);
    coalescer.cancelAll();
    vi.advanceTimersByTime(1000);

    expect(commits).toHaveLength(0);
  });

  it("a fresh update after cancelAll() starts a brand-new burst (captures a fresh 'before')", () => {
    const { coalescer, values, commits } = makeHarness();
    values.set("a", 1);

    coalescer.update("a", 2);
    coalescer.cancelAll();
    values.set("a", 50); // something else changed it while cancelled
    coalescer.update("a", 60);
    vi.advanceTimersByTime(100);

    expect(commits).toHaveLength(1);
    commits[0].undo();
    expect(values.get("a")).toBe(50); // not the original 1 — the burst restarted after cancelAll()
  });

  it("flushOldest() commits only the single oldest-started pending burst, leaving newer ones pending", () => {
    const { coalescer, commits } = makeHarness();

    coalescer.update("a", 1); // starts first
    vi.advanceTimersByTime(10);
    coalescer.update("b", 2); // starts second

    coalescer.flushOldest();

    expect(commits.map((c) => c.label)).toEqual(["Move a"]);
    expect(coalescer.oldestPendingSequence()).not.toBeNull(); // "b" is still pending
  });

  it("oldestPendingSequence() returns null when nothing is pending", () => {
    const { coalescer } = makeHarness();
    expect(coalescer.oldestPendingSequence()).toBeNull();
  });

  it("uses the default isEqual (===) when none is provided", () => {
    const values = new Map<string, number>();
    const commits: Command[] = [];
    const coalescer = createCoalescer<number>({
      getCurrent: (id) => values.get(id) ?? 0,
      apply: (id, value) => values.set(id, value),
      commit: (command) => commits.push(command),
      label: (id) => `Move ${id}`,
      settleMs: 100,
    });
    values.set("a", 5);
    coalescer.update("a", 5); // no actual change
    vi.advanceTimersByTime(100);
    expect(commits).toHaveLength(0);
  });
});

describe("flushInSequenceOrder", () => {
  // Reproduces the exact bug found by driving the real app: typing into a
  // segment (a content burst) immediately followed by dragging it (a move
  // burst) — both still pending when Ctrl+Z is pressed. Flushing "move,
  // then content" in a fixed order (the naive first attempt) committed
  // content last, so the first undo reverted the *typing*, not the more
  // recent *drag*. Chronological order fixes it: content started first
  // (it's the older one), so it must commit — and end up UNDER — move on
  // the stack.
  it("commits pending bursts across multiple coalescers in the order they started, not grouped by which coalescer they belong to", () => {
    // A shared, order-preserving commit sink — `makeHarness`'s own
    // per-instance `commits` arrays wouldn't interleave across the two
    // coalescers, so this is what actually proves cross-coalescer order.
    const allCommits: string[] = [];
    const recordingCommit = (command: Command) => allCommits.push(command.label);
    const content = makeHarness({ label: () => "Edit text", commit: recordingCommit });
    const move = makeHarness({ label: () => "Move segment", commit: recordingCommit });

    content.coalescer.update("seg-1", 1); // starts first (typing)
    vi.advanceTimersByTime(10);
    move.coalescer.update("seg-1", 2); // starts second (the drag), before content's timer fires

    flushInSequenceOrder([content.coalescer, move.coalescer]);

    expect(allCommits).toEqual(["Edit text", "Move segment"]);
  });

  it("is a no-op when nothing is pending on any coalescer", () => {
    const a = makeHarness();
    const b = makeHarness();
    expect(() => flushInSequenceOrder([a.coalescer, b.coalescer])).not.toThrow();
    expect(a.commits).toHaveLength(0);
    expect(b.commits).toHaveLength(0);
  });
});
