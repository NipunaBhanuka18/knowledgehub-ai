import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Locate exact .env inside knowledgehub-ai root directory
root_dir = Path(__file__).parent.parent.parent.parent
env_path = root_dir / ".env"
if not env_path.exists():
    env_path = root_dir / "backend" / ".env"

class Settings(BaseSettings):
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_DEFAULT_REGION: str = "us-east-1"
    BEDROCK_KNOWLEDGE_BASE_ID: str = "PAXDDYNBD6"
    BEDROCK_MODEL_ID: str = "amazon.nova-lite-v1:0"

    model_config = SettingsConfigDict(
        env_file=str(env_path),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
