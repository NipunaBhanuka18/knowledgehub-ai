import json
import uuid
import boto3
from botocore.exceptions import BotoCoreError, ClientError
from typing import Generator, Optional, AsyncGenerator
from app.config.settings import settings
from app.utils.logging import logger

class BedrockAgentService:
    def __init__(self):
        self._agent_client = None
        self._runtime_client = None

    @property
    def agent_client(self):
        if self._agent_client is None:
            self._agent_client = boto3.client(
                'bedrock-agent-runtime',
                region_name=settings.AWS_DEFAULT_REGION,
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID or None,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY or None
            )
        return self._agent_client

    @property
    def runtime_client(self):
        if self._runtime_client is None:
            self._runtime_client = boto3.client(
                'bedrock-runtime',
                region_name=settings.AWS_DEFAULT_REGION,
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID or None,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY or None
            )
        return self._runtime_client

    def format_sse(self, event_type: str, data: dict) -> str:
        """Format an SSE event matching exact contract in project plan §8."""
        return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"

    async def stream_answer(self, message: str, session_id: Optional[str] = None) -> AsyncGenerator[str, None]:
        if not settings.BEDROCK_KNOWLEDGE_BASE_ID:
            yield self.format_sse("error", {
                "message": "AWS Bedrock Knowledge Base ID is missing. Please set BEDROCK_KNOWLEDGE_BASE_ID in .env."
            })
            return

        model_arn = settings.BEDROCK_MODEL_ID
        active_session_id = session_id.strip() if session_id and session_id.strip() else f"session_{uuid.uuid4().hex[:12]}"

        import re
        msg_clean = re.sub(r'[^a-zA-Z0-9\s]', '', message.lower()).strip()
        conversational_phrases = {
            'hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening',
            'how are you', 'howdy', 'yo', 'thanks', 'thank you', 'bye', 'goodbye',
            'test', 'ping', 'who are you', 'what can you do', 'help', 'ok', 'okay',
            'hi there', 'hello there', 'hey there', 'hi bro', 'hello bro', 'hi ai', 'hello ai'
        }
        is_greeting = (
            msg_clean in conversational_phrases
            or any(msg_clean.startswith(w + " ") for w in ['hi', 'hello', 'hey', 'good morning', 'thanks', 'thank you', 'bye'])
            or len(msg_clean) <= 3
        )

        context_blocks = []
        citations_list = []
        emitted_keys = set()

        try:
            if is_greeting:
                logger.info(f"Conversational input detected ('{msg_clean}'). Bypassing Bedrock KB vector retrieval.")
                system_prompt = (
                    "You are KnowledgeHub AI, a helpful and professional AWS-native document assistant powered by Amazon Bedrock Knowledge Bases and Anthropic Claude.\n"
                    "The user is greeting you or making casual conversation. Respond warmly, politely, and briefly. Welcome them and invite them to ask any questions about their indexed legal, tax, or Gazette PDF documents."
                )
            else:
                try:
                    logger.info(f"Initiating AWS Bedrock retrieval for query: '{message[:50]}...' (Session: {active_session_id})")
                    retrieval_response = None
                    for attempt in range(2):
                        try:
                            retrieval_response = self.agent_client.retrieve(
                                knowledgeBaseId=settings.BEDROCK_KNOWLEDGE_BASE_ID,
                                retrievalQuery={'text': message}
                            )
                            break
                        except ClientError as ce:
                            err_code = ce.response.get('Error', {}).get('Code', '')
                            if attempt == 0 and err_code in ['ThrottlingException', 'TooManyRequestsException', '429']:
                                logger.warning(f"Throttling encountered during retrieval ({err_code}). Retrying once asynchronously after 1 second...")
                                import asyncio; await asyncio.sleep(1.0)
                                continue
                            raise

                    retrieval_results = retrieval_response.get('retrievalResults', []) if retrieval_response else []

                    for idx, res in enumerate(retrieval_results[:4]):
                        text_chunk = res.get('content', {}).get('text', '').strip()
                        if not text_chunk:
                            continue

                        # Filter out low-relevance chunks if Bedrock returns a similarity score < 0.35
                        score = res.get('score', 1.0)
                        if score < 0.35:
                            logger.info(f"Skipping retrieved chunk due to low relevance score ({score:.4f}): {text_chunk[:40]}...")
                            continue

                        location = res.get('location', {})
                        s3_uri = location.get('s3Location', {}).get('uri', 'document.pdf')
                        filename = s3_uri.split('/')[-1] if '/' in s3_uri else s3_uri

                        metadata = res.get('metadata', {})
                        page_num = metadata.get('x-amz-bedrock-kb-page-number') or metadata.get('x-amz-bedrock-kb-document-page-number')
                        if not page_num and isinstance(metadata, dict):
                            for k, v in metadata.items():
                                if 'page' in k.lower() and str(v).isdigit():
                                    page_num = v
                                    break
                        if not page_num:
                            m = re.search(r'\b([1-9][0-9]*[A-Z])\b(?:\s*-\s*G|\s*I|\s*-|\b)|Page\s*([1-9][0-9]*)', text_chunk)
                            if m: page_num = m.group(1) or m.group(2)
                            else: page_num = f"{idx+1}"

                        context_blocks.append(f"[{idx+1}] Document: {filename} (Page {page_num})\nContent:\n{text_chunk}")
                        
                        cite_key = f"{filename}_{page_num}_{text_chunk[:40]}"
                        if cite_key not in emitted_keys:
                            emitted_keys.add(cite_key)
                            citations_list.append({
                                "document": filename,
                                "page": page_num,
                                "snippet": text_chunk
                            })

                    system_prompt = (
                        "You are KnowledgeHub AI, an AWS-native document compliance and question-answering assistant.\n"
                        "Answer the user's question accurately, clearly, and concisely using ONLY the context provided below from the indexed Knowledge Base.\n"
                        "If the answer cannot be found in the context below, clearly state that the document does not contain this information. Do not guess or hallucinate outside the context.\n\n"
                        "--- RETRIEVED KNOWLEDGE BASE CONTEXT ---\n"
                        + ("\n\n".join(context_blocks) if context_blocks else "No relevant document chunks found.")
                    )
                except Exception as e:
                    logger.error(f"Error during Bedrock KB retrieval: {str(e)}", exc_info=True)
                    system_prompt = (
                        "You are KnowledgeHub AI. An error occurred while retrieving document context from the vector knowledge base. Inform the user gracefully."
                    )

            # 3. Stream tokens from Amazon Bedrock Runtime (with retry-once on throttling)
            logger.info(f"Streaming generation with Bedrock model: {model_arn}")
            converse_response = None
            for attempt in range(2):
                try:
                    converse_response = self.runtime_client.converse_stream(
                        modelId=model_arn,
                        messages=[{"role": "user", "content": [{"text": message}]}],
                        system=[{"text": system_prompt}],
                        inferenceConfig={"temperature": 0.1, "maxTokens": 1024}
                    )
                    break
                except ClientError as ce:
                    err_code = ce.response.get('Error', {}).get('Code', '')
                    if attempt == 0 and err_code in ['ThrottlingException', 'TooManyRequestsException', '429']:
                        logger.warning(f"Throttling encountered during converse_stream ({err_code}). Retrying once asynchronously after 1 second...")
                        import asyncio; await asyncio.sleep(1.0)
                        continue
                    raise

            stream = converse_response.get('stream') if converse_response else None
            if not stream:
                yield self.format_sse("error", {"message": "No response stream received from Bedrock model service."})
                return

            for event in stream:
                if 'contentBlockDelta' in event:
                    delta_text = event['contentBlockDelta'].get('delta', {}).get('text', '')
                    if delta_text:
                        yield self.format_sse("token", {"text": delta_text})
                        import asyncio; await asyncio.sleep(0)  # Yield control to event loop

            # 4. Yield Citations after token generation completes
            for cite in citations_list:
                yield self.format_sse("citation", cite)
                import asyncio; await asyncio.sleep(0)

            logger.info(f"Stream completed successfully for session: {active_session_id}")
            yield self.format_sse("done", {"session_id": active_session_id})

        except (BotoCoreError, ClientError) as e:
            logger.error(f"AWS Bedrock API Error: {str(e)}")
            error_code = getattr(e, 'response', {}).get('Error', {}).get('Code', '') if hasattr(e, 'response') else ''
            friendly_msg = "Temporary AWS service throttling or connectivity error. Please try again in a few moments."
            
            if error_code in ['ResourceNotFoundException', 'ValidationException', 'AccessDeniedException']:
                friendly_msg = f"AWS Bedrock Model/KB Error ({error_code}). Please verify model access in AWS Console or check IAM keys."
                if 'use case details' in str(e).lower() or 'legacy' in str(e).lower():
                    friendly_msg = "Anthropic model access pending: Please submit the brief Anthropic use case details form in your AWS Bedrock console."
            
            yield self.format_sse("error", {"message": friendly_msg})
        except Exception as e:
            logger.error(f"Unexpected error in Bedrock streaming: {str(e)}", exc_info=True)
            yield self.format_sse("error", {
                "message": "An unexpected error occurred while processing your request with KnowledgeHub AI."
            })

bedrock_service = BedrockAgentService()
