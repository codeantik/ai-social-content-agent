"""PostgreSQL connection config — reads credentials from environment."""
import os


def is_pg_configured() -> bool:
    return all(os.getenv(k) for k in ("SQL_DB_HOST", "SQL_DB_NAME", "SQL_DB_USER", "SQL_DB_PASSWORD"))


def get_psycopg_dsn() -> str:
    host = os.environ["SQL_DB_HOST"]
    port = os.getenv("SQL_DB_PORT", "5432")
    name = os.environ["SQL_DB_NAME"]
    user = os.environ["SQL_DB_USER"]
    password = os.environ["SQL_DB_PASSWORD"]
    return f"host={host} port={port} dbname={name} user={user} password={password}"
