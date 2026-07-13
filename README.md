# KnowledgeHub AI — AWS Bedrock Document Assistant

KnowledgeHub AI is a production-grade, AWS-native document question-answering and compliance assistant designed for enterprise PDF ingestion, retrieval, and citation verification.

Built on **Amazon Bedrock Knowledge Bases (S3 Vectors)** and powered by **Amazon Nova Lite / Anthropic Claude**, the application streams tokens, snippets, and page-level citations to a modern **Next.js** web interface via **FastAPI Server-Sent Events (SSE)**.

---

## 🌟 Key Features & Architectural Highlights

1. **AWS-Native RAG Pipeline**:
   - Uses **Amazon Bedrock Agent Runtime** (`retrieve` API) to query pre-indexed S3 Vector embeddings without requiring third-party vector databases or orchestrators.
   - Grounded system prompts ensure the model strictly answers from retrieved Gazette context, eliminating external hallucinations.
2. **Server-Sent Events (SSE) Streaming**:
   - Stateless **FastAPI** backend streams individual token chunks (`event: token`), document citations (`event: citation`), and lifecycle signals (`event: done`, `event: error`) in real-time.
3. **Resilient Cloud Engineering**:
   - Implements **automatic retry-once mechanism on AWS API throttling** (`ThrottlingException` / `429 TooManyRequestsException`) during both retrieval and model generation.
   - Comprehensive structured logging and friendly user-facing error parsing.
4. **Stunning & Clean UI Design**:
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
│   │   └── utils/logging.py         # Standardized enterprise logging setup
│   └── main.py                      # FastAPI application root & CORS middleware
├── frontend/
│   ├── app/
│   │   ├── layout.tsx               # Next.js root layout with modern Inter font
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
1. Open a terminal inside the `knowledgehub-ai/` folder:
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
3. Copy `.env.example` to `.env` and set your AWS credentials:
   ```env
   AWS_ACCESS_KEY_ID=AKIA...
   AWS_SECRET_ACCESS_KEY=QTez...
   AWS_DEFAULT_REGION=us-east-1
   BEDROCK_KNOWLEDGE_BASE_ID=PAXDDYNBD6
   BEDROCK_MODEL_ID=amazon.nova-lite-v1:0
   ```
4. Run the verification script to test AWS Bedrock connectivity right from your terminal:
   ```bash
   python scripts/verify_kb.py
   ```
5. Start the FastAPI server on port 8000:
   ```bash
   python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
   ```

### 2. Frontend Setup (Next.js)
1. Open a separate terminal inside `knowledgehub-ai/frontend`:
   ```bash
   cd frontend
   npm install
   ```
2. Check or create `.env.local` to point to your FastAPI server:
   ```env
   NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api/chat
   ```
3. Start the Next.js development server on port 3000:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to: **http://localhost:3000**

---

## 🚀 Deployment Guide (Day 4 Roadmap)

### Backend Deployment (Render)
1. Create a new **Web Service** on [Render.com](https://render.com) connected to your repository.
2. Set **Root Directory** to `knowledgehub-ai` (if monorepo) or deploy `backend/` directly.
3. Set **Build Command**: `pip install -r requirements.txt`
4. Set **Start Command**: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
5. Add your Environment Variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BEDROCK_KNOWLEDGE_BASE_ID`, `BEDROCK_MODEL_ID`, `AWS_DEFAULT_REGION`).

### Frontend Deployment (Cloudflare Pages)
1. Connect your repository to **Cloudflare Pages**.
2. Set **Root Directory** to `knowledgehub-ai/frontend`.
3. Set **Build Command**: `npm run build`
4. Set **Build Output Directory**: `.next`
5. Add the Environment Variable pointing to your Render backend URL:
   ```env
   NEXT_PUBLIC_API_URL=https://your-backend-service.onrender.com/api/chat
   ```

---

## 🛡️ Verification & Testing
- **API Health Check**: `GET http://127.0.0.1:8000/api/health` returns operational status, region, and Bedrock Knowledge Base ID.
- **End-to-End Chat**: Ask legal/tax questions via the frontend quick-test sample buttons to observe live token streaming and verified document citation cards.
