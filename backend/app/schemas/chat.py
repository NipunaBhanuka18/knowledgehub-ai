from pydantic import BaseModel, Field
from typing import Optional

class ChatRequest(BaseModel):
    message: str = Field(..., description="The user query text")
    session_id: Optional[str] = Field(None, description="Bedrock managed session ID for multi-turn conversations")

class CitationSchema(BaseModel):
    document: str
    page: int
    snippet: str

class HealthResponse(BaseModel):
    status: str
    service: str
    knowledge_base_id: str
    region: str
