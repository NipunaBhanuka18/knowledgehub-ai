import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers.chat import router as chat_router
from app.utils.logging import logger

app = FastAPI(
    title="KnowledgeHub AI — AWS Bedrock Document Assistant Backend",
    description="Stateless FastAPI service wrapping AWS Bedrock Knowledge Bases and Claude via Server-Sent Events (SSE).",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)

@app.on_event("startup")
async def startup_event():
    logger.info("KnowledgeHub AI Backend started. Ready to accept SSE connections.")

@app.get("/")
async def root():
    return {"message": "KnowledgeHub AI API is running. Access endpoints at /api/chat and /api/health."}
