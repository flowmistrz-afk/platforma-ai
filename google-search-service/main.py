# app/main.py
import os
import json
import base64
import asyncio
import uuid  # ← DODANE: dla Web UI

import uvicorn
from fastapi import FastAPI, Request, Response, status
from google.adk.cli.fast_api import get_fast_api_app
from google.cloud import pubsub_v1
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from app.agent import root_agent

# --- Konfiguracja ---
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"
AGENTS_DIR = os.path.dirname(os.path.abspath(__file__))

# --- Pub/Sub ---
PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "automatyzacja-pesamu")
QUERY_TOPIC_ID = "search-queries"
HANDOVER_TOPIC_ID = "agent-handover"
RESULTS_TOPIC_ID = "search-results"

publisher = pubsub_v1.PublisherClient()
results_topic_path = publisher.topic_path(PROJECT_ID, RESULTS_TOPIC_ID)
handover_topic_path = publisher.topic_path(PROJECT_ID, HANDOVER_TOPIC_ID)

search_agent = root_agent

app = get_fast_api_app(
    agents_dir=AGENTS_DIR,
    allow_origins=["*"],
    web=True,
)

@app.post("/pubsub")
async def pubsub_receiver(request: Request):
    try:
        raw_body = await request.body()
        if not raw_body:
            return Response(status_code=status.HTTP_400_BAD_REQUEST, content="Empty body")

        message_data = None

        # Próba 1: Czysty JSON (od Web UI, curl, etc.)
        try:
            message_data = json.loads(raw_body.decode("utf-8"))
            print("Received direct JSON payload")
        except json.JSONDecodeError:
            pass  # Nie JSON → spróbuj Pub/Sub

        # Próba 2: Standardowa koperta Pub/Sub push
        if message_data is None:
            try:
                pubsub_envelope = json.loads(raw_body.decode("utf-8"))
                if "message" in pubsub_envelope and "data" in pubsub_envelope["message"]:
                    data_b64 = pubsub_envelope["message"]["data"]
                    payload = base64.b64decode(data_b64).decode("utf-8")
                    message_data = json.loads(payload)
                    print("Received and decoded Pub/Sub push message")
                else:
                    raise ValueError("Invalid Pub/Sub envelope format")
            except Exception as e:
                print(f"Failed to parse any payload format: {e}")
                return Response(status_code=status.HTTP_400_BAD_REQUEST, content="Invalid payload format")

        if not message_data:
            return Response(status_code=status.HTTP_400_BAD_REQUEST, content="Failed to determine message payload")

        # === UNIWERSALNA OBSŁUGA correlation_id (Twoja genialna poprawka) ===
        if "correlation_id" not in message_data:
            if message_data.get("query"):
                message_data["correlation_id"] = f"webui-{uuid.uuid4().hex[:8]}"
                print(f"[AUTO-ID DEBUG] Generated correlation_id: {message_data['correlation_id']}")
            else:
                print(f"IGNORED: Empty payload with no query: {message_data}")
                return Response(status_code=200, content="Ignored")
        
        correlation_id = message_data["correlation_id"]
        # === KONIEC ===

        message_type = message_data.get("type", "user_query")
        query = message_data.get("query")
        handover_context = message_data.get("handover_context")

        print(f"[{message_type.upper()}] correlation_id: {correlation_id}")

        # --- Sesja i state ---
        session_service = InMemorySessionService()
        await session_service.create_session(
            app_name="google-search-service",
            user_id="pubsub-user",
            session_id=correlation_id
        )

        if message_type == "agent_handover" and handover_context:
            session_service.set_state(correlation_id, {"previous_results": handover_context})

        # --- Uruchom agenta ---
        runner = Runner(
            agent=search_agent,
            app_name="google-search-service",
            session_service=session_service
        )

        # --- Wiadomość wejściowa ---
        if message_type == "agent_handover" and handover_context:
            content_text = handover_context.get("query", query) or query
        else:
            content_text = query

        if not content_text:
            return Response(status_code=status.HTTP_400_BAD_REQUEST, content="Missing query")

        content = types.Content(role='user', parts=[types.Part(text=content_text)])
        events = runner.run(user_id="pubsub-user", session_id=correlation_id, new_message=content)

        # --- Zbierz finalną odpowiedź ---
        agent_response = ""
        async for event in events:
            if event.is_final_response():
                agent_response += event.content.parts[0].text

        if not agent_response.strip():
            return Response(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content="No final response")

        # --- Publikuj wynik ---
        result_payload = {
            "correlation_id": correlation_id,
            "results": agent_response,
            "type": "final_result"
        }

        if message_type == "agent_handover":
            next_topic = message_data.get("next_topic", RESULTS_TOPIC_ID)
            topic_path = publisher.topic_path(PROJECT_ID, next_topic)
        else:
            topic_path = results_topic_path

        publisher.publish(topic_path, json.dumps(result_payload).encode("utf-8"))
        print(f"Published to {topic_path}")

        return Response(status_code=status.HTTP_200_OK)

    except Exception as e:
        print(f"FATAL ERROR in handler: {e}")
        return Response(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

# --- Uruchomienie ---
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
