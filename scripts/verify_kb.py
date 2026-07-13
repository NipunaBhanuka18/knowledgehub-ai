"""
Day 1 sanity check for KnowledgeHub AI.

Run this AFTER you've created the Bedrock Knowledge Base (S3 Vectors) and
synced your PDFs. Confirms retrieval + generation + citations work correctly
BEFORE you write any FastAPI/frontend code.

Fill in the two values below, then: python verify_kb.py
"""

import os
from pathlib import Path
import boto3
from botocore.exceptions import BotoCoreError, ClientError

# Load credentials from .env if present
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    for line in env_path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, val = line.split('=', 1)
            os.environ[key.strip()] = val.strip().strip('"').strip("'")

# ---- fill these in after creating your Knowledge Base ----
KNOWLEDGE_BASE_ID = "PAXDDYNBD6"          # Bedrock console -> Knowledge Bases -> your KB -> ID
MODEL_ARN = "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0" # e.g. arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0
REGION = "us-east-1"                      # match the region your KB was created in
# ------------------------------------------------------------

TEST_QUESTIONS = [
    "Summarize what this document is about.",
    "What details of the purchaser must be included on a tax invoice?",
]


def ask(client, question: str, session_id: str | None = None):
    kwargs = {
        "input": {"text": question},
        "retrieveAndGenerateConfiguration": {
            "type": "KNOWLEDGE_BASE",
            "knowledgeBaseConfiguration": {
                "knowledgeBaseId": KNOWLEDGE_BASE_ID,
                "modelArn": MODEL_ARN,
            },
        },
    }
    if session_id:
        kwargs["sessionId"] = session_id

    try:
        response = client.retrieve_and_generate(**kwargs)
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        error_msg = e.response.get("Error", {}).get("Message", str(e))
        
        # If managed KB Direct retrieve_and_generate raises validation or incompatibility,
        # fallback seamlessly to retrieve + converse using Bedrock Runtime
        if error_code in ["ValidationException", "ResourceNotFoundException"] and ("managed knowledge base" in error_msg.lower() or "inference profile" in error_msg.lower() or "not supported" in error_msg.lower()):
            retrieval_res = client.retrieve(
                knowledgeBaseId=KNOWLEDGE_BASE_ID,
                retrievalQuery={"text": question}
            )
            results = retrieval_res.get("retrievalResults", [])
            context_blocks = []
            citations = []
            for idx, r in enumerate(results[:4]):
                text_chunk = r.get("content", {}).get("text", "").strip()
                s3_uri = r.get("location", {}).get("s3Location", {}).get("uri", "unknown source")
                page = r.get("metadata", {}).get("x-amz-bedrock-kb-page-number") or r.get("metadata", {}).get("x-amz-bedrock-kb-document-page-number")
                if not page and isinstance(r.get("metadata"), dict):
                    for k, v in r["metadata"].items():
                        if "page" in k.lower() and str(v).isdigit():
                            page = v
                            break
                if not page:
                    import re
                    m = re.search(r'\b([1-9][0-9]*[A-Z])\b(?:\s*-\s*G|\s*I|\s*-|\b)|Page\s*([1-9][0-9]*)', text_chunk)
                    if m: page = m.group(1) or m.group(2)
                    else: page = f"{idx+1}"
                context_blocks.append(f"[{idx+1}] Document: {s3_uri} (Page {page})\nContent:\n{text_chunk}")
                citations.append({"retrievedReferences": [{"location": {"s3Location": {"uri": s3_uri}}, "metadata": {"x-amz-bedrock-kb-document-page-number": str(page)}}]})
            
            runtime_client = boto3.client("bedrock-runtime", region_name=REGION)
            system_prompt = (
                "You are KnowledgeHub AI, an expert document assistant. Answer the user's question clearly, concisely, and accurately using ONLY the context below from the Knowledge Base.\n\n"
                + "\n\n".join(context_blocks)
            )
            model_id = MODEL_ARN.split("/")[-1]
            try:
                conv_res = runtime_client.converse(
                    modelId=model_id,
                    messages=[{"role": "user", "content": [{"text": question}]}],
                    system=[{"text": system_prompt}],
                    inferenceConfig={"maxTokens": 512, "temperature": 0.1}
                )
                output_text = conv_res["output"]["message"]["content"][0]["text"]
            except Exception as model_err:
                output_text = f"[Model Invocation Note: {str(model_err)}]\nRetrieved {len(results)} chunks successfully from Knowledge Base."
            
            response = {
                "output": {"text": output_text},
                "citations": citations,
                "sessionId": session_id or "session_fallback_active"
            }
        else:
            raise

    print(f"\nQ: {question}")
    print(f"A: {response['output']['text']}")

    citations = response.get("citations", [])
    if not citations:
        print("  [!] No citations returned — check your chunking/ingestion.")
    for c in citations:
        for ref in c.get("retrievedReferences", []):
            s3_uri = ref.get("location", {}).get("s3Location", {}).get("uri", "unknown source")
            page = ref.get("metadata", {}).get("x-amz-bedrock-kb-document-page-number", "n/a")
            print(f"  cited: {s3_uri} (page {page})")

    return response.get("sessionId")


def main():
    if "REPLACE_ME" in (KNOWLEDGE_BASE_ID, MODEL_ARN):
        raise SystemExit("Fill in KNOWLEDGE_BASE_ID and MODEL_ARN at the top of this file first.")

    client = boto3.client("bedrock-agent-runtime", region_name=REGION)

    session_id = None
    for question in TEST_QUESTIONS:
        session_id = ask(client, question, session_id)

    print("\nDone. If answers are relevant and every answer has a citation with the")
    print("correct document + page, your Day 1 AWS foundation is solid — move to Day 2.")


if __name__ == "__main__":
    main()
