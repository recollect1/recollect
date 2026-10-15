"""Energy VAD on synthetic recordings with known speech and pauses (§7.3)."""

import wave

import numpy as np

from markers.graph import timing_markers
from markers.vad import duration_s, read_wav, voiced_intervals

RATE = 16_000


def tone(seconds: float, amp: float = 0.3) -> np.ndarray:
    t = np.arange(int(RATE * seconds)) / RATE
    # A rough voice: two harmonics with a slow amplitude wobble.
    return (amp * (np.sin(2 * np.pi * 180 * t) + 0.5 * np.sin(2 * np.pi * 360 * t)) * (0.8 + 0.2 * np.sin(2 * np.pi * 3 * t))).astype(np.float32)


def quiet(seconds: float, rng: np.random.Generator) -> np.ndarray:
    return (rng.normal(0, 0.003, int(RATE * seconds))).astype(np.float32)


def recording(parts: list[tuple[str, float]]) -> np.ndarray:
    rng = np.random.default_rng(1)
    return np.concatenate([tone(s) if kind == "speech" else quiet(s, rng) for kind, s in parts])


def test_finds_speech_and_pauses():
    audio = recording([("pause", 0.5), ("speech", 3.0), ("pause", 1.0), ("speech", 2.0), ("pause", 2.5), ("speech", 1.5), ("pause", 0.3)])
    voiced = voiced_intervals(audio, RATE)
    assert len(voiced) == 3
    assert abs(voiced[0][0] - 0.5) < 0.1 and abs(voiced[0][1] - 3.5) < 0.1
    gaps = [b[0] - a[1] for a, b in zip(voiced, voiced[1:])]
    assert abs(gaps[0] - 1.0) < 0.12 and abs(gaps[1] - 2.5) < 0.12
    m = timing_markers(voiced, duration_s(audio, RATE), word_count=20)
    assert m is not None
    assert m["long_pause_rate"] > 0  # the 2.5 s pause
    assert abs(m["phonation_ratio"] - 6.5 / 10.8) < 0.03


def test_short_dips_inside_speech_are_not_pauses():
    audio = recording([("speech", 1.0), ("pause", 0.1), ("speech", 1.0)])
    assert len(voiced_intervals(audio, RATE)) == 1


def test_silence_has_no_speech():
    rng = np.random.default_rng(2)
    assert voiced_intervals(quiet(3.0, rng), RATE) == []


def test_reads_16_bit_wav(tmp_path):
    audio = recording([("speech", 1.0), ("pause", 0.6), ("speech", 1.0)])
    path = tmp_path / "s.wav"
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
    samples, rate = read_wav(path)
    assert rate == RATE and abs(len(samples) / rate - 2.6) < 0.01
    assert len(voiced_intervals(samples, rate)) == 2
