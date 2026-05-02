from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from .. import repo
from ..auth import require_auth, require_edit
from ..comparisons import feeding_day_bounds, feeding_day_for, now_local, read_anchor
from ..models import (
    Med,
    MedDose,
    MedDoseIn,
    MedDosePatch,
    MedDoseWithMed,
    MedIn,
    MedPatch,
    MedsToday,
    MedTodayRow,
    MedTodaySlot,
)

router = APIRouter(prefix="/api", tags=["meds"], dependencies=[Depends(require_auth)])


def _row_to_med(row: dict) -> Med:
    return Med(
        id=row["id"],
        name=row["name"],
        doses_per_day=row["doses_per_day"],
        sort_order=row["sort_order"],
        archived=bool(row["archived"]),
    )


def _resolve_dose_name(row: dict, med_lookup: dict[int, dict]) -> str:
    if row["med_id"] is not None:
        med = med_lookup.get(row["med_id"])
        if med:
            return med["name"]
    return row["name"] or "Untitled"


def _row_to_dose_with_med(row: dict, med_lookup: dict[int, dict]) -> MedDoseWithMed:
    return MedDoseWithMed(
        id=row["id"],
        med_id=row["med_id"],
        name=_resolve_dose_name(row, med_lookup),
        given_at=row["given_at"],
        notes=row["notes"],
        is_extra=bool(row["is_extra"]),
        feeding_day_override=row["feeding_day_override"],
    )


# --- Meds (configuration) ---------------------------------------------------


@router.get("/meds")
def list_meds() -> list[Med]:
    return [_row_to_med(r) for r in repo.list_meds(include_archived=False)]


@router.post("/meds", status_code=201, dependencies=[Depends(require_edit)])
def create_med(payload: MedIn) -> Med:
    new_id = repo.insert_med(
        name=payload.name.strip(),
        doses_per_day=payload.doses_per_day,
        sort_order=payload.sort_order,
    )
    row = repo.get_med(new_id)
    assert row is not None
    return _row_to_med(row)


@router.patch("/meds/{med_id}", dependencies=[Depends(require_edit)])
def patch_med(med_id: int, payload: MedPatch) -> Med:
    if not repo.get_med(med_id):
        raise HTTPException(404, "Med not found")
    repo.update_med(
        med_id=med_id,
        name=payload.name.strip() if payload.name is not None else None,
        doses_per_day=payload.doses_per_day,
        sort_order=payload.sort_order,
        archived=payload.archived,
    )
    row = repo.get_med(med_id)
    assert row is not None
    return _row_to_med(row)


@router.delete("/meds/{med_id}", status_code=204, dependencies=[Depends(require_edit)])
def archive_med(med_id: int) -> None:
    if not repo.get_med(med_id):
        raise HTTPException(404, "Med not found")
    # Soft delete — keep the row so historical doses still resolve a name.
    repo.update_med(med_id=med_id, archived=True)


# --- Doses ------------------------------------------------------------------


def _feeding_day_for_dose(given_at: datetime, override: Optional[str]) -> str:
    if override:
        return override
    anchor_h, anchor_m = read_anchor()
    return feeding_day_for(given_at, anchor_h, anchor_m).isoformat()


@router.get("/meds/today")
def get_meds_today() -> MedsToday:
    """Today's checklist + extras + one-offs for the current feeding day."""
    anchor_h, anchor_m = read_anchor()
    today = feeding_day_for(now_local(), anchor_h, anchor_m)
    start, end = feeding_day_bounds(today, anchor_h, anchor_m)

    meds = repo.list_meds(include_archived=False)
    med_lookup = {m["id"]: m for m in meds}

    today_iso = today.isoformat()
    doses = repo.list_med_doses_for_feeding_day(today_iso, start, end)

    rows: list[MedTodayRow] = []
    for med in meds:
        med_doses = [d for d in doses if d["med_id"] == med["id"]]
        slots: list[MedTodaySlot] = []
        # First N slots — filled or pending — where N = doses_per_day.
        for i in range(med["doses_per_day"]):
            dose = med_doses[i] if i < len(med_doses) else None
            slots.append(
                MedTodaySlot(
                    slot_index=i,
                    dose=_row_to_dose_with_med(dose, med_lookup) if dose else None,
                    is_extra=False,
                )
            )
        extras = [
            _row_to_dose_with_med(d, med_lookup)
            for d in med_doses[med["doses_per_day"]:]
        ]
        rows.append(MedTodayRow(med=_row_to_med(med), slots=slots, extras=extras))

    one_offs = [
        _row_to_dose_with_med(d, med_lookup)
        for d in doses
        if d["med_id"] is None
    ]

    return MedsToday(feeding_day=today_iso, rows=rows, one_offs=one_offs)


@router.get("/meds/doses")
def list_doses(days: int = 14) -> list[MedDoseWithMed]:
    """Recent doses grouped client-side. Caller picks the window in days."""
    anchor_h, anchor_m = read_anchor()
    today = feeding_day_for(now_local(), anchor_h, anchor_m)
    end = feeding_day_bounds(today, anchor_h, anchor_m)[1]
    start = feeding_day_bounds(today, anchor_h, anchor_m)[0]
    from datetime import timedelta as _td
    start = start - _td(days=days - 1)
    rows = repo.list_med_doses_between(start, end)
    meds = {m["id"]: m for m in repo.list_meds(include_archived=True)}
    return [_row_to_dose_with_med(r, meds) for r in rows]


@router.post("/meds/doses", status_code=201, dependencies=[Depends(require_edit)])
def create_dose(payload: MedDoseIn) -> MedDose:
    if payload.med_id is None and not (payload.name and payload.name.strip()):
        raise HTTPException(400, "Either med_id or name is required")
    if payload.med_id is not None and not repo.get_med(payload.med_id):
        raise HTTPException(404, "Med not found")
    given_at = payload.given_at or now_local()

    # is_extra: for a med-linked dose, true if today's count is already
    # at or above doses_per_day; for free-text one-offs, false (they don't
    # have a daily target so the flag is meaningless).
    is_extra = False
    if payload.med_id is not None:
        med = repo.get_med(payload.med_id)
        assert med is not None
        anchor_h, anchor_m = read_anchor()
        fd = (
            payload.feeding_day_override
            or feeding_day_for(given_at, anchor_h, anchor_m).isoformat()
        )
        from datetime import date as _date
        d = _date.fromisoformat(fd)
        start, end = feeding_day_bounds(d, anchor_h, anchor_m)
        existing = [
            x for x in repo.list_med_doses_for_feeding_day(fd, start, end)
            if x["med_id"] == payload.med_id
        ]
        is_extra = len(existing) >= med["doses_per_day"]

    new_id = repo.insert_med_dose(
        med_id=payload.med_id,
        name=(payload.name.strip() if payload.name else None),
        given_at=given_at,
        notes=payload.notes,
        is_extra=is_extra,
        feeding_day_override=payload.feeding_day_override or None,
    )
    row = repo.get_med_dose(new_id)
    assert row is not None
    return MedDose(
        id=row["id"],
        med_id=row["med_id"],
        name=row["name"],
        given_at=row["given_at"],
        notes=row["notes"],
        is_extra=bool(row["is_extra"]),
        feeding_day_override=row["feeding_day_override"],
    )


@router.patch("/meds/doses/{dose_id}", dependencies=[Depends(require_edit)])
def patch_dose(dose_id: int, payload: MedDosePatch) -> MedDose:
    if not repo.get_med_dose(dose_id):
        raise HTTPException(404, "Dose not found")
    repo.update_med_dose(
        dose_id=dose_id,
        given_at=payload.given_at,
        notes=payload.notes,
        feeding_day_override=payload.feeding_day_override,
        clear_feeding_day_override=(payload.feeding_day_override == ""),
    )
    row = repo.get_med_dose(dose_id)
    assert row is not None
    return MedDose(
        id=row["id"],
        med_id=row["med_id"],
        name=row["name"],
        given_at=row["given_at"],
        notes=row["notes"],
        is_extra=bool(row["is_extra"]),
        feeding_day_override=row["feeding_day_override"],
    )


@router.delete("/meds/doses/{dose_id}", status_code=204, dependencies=[Depends(require_edit)])
def delete_dose(dose_id: int) -> None:
    if not repo.delete_med_dose(dose_id):
        raise HTTPException(404, "Dose not found")
