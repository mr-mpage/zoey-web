"""Doctor-visit summary report.

Renders a single-page printable HTML view covering the last N feeding days:
weight history with gain rates, daily intake totals + ml/kg/day, diaper
counts, breastfeed tally, and any feed notes (so ad-hoc annotations like
fortifier additions or spit-ups show up in context).

iOS Safari "Save to Files → Export as PDF" handles the export, so no
server-side PDF library is needed.
"""

from datetime import date, datetime, timedelta
from html import escape

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse

from .. import repo
from ..auth import require_auth
from ..comparisons import (
    feeding_day_bounds,
    feeding_day_for_row,
    now_local,
)


router = APIRouter(prefix="/api", tags=["report"], dependencies=[Depends(require_auth)])


def _weight_for_day(day_iso: str, weights: list[dict]) -> dict | None:
    """Most recent weight on or before the given date string."""
    same = [w for w in weights if w["recorded_at"][:10] == day_iso]
    if same:
        return sorted(same, key=lambda w: w["recorded_at"], reverse=True)[0]
    earlier = sorted(
        [w for w in weights if w["recorded_at"][:10] < day_iso],
        key=lambda w: w["recorded_at"],
        reverse=True,
    )
    return earlier[0] if earlier else None


def _pma_at(birth_iso: str, ga_weeks: int, when: date) -> tuple[float, int]:
    try:
        birth = date.fromisoformat(birth_iso)
    except ValueError:
        return float(ga_weeks), 0
    days = max(0, (when - birth).days)
    return ga_weeks + days / 7.0, days


def _gains(weights_chrono: list[dict]) -> dict[int, dict]:
    """Map weight id → gain since previous entry (g/day, g/kg/day)."""
    out: dict[int, dict] = {}
    for prev, cur in zip(weights_chrono, weights_chrono[1:]):
        days = (
            datetime.fromisoformat(cur["recorded_at"])
            - datetime.fromisoformat(prev["recorded_at"])
        ).total_seconds() / 86400
        if days <= 0:
            continue
        g_per_day = (cur["weight_grams"] - prev["weight_grams"]) / days
        kg = prev["weight_grams"] / 1000
        g_per_kg_per_day = g_per_day / kg if kg > 0 else 0
        out[cur["id"]] = {
            "g_per_day": g_per_day,
            "g_per_kg_per_day": g_per_kg_per_day,
            "from_iso": prev["recorded_at"],
            "days": days,
        }
    return out


def _render(days: int) -> str:
    s = repo.get_settings()
    anchor_h = int(s.get("day_start_hour", "2"))
    anchor_m = int(s.get("day_start_minute", "30"))
    birth_iso = s.get("birth_date", "2026-04-15")
    ga_weeks = int(s.get("gestational_age_weeks", "35"))

    today_local = now_local().date()
    start_day = today_local - timedelta(days=days - 1)
    range_start, _ = feeding_day_bounds(start_day, anchor_h, anchor_m)
    _, range_end = feeding_day_bounds(today_local, anchor_h, anchor_m)

    feeds = repo.list_feeds_between(range_start.isoformat(), range_end.isoformat())
    diapers = repo.list_diapers_between(range_start.isoformat(), range_end.isoformat())
    weights_all = repo.list_weights()
    weights_chrono = sorted(weights_all, key=lambda w: w["recorded_at"])
    weights_in_range = [
        w for w in weights_chrono if w["recorded_at"][:10] >= start_day.isoformat()
    ]
    gain_by_id = _gains(weights_chrono)

    # Per-day aggregation
    days_list: list[date] = [start_day + timedelta(days=i) for i in range(days)]
    per_day: list[dict] = []
    feed_notes: list[tuple[date, datetime, float, str, str]] = []  # day, fed_at, ml, method, note
    for d in days_list:
        d_feeds = [
            r for r in feeds if feeding_day_for_row(r, anchor_h, anchor_m) == d
        ]
        d_diapers = [r for r in diapers if r["recorded_at"][:10] == d.isoformat()]
        bottle = [f for f in d_feeds if (f.get("method") or "bottle") == "bottle"]
        breast = [f for f in d_feeds if (f.get("method") or "bottle") == "breast"]
        bottle_ml = sum(f["amount_ml"] for f in bottle)
        breast_ml = sum(f["amount_ml"] for f in breast)
        wet = sum(1 for r in d_diapers if r["kind"] == "wet")
        dirty = sum(1 for r in d_diapers if r["kind"] == "dirty")
        w = _weight_for_day(d.isoformat(), weights_chrono)
        kg = (w["weight_grams"] / 1000) if w else None
        ml_per_kg = (bottle_ml / kg) if (kg and kg > 0) else None
        per_day.append({
            "date": d,
            "bottle_count": len(bottle),
            "bottle_ml": bottle_ml,
            "breast_count": len(breast),
            "breast_ml": breast_ml,
            "wet": wet,
            "dirty": dirty,
            "weight_g": w["weight_grams"] if w else None,
            "ml_per_kg": ml_per_kg,
        })
        for f in sorted(d_feeds, key=lambda r: r["fed_at"]):
            note = (f.get("notes") or "").strip()
            if note:
                feed_notes.append((
                    d,
                    datetime.fromisoformat(f["fed_at"]),
                    f["amount_ml"],
                    (f.get("method") or "bottle"),
                    note,
                ))

    latest_weight = weights_chrono[-1] if weights_chrono else None
    pma_now, postnatal_days = _pma_at(birth_iso, ga_weeks, today_local)

    fmt_d = lambda d: d.strftime("%a %b %-d")
    fmt_dt = lambda dt: dt.strftime("%H:%M")

    # ---- HTML rows --------------------------------------------------------
    def _intake_row(r: dict) -> str:
        ml_per_kg = f"{r['ml_per_kg']:.0f}" if r["ml_per_kg"] is not None else "—"
        breast = f"{r['breast_count']}× / {r['breast_ml']:.0f} ml" if r["breast_count"] else "—"
        return (
            f"<tr>"
            f"<td>{fmt_d(r['date'])}</td>"
            f"<td class=num>{r['bottle_ml']:.0f}</td>"
            f"<td class=num>{r['bottle_count']}</td>"
            f"<td class=num>{ml_per_kg}</td>"
            f"<td class=num>{r['wet']}</td>"
            f"<td class=num>{r['dirty']}</td>"
            f"<td class=num>{breast}</td>"
            f"</tr>"
        )

    intake_rows = "\n".join(_intake_row(r) for r in per_day)

    def _weight_row(w: dict) -> str:
        g = gain_by_id.get(w["id"])
        g_per_day = f"+{g['g_per_day']:.0f}" if g else "—"
        g_per_kg = f"+{g['g_per_kg_per_day']:.1f}" if g else "—"
        return (
            f"<tr>"
            f"<td>{escape(w['recorded_at'][:10])}</td>"
            f"<td class=num>{w['weight_grams']}</td>"
            f"<td class=num>{w['ml_per_kg_per_day']}</td>"
            f"<td class=num>{g_per_day}</td>"
            f"<td class=num>{g_per_kg}</td>"
            f"<td>{escape(w.get('notes') or '')}</td>"
            f"</tr>"
        )

    weight_rows = "\n".join(_weight_row(w) for w in weights_in_range) or (
        "<tr><td colspan=6 class='muted'>No weights logged in this range.</td></tr>"
    )

    notes_rows = "\n".join(
        f"<tr>"
        f"<td>{fmt_d(d)}</td>"
        f"<td>{fmt_dt(dt)}</td>"
        f"<td class=num>{ml:.0f} ml</td>"
        f"<td>{escape(method)}</td>"
        f"<td>{escape(note)}</td>"
        f"</tr>"
        for d, dt, ml, method, note in feed_notes
    ) or "<tr><td colspan=5 class='muted'>No feed notes recorded.</td></tr>"

    # Header summary
    if latest_weight:
        weight_header = (
            f"{latest_weight['weight_grams']} g · {latest_weight['ml_per_kg_per_day']} ml/kg/day"
        )
    else:
        weight_header = "—"

    title = f"Zoey · Feeding & growth report · last {days} days"

    html = f"""<!doctype html>
<html lang=en>
<head>
<meta charset=utf-8>
<title>{escape(title)}</title>
<meta name=viewport content="width=device-width, initial-scale=1">
<style>
  :root {{ color-scheme: light; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: #18181b; background: #fff; margin: 0; padding: 24px;
    line-height: 1.4; font-size: 12px;
  }}
  .wrap {{ max-width: 760px; margin: 0 auto; }}
  h1 {{ font-size: 18px; margin: 0 0 4px 0; font-weight: 600; }}
  h2 {{ font-size: 13px; margin: 22px 0 6px 0; text-transform: uppercase;
        letter-spacing: 0.05em; color: #52525b; font-weight: 600; }}
  .meta {{ color: #52525b; font-size: 11px; margin-bottom: 4px; }}
  .meta strong {{ color: #18181b; font-weight: 600; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 11px; }}
  th, td {{ text-align: left; padding: 5px 8px; border-bottom: 1px solid #e4e4e7; }}
  th {{ background: #f4f4f5; font-weight: 600; color: #3f3f46; }}
  td.num, th.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
  .muted {{ color: #71717a; font-style: italic; text-align: center; padding: 12px; }}
  .footer {{ margin-top: 24px; color: #71717a; font-size: 10px; }}
  .actions {{
    position: sticky; top: 0; background: #fff;
    padding: 8px 0 12px 0; margin-bottom: 8px;
    border-bottom: 1px solid #e4e4e7;
    display: flex; gap: 8px; z-index: 10;
  }}
  .actions button {{
    flex: 1; padding: 10px 14px; font: inherit; font-size: 13px;
    border: 1px solid #d4d4d8; border-radius: 8px; background: #fafafa;
    cursor: pointer; -webkit-appearance: none;
  }}
  .actions button.primary {{ background: #18181b; color: #fff; border-color: #18181b; }}
  @media print {{
    body {{ padding: 0; }}
    .wrap {{ max-width: none; }}
    .actions {{ display: none; }}
    h2 {{ page-break-after: avoid; }}
    tr {{ page-break-inside: avoid; }}
  }}
  @page {{ margin: 14mm; }}
</style>
</head>
<body><div class=wrap>
  <div class=actions>
    <button class=primary onclick="window.print()">Print / Save PDF</button>
    <button onclick="if(window.opener){{window.close()}}else{{history.back()}}">Close</button>
  </div>
  <h1>Zoey — feeding &amp; growth report</h1>
  <div class=meta>
    Born <strong>{escape(birth_iso)}</strong> at <strong>{ga_weeks}w</strong> GA ·
    Today <strong>day {postnatal_days}</strong> postnatal · PMA <strong>{pma_now:.1f}w</strong> ·
    Current weight <strong>{escape(weight_header)}</strong>
  </div>
  <div class=meta>
    Range: <strong>{fmt_d(start_day)} – {fmt_d(today_local)}</strong>
    ({days} feeding days; day starts at {anchor_h:02d}:{anchor_m:02d})
  </div>

  <h2>Daily intake</h2>
  <table>
    <thead><tr>
      <th>Day</th>
      <th class=num>Bottle (ml)</th>
      <th class=num>Feeds</th>
      <th class=num>ml/kg/day</th>
      <th class=num>Wet</th>
      <th class=num>Dirty</th>
      <th class=num>Breast attempts</th>
    </tr></thead>
    <tbody>{intake_rows}</tbody>
  </table>

  <h2>Weight history</h2>
  <table>
    <thead><tr>
      <th>Date</th>
      <th class=num>Weight (g)</th>
      <th class=num>ml/kg/day rate</th>
      <th class=num>Gain g/day</th>
      <th class=num>Gain g/kg/day</th>
      <th>Notes</th>
    </tr></thead>
    <tbody>{weight_rows}</tbody>
  </table>

  <h2>Feed notes</h2>
  <table>
    <thead><tr>
      <th>Day</th><th>Time</th><th class=num>Amount</th><th>Method</th><th>Note</th>
    </tr></thead>
    <tbody>{notes_rows}</tbody>
  </table>

  <div class=footer>
    Generated {now_local().strftime('%Y-%m-%d %H:%M %Z')} from Zoey Tracker.
    Bottle ml/kg/day uses the weight on (or most recently before) each day.
  </div>
</div></body></html>
"""
    return html


@router.get("/report", response_class=HTMLResponse)
def report(days: int = Query(default=14, ge=1, le=90)) -> HTMLResponse:
    return HTMLResponse(_render(days))
