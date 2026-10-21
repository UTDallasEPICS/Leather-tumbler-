"""Isolated mock server for schema fuzzing. Never uses the workshop DB/hardware."""

import os
from app import create_app


def create():
    return create_app(mock=True, db_path=os.environ["SCHEMA_TEST_DB"])
