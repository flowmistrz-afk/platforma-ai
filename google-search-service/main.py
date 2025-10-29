import os
import json
import base64
import asyncio

import uvicorn
from fastapi import FastAPI, Request, Response, status
from google.adk.cli.fast_api import get_fast_api_app
from google.cloud import pubsub_v1
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from app.agent import root_agent

# --- Konfiguracja dla Vertex AI ---
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"

# --- Pobranie ścieżki do naszych agentów ---
AGENTS_DIR = os.path.dirname(os.path.abspath(__file__))

# --- Konfiguracja Pub/Sub ---
PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "automatyzacja-pesamu")
QUERY_TOPIC_ID = "search-queries"
RESULTS_TOPIC_ID = "search-results"

publisher = pubsub_v1.PublisherClient()
results_topic_path = publisher.topic_path(PROJECT_ID, RESULTS_TOPIC_ID)

# Inicjalizacja agenta
search_agent = root_agent

# --- Użycie wbudowanego generatora aplikacji ADK ---
app = get_fast_api_app(
    agents_dir=AGENTS_DIR,
    allow_origins=["*"],
    web=True,
)

@app.post("/pubsub")
async def pubsub_receiver(request: Request):
    try:
        envelope = await request.json()
        if not envelope:
            print("No Pub/Sub message received.")
            return Response(status_code=status.HTTP_204_NO_CONTENT)

        # Sprawdź, czy wiadomość pochodzi z Pub/Sub
        if "message" not in envelope:
            print("Invalid Pub/Sub message format.")
            return Response(status_code=status.HTTP_400_BAD_REQUEST)

        pubsub_message = envelope["message"]
        data = base64.b64decode(pubsub_message["data"]).decode("utf-8")
        
        print(f"Received Pub/Sub message: {data}")

        message_data = json.loads(data)
        query = message_data.get("query")
        correlation_id = message_data.get("correlation_id")

        if not query:
            print("Error: Message does not contain a 'query' field.")
            return Response(status_code=status.HTTP_400_BAD_REQUEST)

        print(f"Processing query: {query} with correlation_id: {correlation_id}")
        
        # Inicjalizacja Runnera i SessionService dla każdego zapytania
        session_service = InMemorySessionService()
        # Używamy correlation_id jako session_id, aby zapewnić unikalność
        await session_service.create_session(app_name="google-search-service", user_id="pubsub-user", session_id=correlation_id)
        runner = Runner(agent=search_agent, app_name="google-search-service", session_service=session_service)

        # Wykonaj wyszukiwanie za pomocą agenta za pośrednictwem Runnera
        content = types.Content(role='user', parts=[types.Part(text=query)])
        
        events = runner.run(user_id="pubsub-user", session_id=correlation_id, new_message=content)

        agent_response = ""
        for event in events:
            if event.is_final_response():
                agent_response = event.content.parts[0].text
                break
        
        # Opublikuj wynik w temacie wyników
        result_payload = {
            "correlation_id": correlation_id,
            "results": agent_response
        }
        publisher.publish(results_topic_path, json.dumps(result_payload).encode("utf-8"))
        print(f"Published result for correlation_id: {correlation_id}")

        return Response(status_code=status.HTTP_200_OK)

    except Exception as e:
        print(f"Error processing Pub/Sub message: {e}")
        return Response(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

# Standardowy kod do uruchomienia serwera, kompatybilny z Cloud Run
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
