import { createHash } from "node:crypto";

export type KnowledgeKind = "fact" | "decision" | "episode" | "instruction" | "evidence";
export type KnowledgeStatus = "proposed" | "approved" | "superseded" | "disputed";
export interface KnowledgeRecord {
  id: string;
  kind: KnowledgeKind;
  content: string;
  sourceRefs: string[];
  status: KnowledgeStatus;
  authorId: string;
  updatedAt: string;
}
export type Change = { op: "put"; record: KnowledgeRecord } | { op: "delete"; id: string };
export interface ContextCommit {
  id: string;
  parents: string[];
  branch: string;
  authorId: string;
  message: string;
  changes: Change[];
  createdAt: string;
}
export interface CommitInput {
  branch: string;
  expectedHead: string;
  authorId: string;
  message: string;
  changes: Change[];
}
export interface SerializedRepository {
  commits: [string, ContextCommit][];
  snapshots: [string, [string, KnowledgeRecord][]][];
  branches: [string, string][];
}
const sha = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const copy = <T>(value: T): T => structuredClone(value);

export class ConflictError extends Error {
  readonly status = 409;
  constructor(message: string, readonly records: string[] = []) { super(message); }
}
export class Repository {
  readonly commits: Map<string, ContextCommit>;
  readonly snapshots: Map<string, Map<string, KnowledgeRecord>>;
  readonly branches: Map<string, string>;

  constructor(state?: SerializedRepository) {
    if (state) {
      this.commits = new Map(state.commits);
      this.snapshots = new Map(state.snapshots.map(([id, records]) => [id, new Map(records)]));
      this.branches = new Map(state.branches);
    } else {
      this.commits = new Map();
      this.snapshots = new Map();
      this.branches = new Map();
      const genesis = this.makeCommit([], "main", "system", "Initialize", []);
      this.commits.set(genesis.id, genesis);
      this.snapshots.set(genesis.id, new Map());
      this.branches.set("main", genesis.id);
    }
  }

  serialize(): SerializedRepository {
    return {
      commits: [...this.commits],
      snapshots: [...this.snapshots].map(([id, records]) => [id, [...records]]),
      branches: [...this.branches]
    };
  }
  private makeCommit(parents: string[], branch: string, authorId: string, message: string, changes: Change[]): ContextCommit {
    const body = { parents, branch, authorId, message, changes: copy(changes), createdAt: new Date().toISOString() };
    return { id: sha(body), ...body };
  }
  head(branch = "main"): string {
    const head = this.branches.get(branch);
    if (!head) throw new Error("Unknown branch");
    return head;
  }
  resolve(ref = "main"): string {
    const id = this.branches.get(ref) || ref;
    if (!this.commits.has(id)) throw new Error("Unknown revision");
    return id;
  }
  snapshot(ref = "main"): Map<string, KnowledgeRecord> {
    const records = this.snapshots.get(this.resolve(ref));
    if (!records) throw new Error("Unknown revision");
    return new Map([...records].map(([id, record]) => [id, copy(record)]));
  }
  branch(name: string, from = "main"): string {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.\/-]{0,119}$/.test(name) || name.includes("..") || this.branches.has(name)) {
      throw new Error("Invalid or existing branch");
    }
    const head = this.resolve(from);
    this.branches.set(name, head);
    return head;
  }
  commit({ branch = "main", expectedHead, authorId, message, changes }: CommitInput): ContextCommit {
    if (expectedHead !== this.head(branch)) throw new ConflictError("Branch head changed");
    if (!Array.isArray(changes) || changes.length > 500) throw new Error("Invalid changes");
    if (typeof authorId !== "string" || typeof message !== "string" || message.length > 2048) {
      throw new Error("Invalid author/message");
    }
    const snapshot = this.snapshot(branch);
    for (const change of changes) {
      if (change.op === "put") {
        const r = change.record;
        if (!r || typeof r.id !== "string" || !/^[\w.:-]{1,128}$/.test(r.id) ||
            typeof r.content !== "string" || r.content.length > 100000 ||
            !["fact", "decision", "episode", "instruction", "evidence"].includes(r.kind) ||
            !["proposed", "approved", "superseded", "disputed"].includes(r.status) ||
            !Array.isArray(r.sourceRefs) || typeof r.authorId !== "string" || typeof r.updatedAt !== "string") {
          throw new Error("Invalid knowledge record");
        }
        snapshot.set(r.id, copy(r));
      } else if (change.op === "delete" && typeof change.id === "string") {
        snapshot.delete(change.id);
      } else {
        throw new Error("Invalid change");
      }
    }
    const result = this.makeCommit([expectedHead], branch, authorId, message, changes);
    this.commits.set(result.id, result);
    this.snapshots.set(result.id, snapshot);
    this.branches.set(branch, result.id);
    return copy(result);
  }
  ancestors(ref: string): string[] {
    const todo = [this.resolve(ref)];
    const visited = new Set<string>();
    const ordered: string[] = [];
    while (todo.length) {
      const id = todo.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      ordered.push(id);
      todo.push(...(this.commits.get(id)?.parents || []));
    }
    return ordered;
  }
  merge(source: string, target: string, authorId: string): ContextCommit {
    const srcHead = this.head(source), dstHead = this.head(target);
    const targets = new Set(this.ancestors(dstHead));
    const base = this.ancestors(srcHead).find(id => targets.has(id));
    if (!base) throw new Error("No common ancestor");
    const old = this.snapshot(base), src = this.snapshot(srcHead), dst = this.snapshot(dstHead);
    const conflicts: string[] = [], changes: Change[] = [];
    for (const id of new Set([...old.keys(), ...src.keys(), ...dst.keys()])) {
      const o = old.get(id), s = src.get(id), d = dst.get(id);
      if (equal(o, s) || equal(d, s)) continue;
      if (!equal(o, d)) { conflicts.push(id); continue; }
      changes.push(s ? { op: "put", record: s } : { op: "delete", id });
    }
    if (conflicts.length) throw new ConflictError("Conflicting knowledge", conflicts);
    const next = this.snapshot(dstHead);
    for (const change of changes) {
      if (change.op === "put") next.set(change.record.id, copy(change.record));
      else next.delete(change.id);
    }
    const merged = this.makeCommit([dstHead, srcHead], target, authorId, "Merge " + source + " into " + target, changes);
    this.commits.set(merged.id, merged);
    this.snapshots.set(merged.id, next);
    this.branches.set(target, merged.id);
    return copy(merged);
  }
}
