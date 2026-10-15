"""Extract agent, step 1 (CLAUDE.md §9.1): Strands Agent on Amazon Bedrock proposes entities.

The model only proposes. `extract.validate` decides what reaches the graph, so nothing here
needs to be trusted: a hallucinated name whose span is not in the quote is simply dropped.
"""

from __future__ import annotations

import os
from typing import Literal, Protocol

from pydantic import BaseModel, Field, field_validator
from strands import Agent
from strands.models.bedrock import BedrockModel

from extract.validate import Extraction, Proposed, Relation

SYSTEM = (
    "You read one sentence from an older person telling a story about their life, and list the "
    "people, places, events and things it names. Copy each `span` character for character from "
    "the sentence: the exact words used, never a paraphrase. Do not include the speaker, and do "
    "not include pronouns such as he, she, they or it. Give a `year` only when the sentence states "
    "one for that entity. An event is a named occasion such as a wedding, a visit or a festival, "
    "never a verb on its own; a year is only ever the `year` of an entity, never an entity itself. "
    "Relations use the entity names and a short snake_case label such as "
    "brother_of, lived_in, bought or located_in. If the sentence names nothing, return empty lists."
)


class ExtractedEntity(BaseModel):
    kind: Literal["person", "place", "event", "thing"]
    name: str = Field(description='Short canonical name, e.g. "Jagdish", "Patiala", "radio".')
    span: str = Field(description="The exact words in the sentence that name it, copied verbatim.")
    year: int | None = Field(default=None, description="Only if the sentence states a year for it.")


class ExtractedRelation(BaseModel):
    source: str = Field(description="Entity name")
    target: str = Field(description="Entity name")
    label: str = Field(description="snake_case, e.g. brother_of, lived_in")


class ExtractionOut(BaseModel):
    entities: list[ExtractedEntity] = Field(default_factory=list)
    relations: list[ExtractedRelation] = Field(default_factory=list)

    @field_validator("entities", "relations", mode="before")
    @classmethod
    def _null_is_empty(cls, value: object) -> object:
        # Some Bedrock models (Nova 2 Lite) return null for "nothing found" instead of [].
        return [] if value is None else value


class Extractor(Protocol):
    name: str

    def extract(self, quote: str, known_names: list[str]) -> Extraction: ...


class StrandsExtractor:
    """One Strands Agent call per quote, structured output, temperature 0."""

    def __init__(self, model_id: str, region: str | None = None) -> None:
        self.name = f"strands+bedrock:{model_id}"
        self._model = BedrockModel(
            model_id=model_id,
            region_name=region or os.environ.get("AWS_REGION", "us-east-1"),
            temperature=0.0,
            max_tokens=1200,
        )

    def extract(self, quote: str, known_names: list[str]) -> Extraction:
        # A fresh agent per quote: no conversation history leaks between sessions.
        agent = Agent(model=self._model, system_prompt=SYSTEM, callback_handler=None)
        known = ", ".join(known_names[:80]) or "none yet"
        prompt = (
            f"Names the family already uses (reuse them when the sentence means the same one): {known}\n\n"
            f"Sentence:\n{quote}"
        )
        out = agent.structured_output(ExtractionOut, prompt)
        return Extraction(
            [Proposed(e.kind, e.name, e.span, e.year) for e in out.entities],
            [Relation(r.source, r.target, r.label) for r in out.relations],
        )


def extractor_from_env() -> Extractor | None:
    """AgentCore Runtime when AGENTCORE_RUNTIME_ARN is set; else Strands on Bedrock directly; else none."""
    arn = os.environ.get("AGENTCORE_RUNTIME_ARN")
    if arn and os.environ.get("AGENTCORE_SELF") != "1":  # the runtime itself must not call itself
        from extract.agentcore import AgentCoreExtractor
        return AgentCoreExtractor(arn)
    model_id = os.environ.get("BEDROCK_EXTRACT_MODEL_ID")
    return StrandsExtractor(model_id) if model_id else None
