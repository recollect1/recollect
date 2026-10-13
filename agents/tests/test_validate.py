"""§15: every stored span is a substring of its quote; orphan relations never survive."""

import random

from extract.validate import Extraction, Known, Proposed, Relation, edit_distance, resolve, validate

QUOTE = "My father came to visit us in Patiala in 1968 and he brought a radio."


def test_keeps_only_entities_whose_span_is_in_the_quote():
    out = validate(
        QUOTE,
        Extraction(
            [
                Proposed("person", "father", "My father"),
                Proposed("place", "Patiala", "Patiala"),
                Proposed("thing", "radio", "a radio", 1968),
                Proposed("place", "Amritsar", "Amritsar"),  # not said
                Proposed("person", "father", "my father"),  # wrong case: not an exact span
                Proposed("animal", "dog", "radio"),  # unknown kind
                Proposed("thing", "", "radio"),  # no name
            ]
        ),
    )
    assert [e.name for e in out.entities] == ["father", "Patiala", "radio"]
    assert all(e.span in QUOTE for e in out.entities)


def test_drops_duplicates_and_orphan_relations():
    out = validate(
        QUOTE,
        Extraction(
            [
                Proposed("person", "father", "My father"),
                Proposed("person", "Father", "My father"),
                Proposed("thing", "radio", "a radio"),
                Proposed("place", "Amritsar", "Amritsar"),
            ],
            [
                Relation("father", "radio", "brought"),
                Relation("father", "Amritsar", "lived in"),  # Amritsar was dropped
                Relation("radio", "radio", "is"),  # self-loop
                Relation("father", "radio", " "),  # no label
            ],
        ),
    )
    assert len(out.entities) == 2
    assert out.relations == [Relation("father", "radio", "brought")]


def test_property_every_surviving_span_is_a_substring():
    rng = random.Random(7)
    words = QUOTE.replace(".", "").split()
    for _ in range(500):
        proposed = []
        for _ in range(rng.randint(0, 6)):
            if rng.random() < 0.5:
                i = rng.randrange(len(words))
                span = " ".join(words[i : i + rng.randint(1, 3)])
            else:
                span = "".join(rng.choice("abcdefgh ") for _ in range(rng.randint(0, 8)))
            proposed.append(Proposed(rng.choice(["person", "place", "event", "thing", "x"]), span or "n", span))
        relations = [
            Relation(rng.choice(proposed).name, rng.choice(proposed).name, "r") for _ in range(3) if proposed
        ]
        out = validate(QUOTE, Extraction(proposed, relations))
        names = {" ".join(e.name.lower().split()) for e in out.entities}
        assert all(e.span and e.span in QUOTE for e in out.entities)
        assert all(
            " ".join(r.source.lower().split()) in names and " ".join(r.target.lower().split()) in names
            for r in out.relations
        )


KNOWN = [
    Known("e-jagdish", "Jagdish", ("brother", "my brother")),
    Known("e-aman", "Aman", ("grandson",)),
    Known("e-patiala", "Patiala"),
    Known("e-qila", "Qila Mubarak", ("qila",)),
]


def test_resolves_by_name_alias_and_small_spelling_differences():
    assert resolve("jagdish", KNOWN).id == "e-jagdish"
    assert resolve("My Brother", KNOWN).id == "e-jagdish"
    assert resolve("Jagdeesh", KNOWN).id == "e-jagdish"  # two edits
    assert resolve("Patiyala", KNOWN).id == "e-patiala"  # one edit
    assert resolve("Kila Mubarak", KNOWN).id == "e-qila"


def test_does_not_merge_short_or_distant_names():
    assert resolve("Amar", KNOWN) is None  # one edit from Aman, but too short to guess
    assert resolve("Jagjit Singh", KNOWN) is None
    assert resolve("Ludhiana", KNOWN) is None


def test_edit_distance():
    assert edit_distance("jagdish", "jagdish") == 0
    assert edit_distance("jagdish", "jagdeesh") == 2
    assert edit_distance("patiala", "ludhiana") == 3  # cut off at limit + 1
