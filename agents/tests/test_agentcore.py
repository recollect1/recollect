"""The AgentCore entrypoint validates before answering (§9.1), tested with a scripted extractor."""

import agentcore_app
from extract.validate import Extraction, Proposed, Relation


class Scripted:
    name = "test"

    def extract(self, quote, known):
        return Extraction(
            [Proposed("place", "Patiala", "Patiala"), Proposed("place", "Lord's", "Lord's")],
            [Relation("Patiala", "Lord's", "near")],
        )


def test_entrypoint_returns_only_validated_entities(monkeypatch):
    monkeypatch.setattr(agentcore_app, "_extractor", Scripted())
    out = agentcore_app.invoke({"quote": "I came to Patiala in 1966.", "known_names": ["Patiala"]})
    assert [e["name"] for e in out["entities"]] == ["Patiala"]
    assert out["relations"] == []


def test_empty_quote():
    assert agentcore_app.invoke({"quote": "  "}) == {"entities": [], "relations": []}
