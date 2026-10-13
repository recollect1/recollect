import { onnxSessionOptions } from "./embed.ts";

// Relevance check for recall (§11). A small local cross-encoder (MiniLM-class ONNX, the same
// library as the embedder) scores "does this passage answer this question". It is a classifier,
// not a generative model: it picks among stored quotes and can only cause a refusal, never text.
/** Scores aligned (question, passage) pairs in one forward pass. Higher = the passage answers the question. */
export interface Reranker { score(questions: string[], passages: string[]): Promise<number[]> }

export const RERANK_MODEL = "Xenova/ms-marco-MiniLM-L-6-v2";

export async function createReranker(): Promise<Reranker> {
  const { AutoModelForSequenceClassification, AutoTokenizer } = await import("@huggingface/transformers");
  const tokenizer = await AutoTokenizer.from_pretrained(RERANK_MODEL);
  const model = await AutoModelForSequenceClassification.from_pretrained(RERANK_MODEL, {
    dtype: "q8", session_options: onnxSessionOptions(),
  });
  const reranker: Reranker = {
    score: async (questions, passages) => {
      if (!passages.length) return [];
      const inputs = tokenizer(questions, { text_pair: passages, padding: true, truncation: true });
      const { logits } = await model(inputs);
      return Array.from(logits.data as Float32Array);
    },
  };
  await reranker.score(["warm up"], ["warm up"]);
  return reranker;
}

const STOP = new Set(("a an and are as at be been by did do does for from had has have he her him his how i in is it " +
  "its me my of on or our she that the their them there they this to was we were what when where which who why " +
  "will with would you your about tell like").split(" "));

/** Word-overlap stand-in on the cross-encoder's logit scale, for unit tests that run offline. */
export class LexicalReranker implements Reranker {
  private words = (t: string) => new Set((t.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !STOP.has(w)));
  async score(questions: string[], passages: string[]): Promise<number[]> {
    return passages.map((p, i) => {
      const q = this.words(questions[i] ?? "");
      const words = this.words(p);
      let shared = 0;
      for (const w of q) if (words.has(w)) shared++;
      return shared ? 5 * shared - 6 : -10;
    });
  }
}
