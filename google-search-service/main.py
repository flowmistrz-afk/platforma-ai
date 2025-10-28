import os
import json
import threading
import time

import uvicorn
from google.adk.cli.fast_api import get_fast_api_app
from google.cloud import pubsub_v1

from app.agent import root_agent

# --- Konfiguracja dla Vertex AI ---
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"

# --- Pobranie ścieżki do naszych agentów ---
AGENTS_DIR = os.path.dirname(os.path.abspath(__file__))

# --- Konfiguracja Pub/Sub ---
PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "automatyzacja-pesamu")
QUERY_TOPIC_ID = "search-queries"
RESULTS_TOPIC_ID = "search-results"
SUBSCRIPTION_ID = "google-search-service-subscription" # Nazwa subskrypcji dla tej usługi

publisher = pubsub_v1.PublisherClient()
subscriber = pubsub_v1.SubscriberClient()

query_topic_path = publisher.topic_path(PROJECT_ID, QUERY_TOPIC_ID)
results_topic_path = publisher.topic_path(PROJECT_ID, RESULTS_TOPIC_ID)
subscription_path = subscriber.subscription_path(PROJECT_ID, SUBSCRIPTION_ID)

# Inicjalizacja agenta
search_agent = root_agent

def callback(message: pubsub_v1.subscriber.message.Message) -> None:
    print(f"Received message: {message.data.decode('utf-8')}")
    
    try:
        message_data = json.loads(message.data.decode('utf-8'))
        query = message_data.get("query")
        correlation_id = message_data.get("correlation_id")

        if not query:
            print("Error: Message does not contain a 'query' field.")
            message.ack()
            return

        print(f"Processing query: {query} with correlation_id: {correlation_id}")
        
        # Wykonaj wyszukiwanie za pomocą agenta
        agent_response = search_agent.run(query)
        
        # Opublikuj wynik w temacie wyników
        result_payload = {
            "correlation_id": correlation_id,
            "results": agent_response
        }
        publisher.publish(results_topic_path, json.dumps(result_payload).encode("utf-8"))
        print(f"Published result for correlation_id: {correlation_id}")

    except Exception as e:
        print(f"Error processing message: {e}")
    finally:
        message.ack()

def run_pubsub_listener():
    # Sprawdź, czy subskrypcja istnieje, jeśli nie, utwórz ją
    try:
        subscriber.get_subscription(request={"subscription": subscription_path})
        print(f"Subscription {SUBSCRIPTION_ID} already exists.")
    except Exception:
        print(f"Creating subscription {SUBSCRIPTION_ID}...")
        subscriber.create_subscription(
            request={
                "name": subscription_path,
                "topic": query_topic_path,
                "ack_deadline_seconds": 10,
            }
        )
        print(f"Subscription {SUBSCRIPTION_ID} created.")

    streaming_pull_future = subscriber.subscribe(subscription_path, callback=callback)
    print(f"Listening for messages on {subscription_path}\n")

    # Blokuj główny wątek, aby subskrybent działał w tle
    # W Cloud Run, główny proces musi nasłuchiwać na porcie HTTP
    # więc ten wątek będzie działał w tle
    try:
        streaming_pull_future.result() # Czekaj na zakończenie subskrypcji (np. przez sygnał)
    except KeyboardInterrupt:
        streaming_pull_future.cancel()
        streaming_pull_future.result()


# --- Użycie wbudowanego generatora aplikacji ADK ---
app = get_fast_api_app(
    agents_dir=AGENTS_DIR,
    allow_origins=["*"],
    web=True,
)

# Standardowy kod do uruchomienia serwera, kompatybilny z Cloud Run
if __name__ == "__main__":
    # Uruchom subskrybenta Pub/Sub w osobnym wątku
    pubsub_thread = threading.Thread(target=run_pubsub_listener)
    pubsub_thread.daemon = True  # Ustaw wątek jako daemon, aby zakończył się z głównym programem
    pubsub_thread.start()

    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
