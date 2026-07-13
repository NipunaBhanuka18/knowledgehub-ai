from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.schemas.chat import ChatRequest, HealthResponse
from app.services.bedrock_service import bedrock_service
from app.config.settings import settings
from app.utils.logging import logger

router = APIRouter(prefix="/api", tags=["chat"])

@router.post("/chat")
async def chat_stream(request: ChatRequest):
    """
    POST /api/chat — Server-Sent Events (SSE) endpoint matching project plan §8.
    Yields events: token, citation, done, error.
    """
    logger.info(f"Incoming chat query: '{request.message}' | session_id={request.session_id}")
    return StreamingResponse(
        bedrock_service.stream_answer(message=request.message, session_id=request.session_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    GET /api/health — Liveness check for deployment and configuration verification.
    """
    return HealthResponse(
        status="operational",
        service="KnowledgeHub AI — Bedrock Agent Runtime Service",
        knowledge_base_id=settings.BEDROCK_KNOWLEDGE_BASE_ID or "NOT_SET",
        region=settings.AWS_DEFAULT_REGION
    )
