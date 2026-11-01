import importlib
import sys
from pathlib import Path

import pytest

PIPELINE = Path(__file__).resolve().parent.parent / "pipeline"
sys.path.insert(0, str(PIPELINE))


@pytest.fixture(scope="session")
def step():
    """Import a pipeline step by file name; the numeric prefixes aren't valid module identifiers."""
    return lambda name: importlib.import_module(name)
