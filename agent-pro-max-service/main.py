# Główny plik aplikacji dla serwisu agentowego w Pythonie

from fastapi import FastAPI, Request, HTTPException
from vertexai.preview.reasoning_engines import A2aAgent

# Zmieniamy importy, aby wczytać naszego Orkiestratora
from app.orchestrator import (
    agent_card as orchestrator_agent_card,
    OrchestratorAgentExecutor,
    orchestrator_llm_agent,
)

# Inicjalizacja aplikacji FastAPI
app = FastAPI(
    title="Agent Pro Max Service (Orchestrator)",
    description="Serwis hostujący 'Mózg' (Orchestrator) zbudowany w oparciu o ADK.",
)

# Stworzenie i skonfigurowanie agenta Orkiestratora
orchestrator_agent = A2aAgent(
    agent_card=orchestrator_agent_card,
    agent_executor_builder=lambda: OrchestratorAgentExecutor(
        agent=orchestrator_llm_agent,
    )
)
orchestrator_agent.set_up()


# Endpointy
@app.post("/v1/agents/Orchestrator:execute")
async def message_agent(request: Request):
    """Endpoint do wysyłania wiadomości do agenta i tworzenia zadania."""
    try:
        response = await orchestrator_agent.on_message_send(request=request, context=None)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- NOWY ENDPOINT DO SPRAWDZANIA STATUSU ZADANIA ---
@app.get("/v1/tasks/{task_id}")
async def get_task_status(task_id: str, request: Request):
    """Endpoint do pobierania statusu i wyników zadania."""
    try:
        # Przekazujemy wywołanie do wbudowanej metody A2A
        response = await orchestrator_agent.on_get_task(task_id=task_id, request=request, context=None)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
# --- KONIEC NOWEGO ENDPOINTU ---

@app.get("/agent/Orchestrator/card")
async def get_agent_card(request: Request):
    """Endpoint do pobierania wizytówki agenta."""
    try:
        response = await orchestrator_agent.handle_authenticated_agent_card(request=request, context=None)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "ok"}

# Dodajemy logikę do uruchomienia serwera Uvicorn, jeśli plik jest uruchamiany bezpośrednio
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8081)
