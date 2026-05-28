# habitlab/models.py
from dataclasses import dataclass


@dataclass
class User:
    """Single-user app — always id=1. Used as a dependency return type."""
    id: int = 1
