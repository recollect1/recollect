"""The doctor report: required lines, simulated banner, and nothing from the banned list."""

import re

import pytest

from common import phrases
from synth.generate import generate
from trends import report as report_module
from trends.detect import analyse, trend_card
from trends.report import build_report

CONSENT = {"byElderAt": "2026-07-18T05:30:00.000Z", "byFamilyAt": "2026-07-18T05:35:00.000Z"}
CREATED = "2026-10-12T04:30:00Z"


def make(history):
    analysis = analyse(history["markerSets"], history["daily"])
    card = trend_card(analysis, "p-gurdev", "Gurdev", CREATED)
    return analysis, card, build_report(analysis, card, "Gurdev", history["daily"], CONSENT, CREATED)


def test_report_carries_every_required_part():
    analysis, card, html = make(generate())
    text = re.sub(r"<style>.*?</style>|<[^>]+>", " ", html, flags=re.S)
    assert text.count(phrases.NOT_MEDICAL) >= 2
    assert "Simulated data" in text
    assert card["say"] in html or card["say"].replace("'", "&#x27;") in html
    assert "2026-07-18" in text  # consent dates
    assert f"{analysis.sessions}" in text and "scheduled tablets marked as taken" in text
    assert html.count("<svg") == len(analysis.series)  # one chart per marker
    assert html.count("Outside their usual range for") == len(analysis.flagged) == 4
    assert phrases.find_banned(text) == []


def test_real_data_gets_no_simulated_banner():
    history = generate()
    for m in history["markerSets"]:
        m["simulated"] = False
    _, _, html = make(history)
    assert "Simulated data" not in html


def test_a_banned_phrase_stops_the_report(monkeypatch):
    history = generate()
    analysis = analyse(history["markerSets"], history["daily"])
    card = trend_card(analysis, "p-gurdev", "Gurdev", CREATED)
    monkeypatch.setitem(report_module.phrases.METRICS["mattr"], "label", "Risk score for vocabulary")
    with pytest.raises(ValueError):
        build_report(analysis, card, "Gurdev", history["daily"], CONSENT, CREATED)
