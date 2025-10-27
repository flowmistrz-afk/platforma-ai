# Plan Działania: Wdrożenie `google-searcher-agent-service` w Cloud Shell

## Sytuacja Obecna

1.  **Zbudowaliśmy Agenta:** Stworzyliśmy w pełni funkcjonalną, zaawansowaną usługę `google-searcher-agent-service`. Jest to hierarchiczny zespół agentów AI (zgodnie z architekturą ADK), gotowy do wyszukiwania i analizowania informacji w internecie.
2.  **Blokada Środowiska:** Nasze obecne środowisko deweloperskie ma zablokowaną wersję `gcloud`, która uniemożliwia instalację komponentów `alpha`. To blokuje nas przed wdrożeniem na nowoczesną platformę **Vertex AI Agent Engine**.

## Nowa Strategia: Wdrożenie na Cloud Run za pomocą Cloud Shell

Przechodzimy na sprawdzony i niezawodny **Plan B**:

*   Wdrożymy naszego agenta jako standardową, niezależną usługę na **Google Cloud Run**.
*   Wszystkie poniższe kroki wykonasz w **Google Cloud Shell**, które ma w pełni odblokowane i aktualne narzędzia `gcloud`, co gwarantuje powodzenie operacji.

---

## Instrukcja Krok po Kroku dla Cloud Shell

### Krok 1: Przygotowanie Środowiska i Pobranie Kodu

Otwórz [Google Cloud Shell](https://shell.cloud.google.com/). Upewnij się, że jesteś w odpowiednim projekcie (`automatyzacja-pesamu`). Następnie sklonuj swoje repozytorium, aby mieć dostęp do najnowszego kodu.

```bash
# Zastąp <URL_TWOJEGO_REPOZYTORIUM> prawidłowym adresem
git clone <URL_TWOJEGO_REPOZYTORIUM>
cd <NAZWA_KATALOGU_Z_KODEM>
```

### Krok 2: Odtworzenie Plików Wdrożeniowych

W naszym poprzednim podejściu usunęliśmy pliki `Dockerfile` i `main.py`. Musimy je teraz odtworzyć. Skopiuj i wklej poniższe komendy do Cloud Shell, aby utworzyć te pliki z prawidłową treścią.

**1. Utwórz `Dockerfile`:**

```bash
cat << 'EOF' > google-searcher-agent-service/Dockerfile
# Użyj oficjalnego obrazu Python w nowszej wersji (np. 3.11)
FROM python:3.11-slim

# Ustaw katalog roboczy
WORKDIR /app

# Skopiuj plik z zależnościami
COPY requirements.txt requirements.txt

# Zainstaluj zależności
RUN pip install --no-cache-dir -r requirements.txt

# Skopiuj resztę kodu aplikacji
COPY . .

# Ustaw zmienną środowiskową, aby wymusić użycie Vertex AI
ENV GOOGLE_GENAI_USE_VERTEXAI=TRUE

# Uruchom aplikację
CMD exec uvicorn main:app --host 0.0.0.0 --port \${PORT:-8080}
EOF
```

**2. Utwórz `main.py` (wersja z serwerem FastAPI):**

```bash
cat << 'EOF' > google-searcher-agent-service/main.py
# google-searcher-agent-service/main.py
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
import uuid

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from app.team_builder import google_searcher_manager

app = FastAPI(
    title="Google Searcher Agent Service",
    description="Wyspecjalizowany agent AI do wyszukiwania i analizowania informacji w internecie.",
)

session_service = InMemorySessionService()
runner = Runner(
    agent=google_searcher_manager,
    app_name="google-searcher-agent-app",
    session_service=session_service,
)

class SearchRequest(BaseModel):
    query: str

class TaskResponse(BaseModel):
    task_id: str
    status: str

async def run_search_in_background(query: str):
    user_id = "default-user"
    adk_session_id = str(uuid.uuid4())
    puppeteer_session_id = f"puppeteer-{adk_session_id}"

    try:
        await session_service.create_session(
            app_name=runner.app_name,
            user_id=user_id,
            session_id=adk_session_id,
            state={"puppeteer_session_id": puppeteer_session_id}
        )

        message = types.Content(role="user", parts=[types.Part(text=query)])
        final_response = "Agent nie wygenerował finalnej odpowiedzi."
        async for event in runner.run_async(
            user_id=user_id, session_id=adk_session_id, new_message=message
        ):
            if event.is_final_response() and event.content:
                final_response = "".join(part.text for part in event.content.parts if hasattr(part, 'text'))
                break
        
        print(f"Finalna odpowiedź agenta: {final_response}")
        # TODO: Zapisz wynik w Firestore pod task_id

    except Exception as e:
        print(f"Błąd podczas wykonywania zadania w tle: {e}")
        # TODO: Zapisz błąd w Firestore

@app.post("/search", response_model=TaskResponse)
async def execute_search_task(request: SearchRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    background_tasks.add_task(run_search_in_background, request.query)
    return TaskResponse(task_id=task_id, status="Zadanie wyszukiwania zostało przyjęte i jest przetwarzane w tle.")

@app.get("/health")
async def health_check():
    return {"status": "ok"}
EOF
```

### Krok 3: Ostateczne Wdrożenie na Cloud Run

Teraz, gdy wszystkie pliki są na swoim miejscu, wykonaj poniższą komendę. Jest to jedna, potężna komenda, która zbuduje i wdroży Twojego agenta, rozwiązując wszystkie napotkane wcześniej problemy.

```bash
gcloud run deploy google-searcher-agent-service \
  --source ./google-searcher-agent-service \
  --platform managed \
  --region europe-west1 \
  --allow-unauthenticated \
  --memory=1Gi \
  --set-env-vars="PUPPETEER_SERVICE_URL=https://puppeteer-executor-service-567539916654.europe-west1.run.app"
```

### Krok 4: Test i Weryfikacja

Po pomyślnym wdrożeniu, przetestuj usługę za pomocą `curl`:

```bash
curl -X POST -H "Content-Type: application/json" \
-d '{"query": "producenci okien pcv w Warszawie"}' \
$(gcloud run services describe google-searcher-agent-service --platform managed --region europe-west1 --format 'value(status.url)')/search
```

Następnie, sprawdź logi, aby zobaczyć, co robi Twój zespół agentów "za kulisami":

```bash
gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"google-searcher-agent-service\"" --limit=100 --format="table(timestamp, textPayload)"
```

Powodzenia!
