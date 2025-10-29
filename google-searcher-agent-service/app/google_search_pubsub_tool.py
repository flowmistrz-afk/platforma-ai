import os
import json
import uuid
import threading
from concurrent.futures import Future

from google.cloud import pubsub_v1
from google.adk.tools import FunctionTool

# --- Konfiguracja Pub/Sub ---
PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "automatyzacja-pesamu")
QUERY_TOPIC_ID = "search-queries"
RESULTS_TOPIC_ID = "search-results"

# Subskrypcja dla wyników - musi być unikalna dla każdego agenta, który jej używa
# W środowisku Cloud Run, każda instancja będzie miała swoją subskrypcję
# Możemy użyć nazwy usługi + unikalnego ID instancji, jeśli to konieczne
# Na razie użyjemy prostej nazwy, zakładając, że każda instancja będzie miała swoją
RESULTS_SUBSCRIPTION_ID = "searcher-agent-results-subscription"

publisher = pubsub_v1.PublisherClient()
subscriber = pubsub_v1.SubscriberClient()

query_topic_path = publisher.topic_path(PROJECT_ID, QUERY_TOPIC_ID)
results_topic_path = publisher.topic_path(PROJECT_ID, RESULTS_TOPIC_ID)
results_subscription_path = subscriber.subscription_path(PROJECT_ID, RESULTS_SUBSCRIPTION_ID)

# Słownik do przechowywania przyszłych wyników dla korelacji
pending_requests = {}

def results_callback(message: pubsub_v1.subscriber.message.Message) -> None:
    try:
        message_data = json.loads(message.data.decode('utf-8'))
        correlation_id = message_data.get("correlation_id")
        results = message_data.get("results")

        if correlation_id and correlation_id in pending_requests:
            future = pending_requests.pop(correlation_id) # Usuń z oczekujących
            future.set_result(results)
        else:
            print(f"Received result for unknown or expired correlation_id: {correlation_id}")

    except Exception as e:
        print(f"Error processing results message: {e}")
    finally:
        message.ack()

def start_results_subscriber():
    streaming_pull_future = subscriber.subscribe(results_subscription_path, callback=results_callback)
    print(f"Listening for results on {results_subscription_path}\n")

    try:
        streaming_pull_future.result() # Blokuj wątek, aby subskrybent działał
    except Exception as e:
        print(f"Subscriber for results stopped: {e}")
        streaming_pull_future.cancel()

# Uruchom subskrybenta wyników w osobnym wątku przy starcie modułu
# To zapewni, że będzie nasłuchiwał na wyniki w tle
results_subscriber_thread = threading.Thread(target=start_results_subscriber)
results_subscriber_thread.daemon = True
results_subscriber_thread.start()

def perform_google_search_pubsub(query: str) -> str:
    """
    Wykonuje wyszukiwanie Google za pomocą usługi Google Search Service poprzez Pub/Sub.
    Zwraca wyniki wyszukiwania jako string.
    """
    correlation_id = str(uuid.uuid4())
    future = Future() # Utwórz Future do oczekiwania na wynik
    pending_requests[correlation_id] = future

    message_payload = {
        "query": query,
        "correlation_id": correlation_id
    }

    try:
        # Opublikuj zapytanie
        publish_future = publisher.publish(query_topic_path, json.dumps(message_payload).encode("utf-8"))
        publish_future.result() # Czekaj na potwierdzenie publikacji
        print(f"Published query with correlation_id: {correlation_id}")

        # Czekaj na wynik (z timeoutem)
        result = future.result(timeout=60) # Timeout na 60 sekund
        return result
    except TimeoutError:
        pending_requests.pop(correlation_id, None) # Usuń z oczekujących, jeśli timeout
        return "Błąd: Przekroczono czas oczekiwania na wyniki wyszukiwania Google."
    except Exception as e:
        pending_requests.pop(correlation_id, None)
        return f"Błąd podczas wysyłania zapytania lub odbierania wyników Google Search: {e}"

google_search_pubsub_tool = FunctionTool(
    func=perform_google_search_pubsub,
)
