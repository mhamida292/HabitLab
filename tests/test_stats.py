import datetime

from beaverhabits.routes.api import _scoped_percent


def d(s: str) -> datetime.date:
    return datetime.date.fromisoformat(s)


def test_full_window_uses_window_days_as_denom():
    # Started long before window. Window is 30 days, 3 hits → 10.0%
    today = d("2026-04-28")
    started = d("2026-01-01")
    done = [d("2026-04-26"), d("2026-04-27"), d("2026-04-28")]
    assert _scoped_percent(done, today, 30, started) == 10.0


def test_brand_new_habit_completed_today():
    # Started today, completed today. Denom should be 1, not 30.
    today = d("2026-04-28")
    started = today
    done = [today]
    assert _scoped_percent(done, today, 30, started) == 100.0


def test_three_days_in_window_two_done():
    # Started 3 days ago, 2 done. Denom = 3, hits = 2 → 66.7%
    today = d("2026-04-28")
    started = d("2026-04-26")
    done = [d("2026-04-26"), d("2026-04-28")]
    assert _scoped_percent(done, today, 30, started) == 66.7


def test_seven_day_window_just_started():
    # Started yesterday, completed both days.
    today = d("2026-04-28")
    started = d("2026-04-27")
    done = [d("2026-04-27"), d("2026-04-28")]
    assert _scoped_percent(done, today, 7, started) == 100.0


def test_date_started_in_future_returns_zero():
    today = d("2026-04-28")
    started = d("2026-05-10")
    assert _scoped_percent([], today, 30, started) == 0.0


def test_only_hits_inside_effective_window_count():
    # Hit before date_started should be ignored.
    today = d("2026-04-28")
    started = d("2026-04-25")
    done = [d("2026-04-20"), d("2026-04-26")]
    # Effective window: 2026-04-25..2026-04-28 → 4 days, 1 hit → 25.0%
    assert _scoped_percent(done, today, 30, started) == 25.0
