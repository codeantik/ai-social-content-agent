"""pydantic-settings config — replaces the st.secrets -> os.environ bridge.

Same env vars as the Streamlit app (.env locally, real env in deployment).
Other modules keep reading os.getenv() directly (unchanged) — this just
guarantees .env is loaded once at process start and gives typed access
where convenient.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    OPENAI_API_KEY: str = ""
    TAVILY_API_KEY: str = ""

    DAILY_GENERATION_LIMIT: int = 3

    LANGCHAIN_TRACING_V2: bool = False
    LANGCHAIN_API_KEY: str = ""
    LANGCHAIN_PROJECT: str = ""

    WEB_BASE_URL: str = "http://localhost:3000"

    FACEBOOK_APP_ID: str = ""
    FACEBOOK_APP_SECRET: str = ""
    FACEBOOK_REDIRECT_URI: str = "http://localhost:8000/auth/facebook/callback"

    LINKEDIN_CLIENT_ID: str = ""
    LINKEDIN_CLIENT_SECRET: str = ""
    LINKEDIN_REDIRECT_URI: str = "http://localhost:8000/auth/linkedin/callback"
    LINKEDIN_API_VERSION: str = "202606"

    SQL_DB_HOST: str = ""
    SQL_DB_PORT: str = "5432"
    SQL_DB_NAME: str = ""
    SQL_DB_USER: str = ""
    SQL_DB_PASSWORD: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
