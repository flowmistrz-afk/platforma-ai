# Plan Rozwoju: Dziennik Zdarzeń Agenta w Czasie Rzeczywistym

## 1. Cel

Głównym celem jest przywrócenie funkcjonalności, która pozwala użytkownikowi na bieżąco śledzić postępy pracy Agenta Pro Max. Chcemy stworzyć "dziennik zdarzeń" (event log), który w czasie rzeczywistym będzie wyświetlał w interfejsie użytkownika kluczowe informacje o tym, co robi "mózg" (orkiestrator) i jak komunikuje się z "pracownikami" (narzędziami).

Dzięki temu użytkownik będzie dokładnie wiedział, na jakim etapie jest zadanie, co znacząco poprawi jego doświadczenie i zwiększy zaufanie do systemu.

## 2. Wykorzystane Technologie

- **Backend (Python)**:
    - **Google Agent Development Kit (ADK)**: Będziemy korzystać z wbudowanego w ADK systemu logowania, aby przechwytywać szczegółowe informacje o jego pracy (prompty, wywołania narzędzi, odpowiedzi).
    - **Python `logging` module**: Użyjemy go do stworzenia niestandardowego handlera, który będzie przekierowywał logi do bazy danych.
    - **FastAPI**: Nasz serwer webowy, który będzie zarządzał zadaniami w tle.
    - **Google Cloud Firestore**: Nasza baza danych NoSQL, w której będziemy przechowywać logi w czasie rzeczywistym. Będziemy używać operacji `ArrayUnion` do atomowego dodawania nowych wpisów do dziennika.

- **Frontend (React/TypeScript)**:
    - **React**: Nasza biblioteka do budowy interfejsu.
    - **Firebase SDK (v9+)**: Użyjemy funkcji `onSnapshot` do nasłuchiwania na zmiany w dokumencie zadania w czasie rzeczywistym.
    - **React Bootstrap**: Wykorzystamy komponenty takie jak `Card` i `ListGroup` do estetycznego wyświetlenia dziennika zdarzeń.

## 3. Plan Modyfikacji

### Krok 1: Modyfikacja Backendu (`agent-pro-max-service/main.py`)

1.  **Stworzenie `FirestoreHandler`**: Zdefiniujemy nową klasę dziedziczącą po `logging.Handler`. Jej zadaniem będzie formatowanie logów i zapisywanie ich do pola `progressLog` (typu Array) w odpowiednim dokumencie w Firestore.
2.  **Konfiguracja `logging`**: Ustawimy globalny poziom logowania na `DEBUG`, aby przechwytywać jak najwięcej szczegółów z działania ADK.
3.  **Integracja z `run_agent_in_background`**:
    - Na początku tej funkcji będziemy tworzyć instancję `FirestoreHandler` z `task_id` bieżącego zadania.
    - Będziemy dodawać ten handler do głównego loggera.
    - W bloku `finally` zapewnimy, że handler jest zawsze usuwany po zakończeniu zadania (niezależnie od tego, czy zakończyło się sukcesem, czy błędem), aby uniknąć "przeciekania" logów między zadaniami.
4.  **Inicjalizacja pola `progressLog`**: W głównym endpoincie `/execute`, podczas tworzenia dokumentu zadania, dodamy nowe, puste pole `progressLog: []`.

### Krok 2: Modyfikacja Frontendu (`src/pages/AgentProMaxResultsPage.tsx`)

1.  **Rozszerzenie `TaskData`**: Zaktualizujemy interfejs `TaskData`, dodając opcjonalne pole `progressLog?: string[]`.
2.  **Dodanie nowego stanu**: Stworzymy nowy stan `const [logs, setLogs] = useState<string[]>([]);` do przechowywania logów.
3.  **Aktualizacja `useEffect`**: Wewnątrz istniejącego `onSnapshot` będziemy odczytywać pole `data.progressLog` i aktualizować stan `logs`.
4.  **Stworzenie nowej sekcji UI**: Dodamy nowy komponent (np. `<Card>`) o nazwie "Dziennik Zdarzeń", który będzie wyświetlał zawartość stanu `logs` w formie listy (`<ListGroup>`). Komponent ten będzie widoczny przez cały czas trwania zadania.

Nie przewidujemy modyfikacji w plikach `orchestrator.py`, `Dockerfile` ani `requirements.txt` (ponieważ `google-cloud-firestore` jest już zainstalowane).

---

## 4. Aktualna Zawartość Modyfikowanych Plików

### `agent-pro-max-service/main.py` (stan początkowy)
```python
# main.py
import os
import uuid
import traceback
import json
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Optional

# --- NOWE IMPORTY DLA CORS ---
from fastapi.middleware.cors import CORSMiddleware

# --- NOWE IMPORTY DLA FIRESTORE ---
from google.cloud import firestore

from google.genai import types
from app.orchestrator import runner, USER_ID, APP_NAME

# --- Inicjalizacja klienta Firestore ---
db = firestore.Client(project="automatyzacja-pesamu")

# Model danych, który DOKŁADNIE odpowiada temu, co wysyła frontend
class UserRequest(BaseModel):
    query: str
    city: Optional[str] = None
    province: Optional[str] = None
    radius: Optional[int] = 0
    selectedPkdSection: Optional[str] = None
    selectedPkdCodes: Optional[List[str]] = []

app = FastAPI(
    title="Agent Pro Max Service (v2 - Modern ADK)",
    description="Serwis hostujący 'Mózg' (Orchestrator) zbudowany w oparciu o zmodernizowany Google ADK.",
)

# --- KONFIGURACJA CORS ---
origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- FUNKCJA WYKONYWANA W TLE ---
async def run_agent_in_background(task_id: str, request_data: dict):
    doc_ref = db.collection("tasks").document(task_id)
    session_id = str(uuid.uuid4())
    final_response = "Agent did not produce a final response."

    try:
        await runner.session_service.create_session(
            app_name=APP_NAME, user_id=USER_ID, session_id=session_id
        )
        
        prompt_parts = [f'Użytkownik szuka: "{request_data["query"]}".']
        if request_data.get("city") and request_data.get("province"):
            prompt_parts.append(f'Lokalizacja: {request_data["city"]}, {request_data["province"]} (promień: {request_data["radius"]} km).')
            
        if request_data.get("selectedPkdCodes"):
            prompt_parts.append(f"Użytkownik sam wybrał następujące kody PKD: {', '.join(request_data['selectedPkdCodes'])}.")
        else:
            prompt_parts.append("Użytkownik NIE wybrał kodów PKD.")

        initial_prompt = " ".join(prompt_parts)
        message = types.Content(role="user", parts=[types.Part(text=initial_prompt)])

        async for event in runner.run_async(
            user_id=USER_ID,
            session_id=session_id,
            new_message=message
        ):
            if event.is_final_response():
                if event.content and event.content.parts:
                    final_response = "".join(part.text for part in event.content.parts if hasattr(part, 'text'))
                break
        
        doc_ref.set({
            "status": "completed",
            "response": {"session_id": session_id, "response": final_response},
            "timestamp": firestore.SERVER_TIMESTAMP
        }, merge=True)

    except Exception as e:
        error_msg = f"An error occurred during agent execution: {str(e)}"
        traceback.print_exc()
        doc_ref.set({
            "status": "failed",
            "error": error_msg,
            "timestamp": firestore.SERVER_TIMESTAMP
        }, merge=True)

# --- GŁÓWNY ENDPOINT (ASYNCHRONICZNY) ---
@app.post("/execute")
async def execute_agent_task(request: UserRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    
    try:
        doc_ref = db.collection("tasks").document(task_id)
        doc_ref.set({
            "status": "processing",
            "request": request.model_dump(),
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        
        background_tasks.add_task(run_agent_in_background, task_id, request.model_dump())
        
        return {"task_id": task_id, "status": "Task accepted and is being processed."}
    
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to create task in Firestore: {str(e)}")

@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
```

### `src/pages/AgentProMaxResultsPage.tsx` (stan początkowy)
```typescript
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Container, Card, Spinner, Alert, ListGroup } from 'react-bootstrap';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase'; // Upewnij się, że masz poprawną ścieżkę do konfiguracji Firebase

// Definicja typów dla danych z Firestore
interface TaskData {
    status: 'processing' | 'completed' | 'failed';
    request?: any;
    response?: {
        session_id: string;
        response: string;
    };
    error?: string;
    timestamp?: any;
}

// Prosty parser do wyciągania danych z odpowiedzi agenta
const parseAgentResponse = (responseText: string) => {
    try {
        // To jest bardzo uproszczony parser. W przyszłości można go rozbudować,
        // jeśli agent będzie zwracał JSON lub bardziej złożone struktury.
        const sections = responseText.split('###').filter(s => s.trim() !== '');
        return sections.map((section, index) => {
            const lines = section.trim().split('\n');
            const name = lines[0].replace('Nazwa Firmy:', '').trim();
            const details = lines.slice(1).map(line => line.trim());
            return { id: index, name, details };
        });
    } catch (error) {
        console.error("Błąd parsowania odpowiedzi agenta:", error);
        return [{ id: 'raw', name: "Odpowiedź agenta", details: [responseText] }];
    }
};


const AgentProMaxResultsPage = () => {
    const { taskId } = useParams<{ taskId: string }>();
    const [taskData, setTaskData] = useState<TaskData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!taskId) {
            setError("Nie znaleziono ID zadania w adresie URL.");
            setLoading(false);
            return;
        }

        const docRef = doc(db, 'tasks', taskId);

        // Ustawienie nasłuchiwania na zmiany w dokumencie (real-time)
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as TaskData;
                setTaskData(data);
                
                // Zakończ ładowanie, jeśli status nie jest już 'processing'
                if (data.status !== 'processing') {
                    setLoading(false);
                }
            } else {
                setError("Nie znaleziono zadania o podanym ID w bazie danych.");
                setLoading(false);
            }
        }, (err) => {
            console.error("Błąd podczas nasłuchiwania na zmiany w zadaniu:", err);
            setError("Wystąpił błąd podczas pobierania danych o zadaniu.");
            setLoading(false);
        });

        // Funkcja czyszcząca - zakończ nasłuchiwanie, gdy komponent jest odmontowywany
        return () => unsubscribe();

    }, [taskId]); // Efekt będzie uruchamiany ponownie, tylko jeśli zmieni się taskId

    const renderContent = () => {
        if (loading || (taskData && taskData.status === 'processing')) {
            return (
                <div className="text-center">
                    <Spinner animation="border" role="status" variant="primary" />
                    <p className="mt-3">Agent jest w trakcie pracy... Proszę czekać.</p>
                    <p>Możesz bezpiecznie zamknąć tę stronę i wrócić tu później, wyniki zostaną zachowane.</p>
                </div>
            );
        }

        if (error) {
            return <Alert variant="danger">{error}</Alert>;
        }

        if (taskData) {
            switch (taskData.status) {
                case 'completed':
                    const parsedResponse = parseAgentResponse(taskData.response?.response || "Brak odpowiedzi.");
                    return (
                        <>
                            <Alert variant="success">Agent zakończył pracę!</Alert>
                            <ListGroup>
                                {parsedResponse.map(item => (
                                    <ListGroup.Item key={item.id}>
                                        <h5>{item.name}</h5>
                                        {item.details.map((detail, index) => (
                                            <p key={index} className="mb-1">{detail}</p>
                                        ))}
                                    </ListGroup.Item>
                                ))}
                            </ListGroup>
                        </>
                    );
                case 'failed':
                    return (
                        <Alert variant="danger">
                            <h4>Wystąpił błąd podczas przetwarzania</h4>
                            <p>Niestety, agent nie mógł ukończyć zadania. Szczegóły błędu:</p>
                            <pre>{taskData.error || "Brak szczegółów błędu."}</pre>
                        </Alert>
                    );
                default:
                    return <Alert variant="warning">Nieznany status zadania.</Alert>;
            }
        }

        return <Alert variant="info">Brak danych do wyświetlenia.</Alert>;
    };

    return (
        <Container>
            <h1 className="my-4">Wyniki Agenta Pro Max</h1>
            <p>ID Zadania: <strong>{taskId}</strong></p>
            <Card>
                <Card.Body>
                    {renderContent()}
                </Card.Body>
            </Card>
        </Container>
    );
};

export default AgentProMaxResultsPage;
```
