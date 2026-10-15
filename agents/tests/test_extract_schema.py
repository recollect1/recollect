"""The extraction schema tolerates a model that answers "nothing found" with null."""

from extract.agent import ExtractionOut


def test_null_lists_mean_nothing_found():
    out = ExtractionOut(entities=None, relations=None)
    assert out.entities == [] and out.relations == []


def test_lists_still_validate():
    out = ExtractionOut(entities=[{"kind": "place", "name": "Patiala", "span": "Patiala"}], relations=[])
    assert out.entities[0].name == "Patiala"
