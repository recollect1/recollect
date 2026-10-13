"""Text markers (CLAUDE.md §7.1), computed from the person's own utterances in one session.

Plain Python, no NLP dependency. Parts of speech come from closed word lists plus a few suffix
rules; any other word counts as a noun. That is crude, but it is applied the same way to every
session, and each marker is only ever compared with the same person's earlier sessions.
"""

from __future__ import annotations

import re

MIN_WORDS = 50
MATTR_WINDOW = 50

VAGUE_WORDS = {"thing", "things", "stuff", "something", "whatsit"}
VAGUE_PHRASES = ("that one", "you know")
SELF_CORRECTIONS = ("no, i mean", "no i mean", "i mean", "what's it called", "what is it called",
                    "what do you call it")

PRONOUNS = set("i me my mine myself you your yours yourself he him his himself she her hers herself it "
               "its itself we us our ours ourselves they them their theirs themselves this that these "
               "those who whom whose which what someone somebody something anyone anybody anything "
               "everyone everybody everything nobody nothing one".split())
DETERMINERS = set("a an the some any each every no all both either neither much many few several".split())
PREPOSITIONS = set("in on at by for with about against between into through during before after above "
                   "below to from up down out off over under near behind beside of without within "
                   "along across around inside outside until since like".split())
CONJUNCTIONS = set("and but or nor so yet because although though while when if unless whereas "
                   "than as whether".split())
AUXILIARIES = set("am is are was were be been being have has had do does did will would shall should "
                  "can could may might must".split())
ADVERBS = set("not never always often very too also just still again then there here now soon so "
              "really quite almost once twice away back together slowly".split())
VERBS = set("go goes went gone come comes came get gets got make makes made take takes took see sees "
            "saw say says said tell tells told know knows knew think thinks thought give gives gave "
            "put puts keep keeps kept hold holds held eat eats ate cook cooks run runs ran sit sits "
            "sat let lets bring brings brought buy buys bought fill fills cut cuts drop drops pull "
            "pulls ride rides teach teaches taught join joins write writes wrote draw draws drew "
            "listen listens sleep sleeps slept learn learns smell smells live lives want wants like "
            "likes love loves remember remembers forget forgets call calls ask asks open opens".split())
ADJECTIVES = set("old new big small little long short good bad first last whole same other young "
                 "rough loud brown white black red green hot cold sweet happy sad fresh early late".split())
_ADJ_SUFFIX = ("ous", "ful", "ive", "able", "ible", "less", "ish")


def words_of(text: str) -> list[str]:
    return re.findall(r"[a-z]+(?:'[a-z]+)?", text.lower())


def tag(word: str) -> str:
    """One of: pronoun, determiner, preposition, conjunction, aux, adverb, verb, adjective, noun."""
    for name, group in (("pronoun", PRONOUNS), ("determiner", DETERMINERS), ("preposition", PREPOSITIONS),
                        ("conjunction", CONJUNCTIONS), ("aux", AUXILIARIES), ("adverb", ADVERBS),
                        ("verb", VERBS), ("adjective", ADJECTIVES)):
        if word in group:
            return name
    if len(word) > 4 and word.endswith("ly"):
        return "adverb"
    if len(word) > 4 and word.endswith(("ing", "ed")):
        return "verb"
    if len(word) > 5 and word.endswith(_ADJ_SUFFIX):
        return "adjective"
    return "noun"


def mattr(words: list[str], window: int = MATTR_WINDOW) -> float:
    """Moving-average type-token ratio: mean share of distinct words over every window."""
    if len(words) <= window:
        return len(set(words)) / len(words)
    ratios = [len(set(words[i:i + window])) / window for i in range(len(words) - window + 1)]
    return sum(ratios) / len(ratios)


def _count_phrases(text: str, phrases: tuple[str, ...]) -> int:
    """Occurrences of the phrases, longest first, each stretch of text counted once."""
    remaining = text
    total = 0
    for phrase in sorted(phrases, key=len, reverse=True):
        pattern = r"(?<![a-z])" + re.escape(phrase) + r"(?![a-z])"
        total += len(re.findall(pattern, remaining))
        remaining = re.sub(pattern, " ", remaining)
    return total


def text_markers(utterances: list[str]) -> dict[str, float] | None:
    """The §7.1 markers for one session, or None when it has under 50 words."""
    utterances = [u for u in utterances if words_of(u)]
    words = [w for u in utterances for w in words_of(u)]
    if len(words) < MIN_WORDS:
        return None
    n = len(words)
    lowered = " ".join(u.lower() for u in utterances)
    tags = [tag(w) for w in words]
    count = tags.count
    vague = sum(1 for w in words if w in VAGUE_WORDS) + _count_phrases(lowered, VAGUE_PHRASES)
    propositions = count("verb") + count("adjective") + count("adverb") + count("preposition") + count("conjunction")
    return {
        "mattr": round(mattr(words), 4),
        "vague_rate": round(vague / n * 100, 4),
        "pronoun_noun_ratio": round(count("pronoun") / max(1, count("noun")), 4),
        "mean_utt_len": round(n / len(utterances), 4),
        "idea_density": round(propositions / n * 10, 4),
        "self_corrections": round(_count_phrases(lowered, SELF_CORRECTIONS) / n * 100, 4),
    }
