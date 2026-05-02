"""Doctor-visit summary report.

Renders a single-page printable HTML view covering the last N feeding days:
a snapshot at the top, weight history with gain rates and PMA, daily intake
totals + ml/kg/day (data-only days), Owlet vitals aggregates if available,
and any non-empty feed notes (so ad-hoc annotations like fortifier or
spit-ups land in context).

iOS Safari "Save to Files → Export as PDF" handles the export, no server-
side PDF library needed. Print/Close buttons attach via an inline script
gated by the per-request CSP nonce.
"""

from datetime import date, datetime, timedelta
from html import escape
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import HTMLResponse

from .. import repo
from ..auth import require_auth
from ..branding import BABY_NAME
from ..comparisons import (
    anchor_from_settings,
    feeding_day_bounds,
    feeding_day_for_row,
    now_local,
)
from ..growth import (
    daily_gains as _gains,
    pma_and_postnatal_age,
    weight_for_day as _weight_for_day,
)
from ..owlet import vitals_summary_for_range


router = APIRouter(prefix="/api", tags=["report"], dependencies=[Depends(require_auth)])


# ─── Helpers ──────────────────────────────────────────────────────────────

def _pma_at(birth_iso: str, ga_weeks: int, when: date) -> tuple[float, int]:
    """Per-day PMA wrapper: pma_and_postnatal_age but with an explicit
    'when' date so the per-row table can show PMA at *that* day, not
    only as-of today."""
    return pma_and_postnatal_age(birth_iso, ga_weeks, today=when)


def _has_intake_data(d: dict) -> bool:
    """A row is worth showing on the intake table if anything was tracked."""
    return (
        d["bottle_count"] > 0
        or d["breast_count"] > 0
        or d["wet"] > 0
        or d["dirty"] > 0
    )


# ─── Render ───────────────────────────────────────────────────────────────

def _render(days: int, csp_nonce: str) -> str:
    from datetime import date as _date
    from ..db import DEFAULTS
    s = repo.get_settings()
    anchor_h, anchor_m = anchor_from_settings(s)
    birth_iso = s.get("birth_date") or _date.today().isoformat()
    ga_weeks = int(s.get("gestational_age_weeks", DEFAULTS["gestational_age_weeks"]))
    birth_weight = int(s.get("birth_weight_grams", "0"))

    # Doctor reports should reflect *completed* feeding days only — including
    # today would always pull averages downward (incomplete intake, partial
    # monitoring). End the range at yesterday and walk back N days from there.
    today_local = now_local().date()
    end_day = today_local - timedelta(days=1)
    start_day = end_day - timedelta(days=days - 1)
    range_start, _ = feeding_day_bounds(start_day, anchor_h, anchor_m)
    _, range_end = feeding_day_bounds(end_day, anchor_h, anchor_m)

    feeds = repo.list_feeds_between(range_start.isoformat(), range_end.isoformat())
    diapers = repo.list_diapers_between(range_start.isoformat(), range_end.isoformat())
    # Doctor-facing report: only show real weigh-ins. Auto-fill estimates
    # are app-internal context for the daily ml target — clinicians need to
    # see measured values and the gaps between them honestly.
    weights_all = [w for w in repo.list_weights() if not w.get("is_auto")]
    weights_chrono = sorted(weights_all, key=lambda w: w["recorded_at"])
    weights_in_range = [
        w for w in weights_chrono if w["recorded_at"][:10] >= start_day.isoformat()
    ]
    gain_by_id = _gains(weights_chrono)

    # Per-day intake aggregation. The list is start_day .. end_day inclusive,
    # which excludes today (incomplete) by construction.
    days_list: list[date] = [start_day + timedelta(days=i) for i in range(days)]
    per_day: list[dict] = []
    feed_notes: list[tuple[date, datetime, float, str, str]] = []
    for d in days_list:
        d_feeds = [r for r in feeds if feeding_day_for_row(r, anchor_h, anchor_m) == d]
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

    intake_rows_data = [r for r in per_day if _has_intake_data(r)]

    # Vitals: same window as intake (yesterday going back N days). Pull
    # one extra and drop today so the report only reports completed days.
    today_iso = today_local.isoformat()
    vitals_all = [v for v in vitals_summary_for_range(days + 1) if v["feeding_day"] != today_iso]
    vitals_data = [v for v in vitals_all if v.get("monitoring_minutes", 0) >= 30]

    # ─── Snapshot computations ────────────────────────────────────────
    latest_weight = weights_chrono[-1] if weights_chrono else None
    pma_now, postnatal_days = _pma_at(birth_iso, ga_weeks, today_local)

    # Period weight movement
    earliest_in_range = (
        sorted(weights_in_range, key=lambda w: w["recorded_at"])[0]
        if weights_in_range else None
    )
    period_gain_g: Optional[int] = None
    if earliest_in_range and latest_weight:
        period_gain_g = latest_weight["weight_grams"] - earliest_in_range["weight_grams"]

    # 7-day rolling g/kg/day from the weight series
    seven_day_gain: Optional[float] = None
    if len(weights_chrono) >= 2:
        latest_dt = datetime.fromisoformat(weights_chrono[-1]["recorded_at"])
        cutoff = latest_dt - timedelta(days=7)
        within = [
            w for w in weights_chrono
            if datetime.fromisoformat(w["recorded_at"]) >= cutoff
        ]
        if len(within) >= 2:
            first = within[0]
            last = within[-1]
            span_days = (
                datetime.fromisoformat(last["recorded_at"])
                - datetime.fromisoformat(first["recorded_at"])
            ).total_seconds() / 86400
            if span_days > 0 and last["weight_grams"] > 0:
                g_per_day = (last["weight_grams"] - first["weight_grams"]) / span_days
                seven_day_gain = g_per_day / (last["weight_grams"] / 1000)

    intake_avg_ml = (
        sum(r["bottle_ml"] for r in intake_rows_data) / len(intake_rows_data)
        if intake_rows_data else None
    )
    intake_avg_ml_per_kg_vals = [
        r["ml_per_kg"] for r in intake_rows_data if r["ml_per_kg"] is not None
    ]
    intake_avg_ml_per_kg = (
        sum(intake_avg_ml_per_kg_vals) / len(intake_avg_ml_per_kg_vals)
        if intake_avg_ml_per_kg_vals else None
    )
    diaper_days = [r for r in intake_rows_data if r["wet"] > 0 or r["dirty"] > 0]
    avg_wet = sum(r["wet"] for r in diaper_days) / len(diaper_days) if diaper_days else None
    avg_dirty = sum(r["dirty"] for r in diaper_days) / len(diaper_days) if diaper_days else None

    vitals_snapshot: Optional[dict] = None
    if vitals_data:
        hr_avgs = [v["hr_avg"] for v in vitals_data if v["hr_avg"] is not None]
        spo2_mins = [v["spo2_min_avg10"] for v in vitals_data if v["spo2_min_avg10"] is not None]
        total_alerts = sum(v["low_spo2_alert_count"] for v in vitals_data)
        total_hours = sum(v["monitoring_minutes"] for v in vitals_data) / 60
        if hr_avgs and spo2_mins:
            vitals_snapshot = {
                "hr_avg_min": min(hr_avgs),
                "hr_avg_max": max(hr_avgs),
                "spo2_min": min(spo2_mins),
                "alerts": total_alerts,
                "hours": total_hours,
                "days": len(vitals_data),
            }

    # ─── HTML rendering ───────────────────────────────────────────────
    fmt_d = lambda d: d.strftime("%a %b %-d")
    fmt_dt = lambda dt: dt.strftime("%H:%M")

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

    intake_rows_html = (
        "\n".join(_intake_row(r) for r in intake_rows_data)
        if intake_rows_data
        else "<tr><td colspan=7 class='muted'>No intake data in this range.</td></tr>"
    )

    def _weight_row(w: dict) -> str:
        g = gain_by_id.get(w["id"])
        g_per_day = f"+{g['g_per_day']:.0f}" if g and g["g_per_day"] >= 0 else (f"{g['g_per_day']:.0f}" if g else "—")
        g_per_kg = f"+{g['g_per_kg_per_day']:.1f}" if g and g["g_per_kg_per_day"] >= 0 else (f"{g['g_per_kg_per_day']:.1f}" if g else "—")
        wd = date.fromisoformat(w["recorded_at"][:10])
        pma, pday = _pma_at(birth_iso, ga_weeks, wd)
        return (
            f"<tr>"
            f"<td>{escape(w['recorded_at'][:10])}</td>"
            f"<td class=num>day {pday}</td>"
            f"<td class=num>{pma:.1f}w</td>"
            f"<td class=num>{w['weight_grams']}</td>"
            f"<td class=num>{g_per_day}</td>"
            f"<td class=num>{g_per_kg}</td>"
            f"</tr>"
        )

    weight_rows_html = "\n".join(_weight_row(w) for w in weights_in_range) or (
        "<tr><td colspan=6 class='muted'>No weights logged in this range.</td></tr>"
    )

    def _vitals_row(v: dict) -> str:
        d = date.fromisoformat(v["feeding_day"])
        hr_avg = f"{v['hr_avg']:.0f}" if v["hr_avg"] is not None else "—"
        hr_range = (
            f"{v['hr_min']:.0f}–{v['hr_max']:.0f}"
            if v["hr_min"] is not None and v["hr_max"] is not None else "—"
        )
        spo2_min = f"{v['spo2_min_avg10']:.0f}%" if v["spo2_min_avg10"] is not None else "—"
        hours = f"{v['monitoring_minutes'] / 60:.1f}"
        sessions = v["session_count"]
        alerts = v["low_spo2_alert_count"]
        return (
            f"<tr>"
            f"<td>{fmt_d(d)}</td>"
            f"<td class=num>{hr_avg}</td>"
            f"<td class=num>{hr_range}</td>"
            f"<td class=num>{spo2_min}</td>"
            f"<td class=num>{hours} h</td>"
            f"<td class=num>{sessions}</td>"
            f"<td class=num>{alerts if alerts else '—'}</td>"
            f"</tr>"
        )

    vitals_section = ""
    if vitals_data:
        vitals_rows_html = "\n".join(_vitals_row(v) for v in vitals_data)
        vitals_section = f"""
  <h2>Vitals (Owlet sock)</h2>
  <table>
    <thead><tr>
      <th>Day</th>
      <th class=num>HR avg</th>
      <th class=num>HR range</th>
      <th class=num>Lowest SpO₂ <small>(sustained)</small></th>
      <th class=num>Monitoring</th>
      <th class=num>Sessions</th>
      <th class=num>Alerts</th>
    </tr></thead>
    <tbody>{vitals_rows_html}</tbody>
  </table>
"""

    notes_rows_html = (
        "\n".join(
            f"<tr>"
            f"<td>{fmt_d(d)}</td>"
            f"<td>{fmt_dt(dt)}</td>"
            f"<td class=num>{ml:.0f} ml</td>"
            f"<td>{escape(method)}</td>"
            f"<td>{escape(note)}</td>"
            f"</tr>"
            for d, dt, ml, method, note in feed_notes
        )
        if feed_notes
        else "<tr><td colspan=5 class='muted'>No feed notes recorded.</td></tr>"
    )

    # Snapshot HTML
    snap_lines: list[str] = []
    if latest_weight:
        if birth_weight:
            delta = latest_weight["weight_grams"] - birth_weight
            sign = "+" if delta >= 0 else ""
            snap_lines.append(
                f"<dt>Weight</dt><dd>"
                f"<strong>{latest_weight['weight_grams']} g</strong> "
                f"({sign}{delta} g vs birth weight {birth_weight} g)"
                f"</dd>"
            )
        else:
            snap_lines.append(
                f"<dt>Weight</dt><dd><strong>{latest_weight['weight_grams']} g</strong></dd>"
            )
    if period_gain_g is not None:
        sign = "+" if period_gain_g >= 0 else ""
        snap_lines.append(
            f"<dt>Period change</dt><dd>{sign}{period_gain_g} g across the {days}-day range</dd>"
        )
    if seven_day_gain is not None:
        sign = "+" if seven_day_gain >= 0 else ""
        snap_lines.append(
            f"<dt>Recent gain rate</dt><dd>{sign}{seven_day_gain:.1f} g/kg/day (7-day rolling)</dd>"
        )
    if intake_avg_ml is not None and intake_avg_ml_per_kg is not None:
        snap_lines.append(
            f"<dt>Daily intake (avg)</dt><dd>"
            f"{intake_avg_ml:.0f} ml/day · {intake_avg_ml_per_kg:.0f} ml/kg/day "
            f"<small>({len(intake_rows_data)} day{'s' if len(intake_rows_data) != 1 else ''} with data)</small>"
            f"</dd>"
        )
    if avg_wet is not None and avg_dirty is not None:
        snap_lines.append(
            f"<dt>Diapers (avg)</dt><dd>{avg_wet:.1f} wet/day · {avg_dirty:.1f} dirty/day</dd>"
        )
    if vitals_snapshot:
        snap_lines.append(
            f"<dt>Vitals (Owlet)</dt><dd>"
            f"HR {vitals_snapshot['hr_avg_min']:.0f}–{vitals_snapshot['hr_avg_max']:.0f} BPM avg · "
            f"lowest SpO₂ {vitals_snapshot['spo2_min']:.0f}% · "
            f"{vitals_snapshot['hours']:.1f} h across {vitals_snapshot['days']} day"
            f"{'s' if vitals_snapshot['days'] != 1 else ''} · "
            f"{vitals_snapshot['alerts']} alert{'s' if vitals_snapshot['alerts'] != 1 else ''}"
            f"</dd>"
        )

    snapshot_html = (
        f"<h2>Snapshot</h2><dl class=snap>{''.join(snap_lines)}</dl>"
        if snap_lines else ""
    )

    title = f"{BABY_NAME} · Feeding & growth report · last {days} days"

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
  h2 {{ font-size: 13px; margin: 22px 0 8px 0; text-transform: uppercase;
        letter-spacing: 0.05em; color: #52525b; font-weight: 600;
        border-bottom: 1px solid #e4e4e7; padding-bottom: 4px; }}
  .meta {{ color: #52525b; font-size: 11px; margin-bottom: 4px; }}
  .meta strong {{ color: #18181b; font-weight: 600; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 11px; }}
  th, td {{ text-align: left; padding: 5px 8px; border-bottom: 1px solid #e4e4e7; }}
  th {{ background: #f4f4f5; font-weight: 600; color: #3f3f46; }}
  td.num, th.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
  th small {{ font-weight: normal; color: #71717a; font-size: 9px; }}
  .muted {{ color: #71717a; font-style: italic; text-align: center; padding: 12px; }}
  dl.snap {{ display: grid; grid-template-columns: max-content 1fr;
             gap: 4px 16px; margin: 0 0 8px 0; }}
  dl.snap dt {{ color: #52525b; font-size: 11px; }}
  dl.snap dd {{ margin: 0; color: #18181b; font-size: 11px;
                font-variant-numeric: tabular-nums; }}
  dl.snap dd small {{ color: #71717a; font-size: 10px; font-variant-numeric: normal; }}
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
    <button class=primary id=btn-print>Print / Save PDF</button>
    <button id=btn-close>Close</button>
  </div>
  <h1>{escape(BABY_NAME)} — feeding &amp; growth report</h1>
  <div class=meta>
    Born <strong>{escape(birth_iso)}</strong> at <strong>{ga_weeks}w</strong> GA ·
    Today <strong>day {postnatal_days}</strong> postnatal · PMA <strong>{pma_now:.1f}w</strong>
  </div>
  <div class=meta>
    Range: <strong>{fmt_d(start_day)} – {fmt_d(end_day)}</strong>
    ({days} completed feeding days; day starts at {anchor_h:02d}:{anchor_m:02d}; today is excluded as incomplete)
  </div>

  {snapshot_html}

  <h2>Weight history</h2>
  <table>
    <thead><tr>
      <th>Date</th>
      <th class=num>Day</th>
      <th class=num>PMA</th>
      <th class=num>Weight (g)</th>
      <th class=num>Gain g/day</th>
      <th class=num>Gain g/kg/day</th>
    </tr></thead>
    <tbody>{weight_rows_html}</tbody>
  </table>

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
    <tbody>{intake_rows_html}</tbody>
  </table>
{vitals_section}
  <h2>Feed notes</h2>
  <table>
    <thead><tr>
      <th>Day</th><th>Time</th><th class=num>Amount</th><th>Method</th><th>Note</th>
    </tr></thead>
    <tbody>{notes_rows_html}</tbody>
  </table>

  <div class=footer>
    Generated {now_local().strftime('%Y-%m-%d %H:%M %Z')} from {escape(BABY_NAME)} Tracker.
    Bottle ml/kg/day uses the weight on (or most recently before) each day.
    Days with no intake data are omitted from the daily table.
  </div>
</div>
<script nonce="{escape(csp_nonce)}">
  document.getElementById('btn-print').addEventListener('click', function () {{
    window.print();
  }});
  document.getElementById('btn-close').addEventListener('click', function () {{
    if (window.opener) window.close(); else history.back();
  }});
</script>
</body></html>
"""
    return html


@router.get("/report", response_class=HTMLResponse)
def report(request: Request, days: int = Query(default=14, ge=1, le=90)) -> HTMLResponse:
    nonce = getattr(request.state, "csp_nonce", "")
    return HTMLResponse(_render(days, nonce))
