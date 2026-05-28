import calendar

import dotenv
import pytz
from pydantic import field_validator
from pydantic_settings import BaseSettings

dotenv.load_dotenv()

USER_DATA_FOLDER = ".user"


class Settings(BaseSettings):
    ENV: str = "dev"
    DEBUG: bool = False

    # Storage
    DATABASE_URL: str = f"sqlite+aiosqlite:///./{USER_DATA_FOLDER}/habits.db"
    DATA_DIR: str = USER_DATA_FOLDER

    # Auth
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    JWT_SECRET: str = "SECRET"
    JWT_LIFETIME_SECONDS: int = 60 * 60 * 24 * 30  # 30 days
    TRUSTED_EMAIL_HEADER: str = ""
    TRUSTED_LOCAL_EMAIL: str = ""

    # Timezone: if set, overrides the configured timezone for all users.
    # Use standard IANA timezone names, e.g. "America/New_York", "Europe/London", "Asia/Tokyo".
    TIME_ZONE: str = ""

    # Customization
    FIRST_DAY_OF_WEEK: int = calendar.MONDAY
    # Set to 0-6 to align today to specific day of week, e.g., 0 for Monday
    ALIGN_TODAY_TO_DAY_OF_WEEK: int | None = None

    INDEX_SHOW_HABIT_COUNT: bool = False
    INDEX_SHOW_HABIT_STREAK: bool = False
    INDEX_HABIT_NAME_COLUMNS: int = 5
    INDEX_HABIT_DATE_COLUMNS: int = 5
    INDEX_HABIT_DATE_REVERSE: bool = False

    HABIT_SHOW_EVERY_DAY_STREAKS: bool = False

    DAILY_NOTE_MAX_LENGTH: int = 1024
    DEFAULT_COMPLETION_STATUS_LIST: list[str] = ["yes", "no"]

    def is_dev(self):
        return self.ENV == "dev"

    def is_trusted_env(self):
        return self.TRUSTED_LOCAL_EMAIL

    @field_validator("TIME_ZONE")
    @classmethod
    def validate_time_zone(cls, v: str) -> str:
        if v and v not in pytz.all_timezones_set:
            raise ValueError(
                f"Invalid TIME_ZONE '{v}'. Must be a valid IANA timezone name "
                f"(e.g. 'America/New_York', 'Europe/London', 'Asia/Tokyo')."
            )
        return v


settings = Settings()
