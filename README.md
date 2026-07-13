# KnowledgeHub AI — AWS Bedrock Document Assistant

KnowledgeHub AI is a document Q&A demo over PDFs using Amazon Bedrock Knowledge Bases, complete with real-time streaming answers and page-level source citations.

Built on **Amazon Bedrock Knowledge Bases (S3 Vectors)** and powered by **Amazon Nova Lite / Anthropic Claude**, the application streams tokens, snippets, and verified document references to a clean **Next.js** web interface via **FastAPI Server-Sent Events (SSE)**.

---

## 🌟 Key Features & Architectural Highlights

1. **AWS-Native RAG Pipeline**:
   - Uses **Amazon Bedrock Agent Runtime** (`retrieve` API) to query pre-indexed S3 Vector embeddings without requiring third-party vector databases or orchestrators.
   - Grounded system prompts ensure the model strictly answers from retrieved Gazette context, eliminating external hallucinations.
2. **Server-Sent Events (SSE) Streaming**:
   - Stateless **FastAPI** backend streams individual token chunks (`event: token`), document citations (`event: citation`), and lifecycle signals (`event: done`, `event: error`) in real-time.
3. **Resilient Cloud Engineering**:
   - Implements **automatic retry-once mechanism on AWS API throttling** (`ThrottlingException` / `429 TooManyRequestsException`) during both retrieval and model generation without blocking the async event loop (`await asyncio.sleep`).
   - Comprehensive structured logging and friendly user-facing error parsing.
4. **Clean & Responsive UI Design**:
   - Built with **Next.js 14**, **React 18**, and **Tailwind CSS**.
   - Features a **Unified Off-White Sidebar (`#F9FAFB`)** with real-time AWS system badges, a **Stark White Main Canvas (`#FFFFFF`)**, dark typography (`#1F2937`), and an **elevated floating input capsule**.
   - **Page-Level Citations Display**: Interactive white citation cards with exact PDF file names, page numbers, and monospace text snippets (`font-mono`).
   - Interactive **Light Mode / Dark Mode** theme toggle.

---

## 📁 Repository Structure

```text
knowledgehub-ai/
├── backend/
│   ├── app/
│   │   ├── config/settings.py       # Pydantic configuration & AWS credentials resolution
│   │   ├── routers/chat.py          # POST /api/chat SSE streaming endpoint & /api/health
│   │   ├── schemas/chat.py          # Request/Response Pydantic validation schemas
│   │   ├── services/bedrock_service.py # AWS boto3 integration (retrieve & converse_stream) + retry loop
│   │   └── utils/logging.py         # Standardized logging setup
│   └── main.py                      # FastAPI application root & CORS middleware
├── frontend/
│   ├── app/
│   │   ├── layout.tsx               # Next.js root layout with Inter font
│   │   ├── page.tsx                 # Full-featured SSE chat interface with citations & theme switch
│   │   └── globals.css              # Custom Tailwind utilities & micro-animation styles
│   ├── package.json                 # Frontend dependencies & scripts
│   └── .env.local                   # API endpoint configuration (NEXT_PUBLIC_API_URL)
├── scripts/
│   └── verify_kb.py                 # Standalone verification script for AWS Bedrock KB & Nova Lite
├── ARCHITECTURE_DECISIONS.md        # Technical design rationales & architectural trade-offs
├── requirements.txt                 # Backend Python packages
├── .env.example                     # Environment variable template
└── README.md                        # Project documentation
```

---

## 🛠️ Local Setup & Quickstart

### 1. Backend Setup (FastAPI)
1. Open a terminal inside the project folder:
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy `.env.example` to `.env` and configure your AWS credentials:
   ```env
   AWS_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE"
   AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
   AWS_DEFAULT_REGION="us-east-1"
   BEDROCK_KNOWLEDGE_BASE_ID="YOUR_KNOWLEDGE_BASE_ID_HERE"
   BEDROCK_MODEL_ID="amazon.nova-lite-v1:0"
   ```
4. Run the verification script to confirm AWS Bedrock connectivity right from your terminal:
   ```bash
   python scripts/verify_kb.py
   ```
5. Start the FastAPI server on port 8000:
   ```bash
   python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
   ```

### 2. Frontend Setup (Next.js)
1. Open a separate terminal inside `frontend/`:
   ```bash
   cd frontend
   npm install
   ```
2. Check or create `.env.local` to point to your local FastAPI server:
   ```env
   NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api/chat
   ```
3. Start the Next.js development server on port 3000:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to: **http://localhost:3000**

---

## 🚀 Deployment Guide

### Backend Deployment (Render)
1. Create a new **Web Service** on [Render.com](https://render.com) connected to your repository (`https://github.com/NipunaBhanuka18/knowledgehub-ai.git`).
2. Set **Root Directory** to blank (`.` or empty), as the repository root directly contains the `backend/` and `frontend/` folders.
3. Set **Build Command**: `pip install -r requirements.txt`
4. Set **Start Command**: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
5. Add your Environment Variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BEDROCK_KNOWLEDGE_BASE_ID`, `BEDROCK_MODEL_ID`, `AWS_DEFAULT_REGION`).

### Frontend Deployment (Cloudflare Pages)
1. Connect your repository (`https://github.com/NipunaBhanuka18/knowledgehub-ai.git`) to **Cloudflare Pages**.
2. Set **Framework Preset**: `Next.js`
3. Set **Root Directory**: `frontend`
4. Set **Build Command**: `npm run build`
5. Set **Build Output Directory**: `.next`
6. Add the Environment Variable pointing to your live Render backend URL:
   ```env
   NEXT_PUBLIC_API_URL=https://your-backend-service.onrender.com/api/chat
   ```

---

## 🛡️ Verification & Testing
- **API Health Check**: `GET http://127.0.0.1:8000/api/health` returns operational status, region, and Bedrock Knowledge Base ID.
- **End-to-End Chat**: Ask domain questions via the frontend quick-test sample buttons to observe live token streaming and verified page-level citation cards.
