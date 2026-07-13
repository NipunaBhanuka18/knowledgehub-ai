# KnowledgeHub AI — Architecture Decisions & Trade-Offs (ADR)

This document records the core architectural decisions, design rationales, and engineering trade-offs made during the development of **KnowledgeHub AI**. It serves as a comprehensive reference to explain *"the why behind every major decision"* during code walkthroughs and engineering reviews.

---

## ADR-01: Direct AWS Bedrock Knowledge Base Retrieval vs. Third-Party Vector Databases

### Context
When designing an enterprise RAG (Retrieval-Augmented Generation) pipeline for Sri Lankan tax and legal Gazette PDFs (`2026_2481-22_E.pdf`), we evaluated two primary architectural patterns:
1. Self-hosting or managing an external vector database (e.g., Pinecone, Qdrant, Postgres + pgvector) coupled with custom LangChain/LangGraph orchestration pipelines.
2. Leveraging **Amazon Bedrock Knowledge Bases (S3 Vectors)** with direct AWS SDK integration (`boto3`).

### Decision
We selected **Amazon Bedrock Knowledge Bases (S3 Vectors)** with direct `boto3` retrieval (`bedrock-agent-runtime.retrieve`).

### Rationale & "The Why"
- **Zero Infrastructure Maintenance**: Bedrock Managed Knowledge Bases automatically handle document chunking, embedding generation (Amazon Titan / Cohere), and vector indexing directly inside AWS S3 buckets.
- **Enterprise Security & Compliance**: Documents and vector representations remain strictly inside our AWS Virtual Private Cloud (VPC) / account boundary without syncing sensitive legal/tax data to third-party vector SaaS providers.
- **Performance & Cost Optimization**: Eliminates separate monthly subscription costs for external vector databases and avoids network latency hops between third-party vector stores and AWS inference models.

---

## ADR-02: Two-Step RAG Pattern (`retrieve` + `converse_stream`) vs. `retrieve_and_generate`

### Context
Amazon Bedrock provides a unified `retrieve_and_generate` API that performs both retrieval and LLM generation in a single call. However, we chose to decouple retrieval from generation by explicitly calling `agent_client.retrieve()` followed by `runtime_client.converse_stream()`.

### Decision
We implemented a **Decoupled Two-Step RAG Pattern** via `boto3`.

### Rationale & "The Why"
- **Model Flexibility & Zero-Cost Budget**: The high-level `retrieve_and_generate` API has strict model compatibility constraints and often defaults to higher-cost models (or requires complex `vectorSearchConfiguration` schemas). By decoupling retrieval from inference, we successfully routed inference to **`amazon.nova-lite-v1:0`**, which activates instantly with zero form submissions and costs only $0.00006/1k tokens (keeping our entire demo week completely free within AWS credits).
- **Precise Citation & Page-Level Extraction (Multi-Tiered Fallback)**: Direct `retrieve()` calls return raw chunk metadata and exact S3 URI locations. Importantly, we verified via raw API inspection that Bedrock Knowledge Base default/multimodal ingestion without custom header tags does not inject `x-amz-bedrock-kb-page-number` into `retrievalResults[].metadata`. Rather than allowing citations to fail silently or display `page n/a`, our custom pipeline implements a **multi-tiered extraction algorithm**: it checks `metadata.get('x-amz-bedrock-kb-page-number')` and `metadata.get('x-amz-bedrock-kb-document-page-number')` first, and if absent, inspects the raw chunk text using regex (`re.search(...)`) to extract exact Gazette page and section markers (e.g., `1A`, `2A`, `4A`). This guarantees verifiable page-level attribution sent directly to our UI before token generation begins.
- **Custom Groundedness Prompting**: We inject exact, strict instructions into the system prompt ("Answer accurately using ONLY the context provided below... do not guess or hallucinate"), guaranteeing verifiable answers without black-box agent behavior.

---

## ADR-03: Server-Sent Events (SSE) Protocol vs. WebSockets for Streaming

### Context
To deliver a responsive, real-time UX for token streaming and citation display, we compared **WebSockets** against **Server-Sent Events (SSE)** over HTTP/1.1 and HTTP/2.

### Decision
We adopted **Server-Sent Events (SSE)** over standard HTTP POST (`POST /api/chat`).

### Rationale & "The Why"
- **Unidirectional Fit**: RAG chat interactions are intrinsically unidirectional once the user submits a query (User submits -> Server streams tokens/citations -> Done). WebSockets introduce bi-directional overhead, stateful ping-pong keepalives, and complex reconnection logic that is unnecessary for simple query-response streams.
- **Serverless & Edge Compatibility**: SSE runs over standard HTTP, making it natively compatible with edge proxies, Cloudflare CDN, and serverless hosting environments (Render, AWS Lambda / App Runner) without needing persistent WebSocket connection gateways.
- **Structured Multi-Event Contract**: SSE allows us to emit distinct event types across the exact same HTTP stream:
  - `event: token` -> Chunked text updates
  - `event: citation` -> Structured JSON source citations
  - `event: done` / `event: error` -> Clean lifecycle termination

---

## ADR-04: Stateless Backend & Client-Side Session Tracking vs. Server-Side Memory

### Context
We evaluated whether to store chat conversation history, session state, and document cache inside a server-side database (Postgres, Redis, LangGraph state checkpoints) versus maintaining a stateless backend.

### Decision
We designed a **Stateless FastAPI Service Layer** with client-side session generation and tracking.

### Rationale & "The Why"
- **Horizontal Scalability**: A stateless backend allows FastAPI instances to auto-scale horizontally from 1 to 100 containers without session stickiness or database connection pool exhaustion.
- **Zero External Dependencies**: Complies strictly with the architectural constraint ("No Postgres/Neon/external memory. No LangGraph").
- **Simplicity**: The frontend manages the conversation flow and passes `session_id` (`session_uuid...`), while the backend logs structured activity cleanly per request.

---

## ADR-05: Automatic Retry-Once Loop on Throttling (`429`) vs. Fail-Fast

### Context
During peak inference spikes or shared multi-user demos, AWS Bedrock endpoints may occasionally return temporary rate limit warnings (`ThrottlingException` or `TooManyRequestsException` / `429`).

### Decision
We embedded an explicit **Retry-Once Mechanism (`attempt == 0 -> time.sleep(1.0) -> retry`)** inside our `BedrockAgentService`.

### Rationale & "The Why"
- **Demo & Production Resilience**: If a rate-limit spike happens during a live client presentation, the service catches the `ClientError`, logs a structured warning, pauses briefly for 1 second, and retries seamlessly before ever showing an error message to the end user.
- **Friendly Error Degradation**: If both attempts fail (or if IAM/model permissions are invalid), the exception handler parses the exact AWS `Error.Code` and yields a user-friendly, actionable SSE `error` event instead of a raw 500 stack trace.

---

## ADR-06: Modern High-Contrast White Canvas UI vs. Enclosed Dark Box Dashboard

### Context
The original UI design utilized heavy, enclosed dark containers across both the sidebar and main chat canvas, creating a segmented, visually dense dashboard.

### Decision
We executed a complete visual overhaul to a **Unified Off-White Sidebar (`#F9FAFB`) with a Stark White Main Canvas (`#FFFFFF`)**, complemented by an interactive Light/Dark theme switcher.

### Rationale & "The Why"
- **High Readability & Enterprise Elegance**: Legal and tax document analysis requires clean, high-contrast typography (`#1F2937`) on a spacious white canvas to reduce visual fatigue during long reading sessions.
- **Component Hierarchy**: Soft colored badges (`bg-orange-50`, `bg-blue-50`, `bg-purple-50`) immediately communicate system specifications without cluttering the screen.
- **Interactive Verification**: Clean white citation cards with delicate shadows (`0 1px 3px rgba(0,0,0,0.05)`) and monospace code/text boxes (`font-mono`) invite users to verify exact excerpts, reinforcing trust in the AI's outputs.
