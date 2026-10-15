"""Voice-activity detection for timing markers (CLAUDE.md §7.3), energy based, numpy only.

Input is the consented story-mode recording (16 kHz mono WAV). Output is a list of voiced
intervals in seconds, which `markers.graph.timing_markers` turns into pause and speech-rate
numbers. The worker deletes the audio right after this runs; only the numbers are kept.
"""

from __future__ import annotations

import wave
from pathlib import Path

import numpy as np

FRAME_S = 0.03          # 30 ms frames
MIN_VOICED_S = 0.12     # shorter bursts are clicks, not speech
BRIDGE_S = 0.2          # gaps shorter than this are inside a word, not pauses


def read_wav(path: str | Path) -> tuple[np.ndarray, int]:
    """16-bit PCM WAV → mono float32 in [-1, 1] and the sample rate."""
    with wave.open(str(path), "rb") as w:
        if w.getsampwidth() != 2:
            raise ValueError("expected 16-bit PCM audio")
        rate, channels = w.getframerate(), w.getnchannels()
        data = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    return data, rate


def voiced_intervals(samples: np.ndarray, rate: int) -> list[tuple[float, float]]:
    """Voiced (start, end) seconds. The threshold adapts to the recording's own noise floor."""
    frame = max(1, int(rate * FRAME_S))
    n = len(samples) // frame
    if n == 0:
        return []
    frames = samples[: n * frame].reshape(n, frame)
    rms = np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1))
    noise = float(np.percentile(rms, 10))
    loud = float(np.percentile(rms, 90))
    if loud <= max(noise * 1.5, 1e-4):
        return []  # silence or flat noise: nothing that looks like speech
    threshold = noise + 0.25 * (loud - noise)
    voiced = rms > threshold

    intervals: list[tuple[float, float]] = []
    start = None
    for i, v in enumerate(voiced):
        if v and start is None:
            start = i
        elif not v and start is not None:
            intervals.append((start * FRAME_S, i * FRAME_S))
            start = None
    if start is not None:
        intervals.append((start * FRAME_S, n * FRAME_S))

    merged: list[tuple[float, float]] = []
    for s, e in intervals:
        if merged and s - merged[-1][1] < BRIDGE_S:
            merged[-1] = (merged[-1][0], e)
        else:
            merged.append((s, e))
    return [(round(s, 3), round(e, 3)) for s, e in merged if e - s >= MIN_VOICED_S]


def duration_s(samples: np.ndarray, rate: int) -> float:
    return len(samples) / rate if rate else 0.0
