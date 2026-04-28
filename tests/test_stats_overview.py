import datetime
from dataclasses import dataclass

from beaverhabits.routes.api import _build_stats_overview


def d(s: str) -> datetime.date:
    return datetime.date.fromisoformat(s)


@dataclass
class FakeRecord:
    day: datetime.date
    count: int


class FakeHabit:
    def __init__(self, id, name, icon, target_count, date_started, records):
        self.id = id
        self.name = name
        self.icon = icon
        self.target_count = target_count
        self.date_started = date_started
        self.records = [FakeRecord(d(day), c) for day, c in records]


def test_empty_habit_list_returns_zeroed_aggregate():
    today = d("2026-04-28")
    result = _build_stats_overview([], today)
    assert result["aggregate"] == {
        "active_count": 0,
        "avg_30d": 0.0,
        "best_streak": 0,
        "today_done": 0,
    }
    assert result["habits"] == []


def test_aggregate_counts_today_done_and_streak():
    today = d("2026-04-28")
    h1 = FakeHabit(
        "h1", "Salah", "🤲", target_count=1, date_started=d("2026-04-25"),
        records=[("2026-04-25", 1), ("2026-04-26", 1), ("2026-04-27", 1), ("2026-04-28", 1)],
    )
    h2 = FakeHabit(
        "h2", "Quran", "📖", target_count=1, date_started=d("2026-04-27"),
        records=[("2026-04-27", 1), ("2026-04-28", 1)],
    )
    h3 = FakeHabit(
        "h3", "Journal", "✍️", target_count=1, date_started=d("2026-04-26"),
        records=[("2026-04-26", 1)],  # not done today
    )
    result = _build_stats_overview([h1, h2, h3], today)
    agg = result["aggregate"]
    assert agg["active_count"] == 3
    assert agg["best_streak"] == 4         # h1 has 4-day streak
    assert agg["today_done"] == 2          # h1 + h2 done today
    # avg_30d: h1=100% (4/4), h2=100% (2/2), h3=33.3% (1/3 since not done today)
    # Mean = (100 + 100 + 33.3) / 3 = 77.8
    assert agg["avg_30d"] == 77.8


def test_per_habit_days_window_is_91_days_inclusive():
    today = d("2026-04-28")
    h = FakeHabit(
        "h", "X", "📌", target_count=1, date_started=d("2026-01-01"),
        records=[("2026-04-28", 1)],
    )
    result = _build_stats_overview([h], today)
    days = result["habits"][0]["days"]
    assert len(days) == 91
    assert days[0]["date"] == "2026-01-28"   # 90 days before today
    assert days[-1]["date"] == "2026-04-28"
    assert days[-1]["count"] == 1
    assert days[-1]["done"] is True


def test_per_habit_days_respect_target_count():
    today = d("2026-04-28")
    h = FakeHabit(
        "h", "Pray", "🤲", target_count=5, date_started=d("2026-04-28"),
        records=[("2026-04-28", 3)],
    )
    result = _build_stats_overview([h], today)
    today_entry = result["habits"][0]["days"][-1]
    assert today_entry["count"] == 3
    assert today_entry["done"] is False  # 3 < 5
    # No streak today
    assert result["aggregate"]["best_streak"] == 0


def test_habit_payload_shape():
    today = d("2026-04-28")
    h = FakeHabit(
        "abc123", "Salah", "🤲", target_count=2, date_started=d("2026-04-28"),
        records=[("2026-04-28", 2)],
    )
    result = _build_stats_overview([h], today)
    out = result["habits"][0]
    assert out["id"] == "abc123"
    assert out["name"] == "Salah"
    assert out["icon"] == "🤲"
    assert out["target_count"] == 2
    assert isinstance(out["days"], list)
