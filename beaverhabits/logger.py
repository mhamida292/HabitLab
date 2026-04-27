import logging
import os
import sys

_level = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=_level,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("beaverhabits")
