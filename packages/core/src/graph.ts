// Small property-graph port used by all of core. Two adapters:
//   MemoryGraph  — in-process, for tests, the recall eval and Docker-less local dev
//   FalkorGraph  — FalkorDB over Cypher (production, docker-compose)
// Labels and edge types are code constants, never user input; they are still checked before
// being placed in a Cypher string.
import { readFileSync } from "node:fs";
import { FalkorDB } from "falkordb";

export type Props = { id: string } & Record<string, unknown>;
export type Ref = [label: string, id: string];
export type Scalar = string | number | boolean;
export interface Neighbour<T> { node: T; label: string; edge: Record<string, unknown> }

export interface Graph {
  /** Create or merge a node by id. */
  upsert(label: string, props: Props): Promise<void>;
  get<T>(label: string, id: string): Promise<T | null>;
  find<T>(label: string, where?: Record<string, Scalar>): Promise<T[]>;
  /** Nodes with from <= node[field] < to, ascending by field. */
  findRange<T>(label: string, field: string, from: Scalar, to: Scalar): Promise<T[]>;
  link(from: Ref, type: string, to: Ref, props?: Record<string, Scalar>): Promise<void>;
  out<T>(from: Ref, type: string): Promise<Neighbour<T>[]>;
  into<T>(to: Ref, type: string): Promise<Neighbour<T>[]>;
  remove(label: string, id: string): Promise<void>;
  /** "Delete everything" (§1.6). */
  clear(): Promise<void>;
  close(): Promise<void>;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
function safe(name: string): string {
  if (!NAME.test(name)) throw new Error(`unsafe graph identifier: ${name}`);
  return name;
}

export class MemoryGraph implements Graph {
  private nodes = new Map<string, Map<string, Props>>();
  private edges: { from: Ref; type: string; to: Ref; props: Record<string, unknown> }[] = [];

  private table(label: string): Map<string, Props> {
    let t = this.nodes.get(safe(label));
    if (!t) this.nodes.set(label, (t = new Map()));
    return t;
  }
  async upsert(label: string, props: Props): Promise<void> {
    const t = this.table(label);
    t.set(props.id, { ...(t.get(props.id) ?? {}), ...structuredClone(props) });
  }
  async get<T>(label: string, id: string): Promise<T | null> {
    const n = this.table(label).get(id);
    return n ? (structuredClone(n) as T) : null;
  }
  async find<T>(label: string, where: Record<string, Scalar> = {}): Promise<T[]> {
    const keys = Object.keys(where);
    return [...this.table(label).values()]
      .filter((n) => keys.every((k) => n[k] === where[k]))
      .map((n) => structuredClone(n) as T);
  }
  async findRange<T>(label: string, field: string, from: Scalar, to: Scalar): Promise<T[]> {
    return [...this.table(label).values()]
      .filter((n) => (n[field] as Scalar) >= from && (n[field] as Scalar) < to)
      .sort((a, b) => ((a[field] as Scalar) < (b[field] as Scalar) ? -1 : 1))
      .map((n) => structuredClone(n) as T);
  }
  async link(from: Ref, type: string, to: Ref, props: Record<string, Scalar> = {}): Promise<void> {
    safe(type);
    const existing = this.edges.find((e) =>
      e.type === type && e.from[0] === from[0] && e.from[1] === from[1] && e.to[0] === to[0] && e.to[1] === to[1]);
    if (existing) Object.assign(existing.props, props);
    else this.edges.push({ from, type, to, props: { ...props } });
  }
  async out<T>(from: Ref, type: string): Promise<Neighbour<T>[]> {
    return this.edges
      .filter((e) => e.type === type && e.from[0] === from[0] && e.from[1] === from[1])
      .flatMap((e) => {
        const node = this.table(e.to[0]).get(e.to[1]);
        return node ? [{ node: structuredClone(node) as T, label: e.to[0], edge: { ...e.props } }] : [];
      });
  }
  async into<T>(to: Ref, type: string): Promise<Neighbour<T>[]> {
    return this.edges
      .filter((e) => e.type === type && e.to[0] === to[0] && e.to[1] === to[1])
      .flatMap((e) => {
        const node = this.table(e.from[0]).get(e.from[1]);
        return node ? [{ node: structuredClone(node) as T, label: e.from[0], edge: { ...e.props } }] : [];
      });
  }
  async remove(label: string, id: string): Promise<void> {
    this.table(label).delete(id);
    this.edges = this.edges.filter((e) =>
      !(e.from[0] === label && e.from[1] === id) && !(e.to[0] === label && e.to[1] === id));
  }
  async clear(): Promise<void> { this.nodes.clear(); this.edges = []; }
  async close(): Promise<void> {}
}

interface FalkorNode { labels: string[]; properties: Props }
type Params = Record<string, Scalar | null | (Scalar | null)[]>;

export class FalkorGraph implements Graph {
  private constructor(private db: FalkorDB, private g: ReturnType<FalkorDB["selectGraph"]>) {}

  static async connect(url: string, graphName = "recollect"): Promise<FalkorGraph> {
    const db = await FalkorDB.connect({ url });
    const fg = new FalkorGraph(db, db.selectGraph(graphName));
    await fg.applySchema();
    return fg;
  }

  /** Runs schema.cypher; "already indexed" errors are expected on every boot after the first. */
  private async applySchema(): Promise<void> {
    const text = readFileSync(new URL("./schema.cypher", import.meta.url), "utf8");
    for (const stmt of text.split(";").map((s) => s.replace(/\/\/.*$/gm, "").trim()).filter(Boolean)) {
      try { await this.g.query(stmt); } catch (e) {
        if (!/already (indexed|exists)/i.test(String(e))) throw e;
      }
    }
  }

  async upsert(label: string, props: Props): Promise<void> {
    // FalkorDB stores scalars and arrays of scalars; embeddings go in as vecf32 for the vector index.
    const { id, embedding, ...rest } = props;
    const params: Params = { id };
    const sets: string[] = [];
    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined) continue;
      sets.push(`n.${safe(k)} = $p_${k}`);
      params[`p_${k}`] = v as Scalar;
    }
    if (embedding) { sets.push("n.embedding = vecf32($embedding)"); params.embedding = embedding as number[]; }
    await this.g.query(
      `MERGE (n:${safe(label)} {id: $id})${sets.length ? ` SET ${sets.join(", ")}` : ""}`, { params });
  }
  async get<T>(label: string, id: string): Promise<T | null> {
    const r = await this.g.roQuery<{ n: FalkorNode }>(
      `MATCH (n:${safe(label)} {id: $id}) RETURN n`, { params: { id } });
    return (r.data?.[0]?.n.properties as T | undefined) ?? null;
  }
  async find<T>(label: string, where: Record<string, Scalar> = {}): Promise<T[]> {
    const cond = Object.keys(where).map((k) => `n.${safe(k)} = $${k}`).join(" AND ");
    const r = await this.g.roQuery<{ n: FalkorNode }>(
      `MATCH (n:${safe(label)})${cond ? ` WHERE ${cond}` : ""} RETURN n`, { params: where });
    return (r.data ?? []).map((row) => row.n.properties as T);
  }
  async findRange<T>(label: string, field: string, from: Scalar, to: Scalar): Promise<T[]> {
    const f = safe(field);
    const r = await this.g.roQuery<{ n: FalkorNode }>(
      `MATCH (n:${safe(label)}) WHERE n.${f} >= $from AND n.${f} < $to RETURN n ORDER BY n.${f}`,
      { params: { from, to } });
    return (r.data ?? []).map((row) => row.n.properties as T);
  }
  async link(from: Ref, type: string, to: Ref, props: Record<string, Scalar> = {}): Promise<void> {
    const sets = Object.keys(props).map((k) => `r.${safe(k)} = $p_${k}`);
    const params: Params = { a: from[1], b: to[1] };
    for (const [k, v] of Object.entries(props)) params[`p_${k}`] = v;
    await this.g.query(
      `MATCH (a:${safe(from[0])} {id: $a}), (b:${safe(to[0])} {id: $b}) MERGE (a)-[r:${safe(type)}]->(b)` +
      (sets.length ? ` SET ${sets.join(", ")}` : ""), { params });
  }
  private async neighbours<T>(pattern: string, id: string): Promise<Neighbour<T>[]> {
    const r = await this.g.roQuery<{ m: FalkorNode; r: { properties: Record<string, unknown> } }>(
      `MATCH ${pattern} RETURN m, r`, { params: { id } });
    return (r.data ?? []).map((row) => ({
      node: row.m.properties as T, label: row.m.labels[0] ?? "", edge: row.r.properties ?? {},
    }));
  }
  out<T>(from: Ref, type: string): Promise<Neighbour<T>[]> {
    return this.neighbours(`(:${safe(from[0])} {id: $id})-[r:${safe(type)}]->(m)`, from[1]);
  }
  into<T>(to: Ref, type: string): Promise<Neighbour<T>[]> {
    return this.neighbours(`(m)-[r:${safe(type)}]->(:${safe(to[0])} {id: $id})`, to[1]);
  }
  async remove(label: string, id: string): Promise<void> {
    await this.g.query(`MATCH (n:${safe(label)} {id: $id}) DELETE n`, { params: { id } });
  }
  async clear(): Promise<void> { await this.g.query("MATCH (n) DELETE n"); }
  async close(): Promise<void> { await this.db.close(); }
}

/** FALKORDB_URL set -> FalkorDB; empty -> in-memory graph (local dev and tests only). */
export async function openGraph(url = process.env.FALKORDB_URL): Promise<Graph> {
  return url ? FalkorGraph.connect(url) : new MemoryGraph();
}
