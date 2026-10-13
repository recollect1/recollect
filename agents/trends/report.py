"""Doctor report (CLAUDE.md §9.3 step 5): one printable HTML page with inline SVG charts.

Fixed wording only. No model writes or reorders anything here, and the finished page is checked
against the §1.2 banned list before it is returned.
"""

from __future__ import annotations

import re
from datetime import date
from html import escape

from common import phrases
from trends.detect import MONTHS, RUN_WEEKS, THRESHOLD_SD, Analysis, Series

# One series per chart, so one hue. Neutral band and muted axes keep the data in front.
LINE, SURFACE, BAND, INK, SECONDARY, MUTED, GRID = "#2a78d6", "#fcfcfb", "#f0efec", "#0b0b0b", "#52514e", "#898781", "#e4e3df"
W, H, LEFT, RIGHT, TOP, BOTTOM = 340, 150, 40, 46, 12, 24

CSS = f"""
body{{font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:{INK};background:#f9f9f7;margin:0}}
main{{max-width:1080px;margin:0 auto;padding:24px 16px 48px}}
h1{{font-size:26px;margin:0 0 4px}} h2{{font-size:18px;margin:32px 0 8px}} h3{{font-size:14px;margin:0;font-weight:600}}
p{{margin:6px 0}} .muted{{color:{SECONDARY}}} .small{{font-size:13px}}
.banner{{background:#fff4d6;border:1px solid #e0b84a;border-radius:8px;padding:10px 14px;font-weight:600;margin:16px 0}}
.notice{{border-left:4px solid {INK};padding:6px 12px;margin:16px 0;font-weight:600}}
.card{{background:{SURFACE};border:1px solid {GRID};border-radius:10px;padding:14px 16px;margin:12px 0}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}}
.chart{{background:{SURFACE};border:1px solid {GRID};border-radius:10px;padding:12px 12px 6px;break-inside:avoid}}
.chart svg{{width:100%;height:auto;display:block}}
.tag{{display:inline-block;border:1px solid {INK};border-radius:999px;padding:0 8px;font-size:12px;font-weight:600;margin-top:2px}}
.facts{{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}}
.fact b{{display:block;font-size:22px}}
table{{border-collapse:collapse;width:100%;font-size:13px}} th,td{{text-align:right;padding:3px 6px;border-bottom:1px solid {GRID}}}
th:first-child,td:first-child{{text-align:left}} .scroll{{overflow-x:auto}}
svg text{{font:11px system-ui,sans-serif;fill:{MUTED}}} svg text.value{{fill:{INK};font-weight:600}}
@media print{{body{{background:#fff}} .chart,.card{{border-color:#bbb}} details{{display:none}}}}
"""


def _fmt(value: float) -> str:
    return f"{value:.0f}" if abs(value) >= 100 else f"{value:.1f}" if abs(value) >= 10 else f"{value:.2f}"


def _short(day: date) -> str:
    return f"{day.day} {MONTHS[day.month - 1][:3]}"


def chart(series: Series, week_starts: list[date]) -> str:
    """One weekly line against the person's own baseline band (median ± 1.5 robust SD)."""
    meta = phrases.METRICS[series.metric]
    half = THRESHOLD_SD * series.sd
    values = [v for v in series.weekly if v is not None]
    low, high = min([*values, series.baseline - half]), max([*values, series.baseline + half])
    pad = (high - low) * 0.12 or 1.0
    low, high = low - pad, high + pad
    n = len(series.weekly)
    x = lambda i: LEFT + (W - LEFT - RIGHT) * (i / max(1, n - 1))  # noqa: E731
    y = lambda v: TOP + (H - TOP - BOTTOM) * (1 - (v - low) / (high - low))  # noqa: E731

    points = [(i, v) for i, v in enumerate(series.weekly) if v is not None]
    path = " ".join(f"{'M' if k == 0 else 'L'}{x(i):.1f},{y(v):.1f}" for k, (i, v) in enumerate(points))
    dots = []
    for i, v in points:
        in_run = series.flagged and series.run_start is not None and i >= series.run_start
        fill = LINE if in_run else SURFACE
        dots.append(
            f'<circle cx="{x(i):.1f}" cy="{y(v):.1f}" r="4" fill="{fill}" stroke="{LINE}" stroke-width="2">'
            f"<title>Week of {_short(week_starts[i])}: {_fmt(v)}</title></circle>")
    ticks = "".join(
        f'<text x="{x(i):.1f}" y="{H - 6}" text-anchor="middle">{_short(week_starts[i])}</text>'
        for i in range(0, n, 3))
    last_i, last_v = points[-1]
    band_top, band_bottom = y(series.baseline + half), y(series.baseline - half)
    title = escape(meta["label"])
    svg = (
        f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{title}, weekly, against the baseline band">'
        f'<rect x="{LEFT}" y="{band_top:.1f}" width="{W - LEFT - RIGHT}" height="{band_bottom - band_top:.1f}" fill="{BAND}"/>'
        f'<line x1="{LEFT}" x2="{W - RIGHT}" y1="{y(series.baseline):.1f}" y2="{y(series.baseline):.1f}" stroke="{MUTED}" stroke-dasharray="3 3"/>'
        f'<text x="{LEFT - 6}" y="{band_top + 4:.1f}" text-anchor="end">{_fmt(series.baseline + half)}</text>'
        f'<text x="{LEFT - 6}" y="{band_bottom + 4:.1f}" text-anchor="end">{_fmt(series.baseline - half)}</text>'
        f'<path d="{path}" fill="none" stroke="{LINE}" stroke-width="2" stroke-linejoin="round"/>'
        f'{"".join(dots)}'
        f'<text class="value" x="{x(last_i) + 8:.1f}" y="{y(last_v) + 4:.1f}">{_fmt(last_v)}</text>{ticks}</svg>')
    tag = (f'<span class="tag">Outside their usual range for {len(series.weekly) - (series.run_start or 0)} weeks</span>'
           if series.flagged else "")
    return (f'<div class="chart"><h3>{title}</h3>{tag}{svg}'
            f'<p class="small muted">Measured from: {escape(series.source)}</p></div>')


def _table(analysis: Analysis) -> str:
    head = "".join(f"<th>{_short(d)}</th>" for d in analysis.week_starts)
    rows = "".join(
        f"<tr><td>{escape(phrases.METRICS[m]['label'])}</td><td>{_fmt(s.baseline)}</td>"
        + "".join(f"<td>{'–' if v is None else _fmt(v)}</td>" for v in s.weekly) + "</tr>"
        for m, s in analysis.series.items())
    return (f'<details><summary>Weekly values as a table</summary><div class="scroll"><table>'
            f"<tr><th>Marker</th><th>Baseline</th>{head}</tr>{rows}</table></div></details>")


def build_report(analysis: Analysis, card: dict, name: str, daily: list[dict], consent: dict, created: str) -> str:
    flagged = analysis.flagged
    ordered = flagged + [m for m in phrases.METRICS if m in analysis.series and m not in flagged]
    charts = "".join(chart(analysis.series[m], analysis.week_starts) for m in ordered)
    asks = sum(d["orientation_asks"] for d in daily)
    evening = sum(d.get("evening_asks", 0) for d in daily)
    due, taken = sum(d.get("doses_due", 0) for d in daily), sum(d.get("doses_taken", 0) for d in daily)
    banner = ('<div class="banner">Simulated data. This history was generated for a demonstration and '
              "does not come from a real person.</div>" if analysis.simulated else "")
    flagged_list = "".join(
        f"<li>{escape(phrases.METRICS[m]['label'])}: {escape(phrases.METRICS[m]['phrase'])}, "
        f"since the week of {_short(analysis.week_starts[analysis.series[m].run_start or 0])}</li>" for m in flagged)
    flagged_block = (f"<ul>{flagged_list}</ul>" if flagged else
                     "<p>No marker has been outside this person's usual range for four weeks in a row.</p>")
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recollect — speech summary for {escape(name)}</title><style>{CSS}</style></head><body><main>
<h1>Speech summary for {escape(name)}</h1>
<p class="muted">Prepared by Recollect on {escape(created[:10])} for the family to share at a check-up.</p>
{banner}
<p class="notice">{escape(phrases.NOT_MEDICAL)}</p>
<div class="card"><p>{escape(card["say"])}</p></div>

<h2>What this covers</h2>
<div class="facts card">
<div class="fact"><b>{analysis.weeks}</b>weeks of everyday conversations</div>
<div class="fact"><b>{analysis.sessions}</b>conversations analysed</div>
<div class="fact"><b>{asks}</b>questions about the day, people and tablets ({evening} between 16:00 and 22:00)</div>
<div class="fact"><b>{taken} of {due}</b>scheduled tablets marked as taken</div>
</div>
<p class="small muted">Change tracking was switched on by {escape(name)} on {escape(consent.get("byElderAt", "")[:10])}
and by the family on {escape(consent.get("byFamilyAt", "")[:10])}. Audio is never kept; only numbers are stored.</p>

<h2>Markers outside their usual range</h2>
{flagged_block}

<h2>Each marker, week by week</h2>
<p class="small muted">The grey band is this person's own usual range: their baseline from the first weeks,
plus or minus {THRESHOLD_SD} robust standard deviations. The dashed line is the baseline. Filled points are
weeks in a run of {RUN_WEEKS} or more outside the band. No marker means anything on its own.</p>
<div class="grid">{charts}</div>
{_table(analysis)}

<h2>How to read this</h2>
<p>Recollect compares how {escape(name)} speaks now with how they spoke earlier, using ordinary
conversations at home. It tracks changes in speech against the person's own baseline and nothing else.
Tiredness, illness, mood, medicines and hearing all affect speech.</p>
<p class="notice">{escape(phrases.NOT_MEDICAL)}</p>
</main></body></html>
"""
    visible = re.sub(r"<style>.*?</style>|<[^>]+>", " ", page, flags=re.S)
    banned = phrases.find_banned(visible)
    if banned:
        raise ValueError(f"doctor report failed the wording check: {banned}")
    return page
