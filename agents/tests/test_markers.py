"""§15 marker tests: hand-made transcripts with known values."""

from markers.graph import (KnownEntity, count_references, named_recall, new_entity_rate, orientation,
                           retell_rate, timing_markers)
from markers.text import mattr, tag, text_markers, words_of


def test_sessions_under_fifty_words_are_skipped():
    assert text_markers(["I went to the well."] * 9) is None  # 45 words
    assert text_markers(["I went to the well."] * 10) is not None  # 50 words


def test_vague_rate_five_vague_words_in_a_hundred():
    filler = "we walked to the market early and bought fresh milk"  # 10 words, none vague
    utterances = [filler] * 9 + ["I lost the thing and the stuff near that one", "you know"]
    # 90 + 10 + 2 = 102 words; make it exactly 100 by trimming two filler words
    utterances[0] = "we walked to the market early and bought"
    words = [w for u in utterances for w in words_of(u)]
    assert len(words) == 100
    # thing, stuff, "that one", "you know" = 4, plus one more below
    utterances[1] = "we walked to the market early and bought fresh something"
    assert text_markers(utterances)["vague_rate"] == 5.0


def test_mattr_extremes_and_window():
    distinct = [f"w{i}" for i in range(80)]
    assert mattr(distinct) == 1.0
    assert mattr(["same"] * 80) == 1 / 50
    # 25 distinct words repeated: every 50-word window holds exactly 25 types
    assert mattr([f"w{i % 25}" for i in range(120)]) == 0.5
    assert mattr(["a", "b", "a", "b"]) == 0.5  # shorter than the window: plain type-token ratio


def test_mean_utterance_length_and_self_corrections():
    utterances = ["one two three four five six seven eight nine ten"] * 5 + [
        "it was in the no, I mean the kitchen what's it called the tin tin tin tin tin tin tin tin tin tin tin tin"]
    m = text_markers(utterances)
    words = sum(len(words_of(u)) for u in utterances)
    assert m["mean_utt_len"] == round(words / 6, 4)
    assert m["self_corrections"] == round(2 / words * 100, 4)  # "no, I mean" counts once, not twice


def test_parts_of_speech_and_ratios():
    assert [tag(w) for w in ["she", "cooked", "slowly", "in", "kitchen", "and", "famous", "was"]] == [
        "pronoun", "verb", "adverb", "preposition", "noun", "conjunction", "adjective", "aux"]
    # 10 words: pronouns she, it; nouns kitchen, mother; verbs cooked, made; adverb slowly;
    # preposition in; conjunction and; determiner the
    sentence = "she cooked it slowly in the kitchen and mother made"
    m = text_markers([sentence] * 5)
    assert m["pronoun_noun_ratio"] == 1.0
    assert m["idea_density"] == 5.0
    assert m["mean_utt_len"] == 10.0


KNOWN = [
    KnownEntity("Aman", relation_phrases=("my grandson", "my son's boy")),
    KnownEntity("Simran", relation_phrases=("my daughter-in-law",)),
    KnownEntity("Patiala"),
]


def test_named_recall_counts_names_against_vague_references():
    assert count_references("Aman called from London and Simran made tea in Patiala.", KNOWN) == (3, 0)
    assert count_references("My son's boy called, and that woman made tea. Aman laughed.", KNOWN) == (1, 2)
    assert named_recall(3, 0) == 1.0
    assert named_recall(1, 2) == 0.3333
    assert named_recall(0, 0) is None


def test_retell_and_new_entity_rates():
    assert retell_rate([True, False, False, True, False]) == 0.4
    assert retell_rate([]) is None
    assert new_entity_rate(9, 4) == 2.25
    assert new_entity_rate(3, 0) is None


def test_orientation_counts_and_evening_share():
    asks = [("whats_today", 9), ("where_is", 17), ("where_is", 18), ("check_dose", 21),
            ("who_is", 3), ("recall", 17), ("where_is", 22)]
    assert orientation(asks) == {"orientation_asks": 6.0, "evening_orientation_share": 0.5, "night_asks": 1}
    assert orientation(asks, days=2)["orientation_asks"] == 3.0
    assert orientation([])["evening_orientation_share"] is None


def test_timing_markers_from_voiced_intervals():
    # 60 s recording: speech 0–10, 10.3–20 (0.3 s gap: not a pause), 21–30 (1 s), 33–40 (3 s: long)
    voiced = [(0, 10), (10.3, 20), (21, 30), (33, 40)]
    m = timing_markers(voiced, total_s=60, word_count=70)
    voiced_min = (10 + 9.7 + 9 + 7) / 60
    assert m["pause_rate"] == round(2 / voiced_min, 4)
    assert m["mean_pause_s"] == 2.0
    assert m["long_pause_rate"] == round(1 / voiced_min, 4)
    assert m["speech_rate_wpm"] == round(70 / voiced_min, 4)
    assert m["phonation_ratio"] == round(35.7 / 60, 4)
    assert timing_markers([], 60, 10) is None
