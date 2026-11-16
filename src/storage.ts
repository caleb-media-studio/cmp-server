import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Repository, type SerializedRepository } from "./repository.js";

export interface ContextEvent {
  v: 1;
  id: string;
  type: "event";
  method: string;
  params: { repo: string; event: string; head: string };
  cursor: string;
  eventId: string;
}
interface Row { id: string; state: string }
interface EventRow { seq: number; name: string; payload: string }
export class Store {
  readonly db: DatabaseSync;
  readonly repos = new Map<string, Repository>();
  constructor(path = ":memory:") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS repos (id TEXT PRIMARY KEY, state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, repo TEXT NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS events_by_repo ON events(repo,seq);");
    for (const item of this.db.prepare("SELECT id,state FROM repos").all() as unknown as Row[]) {
      this.repos.set(item.id, new Repository(JSON.parse(item.state) as SerializedRepository));
    }
  }
  list(): string[] { return [...this.repos.keys()]; }
  get(id: string): Repository | undefined { return this.repos.get(id); }
  create(id: string): Repository {
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(id) || this.repos.has(id)) throw new Error("Invalid or existing repository");
    const repo = new Repository();
    this.db.prepare("INSERT INTO repos (id,state) VALUES (?,?)").run(id, JSON.stringify(repo.serialize()));
    this.repos.set(id, repo);
    return repo;
  }
  mutate<T>(id: string, action: (repository: Repository) => T, eventName = "context.updated"): { result: T; event: ContextEvent } {
    const live = this.get(id);
    if (!live) throw new Error("Unknown repository");
    const clone = new Repository(live.serialize());
    const result = action(clone);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("UPDATE repos SET state=? WHERE id=?").run(JSON.stringify(clone.serialize()), id);
      const payload = { repo: id, event: eventName, head: clone.head() };
      const row = this.db.prepare("INSERT INTO events(repo,name,payload,created_at) VALUES (?,?,?,?)")
        .run(id, eventName, JSON.stringify(payload), new Date().toISOString());
      this.db.exec("COMMIT");
      this.repos.set(id, clone);
      const sequence = String(row.lastInsertRowid);
      return { result, event: {
        v: 1, id: "evt-" + sequence, type: "event", method: eventName,
        params: payload, cursor: sequence, eventId: "evt-" + sequence
      } };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  eventsAfter(repo: string, cursor = "0", limit = 1000): ContextEvent[] {
    if (!/^\d+$/.test(cursor)) throw new Error("Invalid cursor");
    const rows = this.db.prepare("SELECT seq,name,payload FROM events WHERE repo=? AND seq>? ORDER BY seq LIMIT ?")
      .all(repo, Number(cursor), Math.min(limit, 1000)) as unknown as EventRow[];
    return rows.map(row => ({
      v: 1, id: "evt-" + row.seq, type: "event", method: row.name,
      params: JSON.parse(row.payload) as ContextEvent["params"],
      cursor: String(row.seq), eventId: "evt-" + row.seq
    }));
  }
  close(): void { this.db.close(); }
}
