// Local sentence embeddings (§3). Not an LLM: allowed inside tool handlers, warmed at boot.
export interface Embedder {
  embed(text: string): Promise<number[]>;
  /** Releases the ONNX session. onnxruntime-node aborts the process if one is live at exit (friction log 17). */
  dispose?(): Promise<void>;
}

export const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";

/**
 * ONNX Runtime defaults to one spinning thread per core. On a busy or small host those threads
 * fight each other and a 10 ms inference can take seconds, so the pool is kept small and
 * spinning is off. Both models are tiny; two threads is enough.
 */
export const onnxSessionOptions = () => ({
  intraOpNumThreads: Number(process.env.ONNX_THREADS ?? 2), interOpNumThreads: 1,
  extra: { session: { intra_op: { allow_spinning: "0" } } },
});

export async function createEmbedder(): Promise<Embedder> {
  const { pipeline } = await import("@huggingface/transformers");
  const pipe = await pipeline("feature-extraction", EMBED_MODEL, { dtype: "q8", session_options: onnxSessionOptions() });
  const embedder: Embedder = {
    embed: async (text) => Array.from((await pipe(text, { pooling: "mean", normalize: true })).data as Float32Array),
    dispose: () => pipe.dispose(),
  };
  await embedder.embed("warm up");
  return embedder;
}

/** Deterministic bag-of-words embedder for unit tests that must run offline. Not used in the demo path. */
export class HashEmbedder implements Embedder {
  constructor(private dim = 256) {}
  async embed(text: string): Promise<number[]> {
    const v = new Array<number>(this.dim).fill(0);
    for (const w of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
      let h = 2166136261;
      for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 16777619);
      const slot = (h >>> 0) % this.dim;
      v[slot] = (v[slot] ?? 0) + 1;
    }
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  }
}

/** Cosine similarity; inputs from our embedders are already unit length. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}
