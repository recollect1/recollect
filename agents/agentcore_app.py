"""The extract agent as an Amazon Bedrock AgentCore Runtime agent (CLAUDE.md §3, §9.1).

AgentCore calls POST /invocations with {"quote": "...", "known_names": [...]}. The Strands agent
(Bedrock) proposes entities and relations; `extract.validate` drops anything whose span is not in
the quote before the answer leaves the runtime. The worker calls this through
`InvokeAgentRuntime` when AGENTCORE_RUNTIME_ARN is set (see extract/agentcore.py).

Local run: `uv run python agentcore_app.py` (serves :8080, needs Bedrock access).
"""

from __future__ import annotations

from typing import Any

from bedrock_agentcore.runtime import BedrockAgentCoreApp

from extract.agent import Extractor, extractor_from_env
from extract.validate import validate

app = BedrockAgentCoreApp()
_extractor: Extractor | None = None


def extractor() -> Extractor:
    global _extractor
    if _extractor is None:
        _extractor = extractor_from_env()
        if _extractor is None:
            raise RuntimeError("BEDROCK_EXTRACT_MODEL_ID is not set in the AgentCore runtime environment")
    return _extractor


@app.entrypoint
def invoke(payload: dict[str, Any]) -> dict[str, Any]:
    quote = str(payload.get("quote", ""))
    if not quote.strip():
        return {"entities": [], "relations": []}
    known = [str(n) for n in payload.get("known_names", [])][:80]
    kept = validate(quote, extractor().extract(quote, known))
    return {
        "entities": [{"kind": e.kind, "name": e.name, "span": e.span, "year": e.year} for e in kept.entities],
        "relations": [{"source": r.source, "target": r.target, "label": r.label} for r in kept.relations],
    }


if __name__ == "__main__":
    app.run()
