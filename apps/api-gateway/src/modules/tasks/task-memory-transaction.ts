import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface MemoryTransactionStoreOptions<TSnapshot> {
  persistenceEnabled: boolean;
  persistenceFilePath: string;
  snapshot: () => TSnapshot;
  restore: (snapshot: TSnapshot) => void;
  revive: (raw: unknown) => TSnapshot;
}

export class MemoryTransactionStore<TSnapshot> {
  constructor(private readonly options: MemoryTransactionStoreOptions<TSnapshot>) {
    this.hydrateFromDisk();
  }

  runInTransaction<T>(runner: () => T): T {
    const snapshot = this.options.snapshot();
    try {
      const result = runner();
      this.flushToDisk();
      return result;
    } catch (error) {
      this.options.restore(snapshot);
      throw error;
    }
  }

  private hydrateFromDisk() {
    if (!this.options.persistenceEnabled || !existsSync(this.options.persistenceFilePath)) {
      return;
    }

    const raw = readFileSync(this.options.persistenceFilePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const snapshot = this.options.revive(parsed);
    this.options.restore(snapshot);
  }

  private flushToDisk() {
    if (!this.options.persistenceEnabled) {
      return;
    }

    const payload = JSON.stringify(this.options.snapshot(), null, 2);
    const targetDir = dirname(this.options.persistenceFilePath);
    mkdirSync(targetDir, { recursive: true });

    const tempPath = `${this.options.persistenceFilePath}.tmp`;
    writeFileSync(tempPath, payload, "utf8");
    renameSync(tempPath, this.options.persistenceFilePath);
  }
}
