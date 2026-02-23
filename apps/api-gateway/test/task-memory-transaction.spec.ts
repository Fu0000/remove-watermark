import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryTransactionStore } from "../src/modules/tasks/task-memory-transaction";

function createStateStore(
  filePath: string,
  stateRef: { value: number },
  persistenceEnabled = true
): MemoryTransactionStore<{ counter: number }> {
  return new MemoryTransactionStore({
    persistenceEnabled,
    persistenceFilePath: filePath,
    snapshot: () => ({ counter: stateRef.value }),
    restore: (snapshot) => {
      stateRef.value = snapshot.counter;
    },
    revive: (raw) => {
      if (!raw || typeof raw !== "object") {
        return { counter: 0 };
      }
      const counter =
        typeof (raw as { counter?: unknown }).counter === "number" ? (raw as { counter: number }).counter : 0;
      return { counter };
    }
  });
}

test("MemoryTransactionStore should rollback in-memory state on transaction failure", () => {
  const state = { value: 5 };
  const store = createStateStore(join(tmpdir(), `memory-store-disabled-${crypto.randomUUID()}.json`), state, false);

  assert.throws(() => {
    store.runInTransaction(() => {
      state.value = 6;
      throw new Error("boom");
    });
  });

  assert.equal(state.value, 5);
});

test("MemoryTransactionStore should persist snapshot to disk after successful transaction", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "memory-store-"));
  const filePath = join(tempDir, "state.json");
  const state = { value: 1 };

  try {
    const store = createStateStore(filePath, state, true);
    store.runInTransaction(() => {
      state.value = 2;
    });

    assert.equal(state.value, 2);
    assert.equal(existsSync(filePath), true);
    const persisted = JSON.parse(readFileSync(filePath, "utf8")) as { counter: number };
    assert.equal(persisted.counter, 2);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("MemoryTransactionStore should hydrate snapshot from disk on startup", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "memory-store-"));
  const filePath = join(tempDir, "state.json");
  const state = { value: 0 };

  try {
    writeFileSync(filePath, JSON.stringify({ counter: 9 }), "utf8");
    createStateStore(filePath, state, true);
    assert.equal(state.value, 9);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
