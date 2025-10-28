# Modyfikacje związane z komunikacją Pub/Sub

## Cel
Celem tych modyfikacji jest umożliwienie asynchronicznej komunikacji między agentami działającymi w oddzielnych kontenerach Docker, wykorzystując Google Cloud Pub/Sub. W szczególności chodzi o komunikację między głównym agentem (`google-searcher-agent-service`) a wyspecjalizowaną usługą wyszukiwania Google (`google-search-service`).

## Co zostało zrobione

### 1. Utworzenie tematów Google Cloud Pub/Sub
Utworzono dwa tematy Pub/Sub, które służą do wymiany wiadomości:
-   **`search-queries`**: Temat, do którego główny agent będzie publikował zapytania wyszukiwania.
-   **`search-results`**: Temat, do którego usługa `google-search-service` będzie publikować wyniki wyszukiwania.

### 2. Modyfikacja i wdrożenie `google-search-service`
Usługa `google-search-service` została zrefaktoryzowana, aby działać jako subskrybent i wydawca Pub/Sub, jednocześnie utrzymując serwer HTTP dla kontroli stanu Cloud Run.
-   **`requirements.txt`**: Dodano zależność `google-cloud-pubsub`.
-   **`main.py`**: 
    -   Usunięto bezpośrednie uruchamianie serwera Uvicorn jako głównego procesu.
    -   Zaimplementowano logikę subskrypcji tematu `search-queries`.
    -   Zaimplementowano logikę publikacji wyników do tematu `search-results`.
    -   Zintegrowano agenta ADK (`root_agent` z `app/agent.py`) do przetwarzania zapytań z Pub/Sub.
    -   Uruchomiono subskrybenta Pub/Sub w osobnym wątku, aby działał równolegle z serwerem FastAPI/Uvicorn, który odpowiada za nasłuchiwanie na porcie 8080 (wymagane przez Cloud Run do kontroli stanu).
-   **Wdrożenie**: Zaktualizowany obraz Docker usługi `google-search-service` został zbudowany i wdrożony w Cloud Run.

## Jak korzystać z Pub/Sub (dla `google-searcher-agent-service`)

### Wysyłanie zapytań do `google-search-service`
Aby wysłać zapytanie wyszukiwania do `google-search-service`, główny agent (`google-searcher-agent-service`) powinien opublikować wiadomość w temacie `search-queries`. Wiadomość powinna być w formacie JSON i zawierać:
-   `query` (string): Treść zapytania wyszukiwania.
-   `correlation_id` (string): Unikalny identyfikator, który pozwoli skorelować zapytanie z odpowiedzią.

Przykład publikacji wiadomości (w Pythonie):
```python
import json
import uuid
from google.cloud import pubsub_v1

project_id = "automatyzacja-pesamu"
topic_id = "search-queries"
publisher = pubsub_v1.PublisherClient()
topic_path = publisher.topic_path(project_id, topic_id)

query = "najnowsze wiadomości o Gemini AI"
correlation_id = str(uuid.uuid4())

message_payload = {
    "query": query,
    "correlation_id": correlation_id
}

future = publisher.publish(topic_path, json.dumps(message_payload).encode("utf-8"))
print(f"Opublikowano wiadomość z ID: {future.result()}")
```

### Odbieranie wyników z `google-search-service`
Wyniki wyszukiwania będą publikowane przez `google-search-service` w temacie `search-results`. Główny agent będzie musiał subskrybować ten temat i oczekiwać na wiadomość z pasującym `correlation_id`.

Wiadomość z wynikami będzie również w formacie JSON i będzie zawierać:
-   `correlation_id` (string): Identyfikator zapytania, do którego odnosi się wynik.
-   `results` (string): Wyniki wyszukiwania zwrócone przez `google-search-service`.

Implementacja odbioru wyników będzie wymagała stworzenia subskrypcji dla tematu `search-results` i mechanizmu do dopasowywania `correlation_id` (np. słownika przechowującego oczekujące zapytania).

## Następne kroki

Kolejnym krokiem jest modyfikacja usługi `google-searcher-agent-service` (głównego agenta), aby wykorzystywała powyższe mechanizmy Pub/Sub do komunikacji z `google-search-service`. Będzie to obejmować:
1.  Dodanie `google-cloud-pubsub` do `requirements.txt` w `google-searcher-agent-service`.
2.  Stworzenie niestandardowego narzędzia, które będzie publikować zapytania i oczekiwać na wyniki.
3.  Zintegrowanie tego narzędzia z `root_agent` w `google-searcher-agent-service/app/agent.py`.
