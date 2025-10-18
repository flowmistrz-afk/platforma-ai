# Główny plik aplikacji dla serwisu agentowego w Pythonie

from fastapi import FastAPI, Request, HTTPException
from vertexai.preview.reasoning_engines import A2aAgent

from app.agents.enricher import (
    agent_card as enricher_agent_card,
    EnricherAgentExecutor,
    enricher_llm_agent,
)
from app.orchestrator import (
    agent_card as orchestrator_agent_card,
    OrchestratorAgentExecutor,
    orchestrator_llm_agent,
)

# Inicjalizacja aplikacji FastAPI
app = FastAPI(
    title="Agent Pro Max Service",
    description="Serwis hostujący agentów AI zbudowanych w oparciu o ADK.",
)

# Stworzenie i skonfigurowanie agenta EnricherProMax
enricher_agent = A2aAgent(
    agent_card=enricher_agent_card,
    agent_executor_builder=lambda: EnricherAgentExecutor(
        agent=enricher_llm_agent,
    )
)
enricher_agent.set_up()


# Stworzenie i skonfigurowanie agenta Orchestrator
orchestrator_agent = A2aAgent(
    agent_card=orchestrator_agent_card,
    agent_executor_builder=lambda: OrchestratorAgentExecutor(
        agent=orchestrator_llm_agent,
    )
)
orchestrator_agent.set_up()

# Endpoint do komunikacji z agentem
@app.post("/agent/enricherProMax")
async def message_agent(request: Request):
    """Endpoint do wysyłania wiadomości do agenta i tworzenia zadania."""
    try:
        # Przekazanie surowego zapytania do metody agenta, która zajmie się walidacją i przetwarzaniem
        response = await enricher_agent.on_message_send(request=request, context=None)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/agent/enricherProMax/card")
async def get_agent_card(request: Request):
    """Endpoint do pobierania wizytówki agenta."""
    try:
        response = await enricher_agent.handle_authenticated_agent_card(request=request, context=None)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "ok"}


# Endpoints dla Orchestrator
@app.post("/agent/orchestrator")
async def message_orchestrator(request: Request):
    """Endpoint do wysyłania wiadomości do agenta orkiestratora."""
    try:
        response = await orchestrator_agent.on_message_send(request=request, context=None)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/agent/orchestrator/card")
async def get_orchestrator_card(request: Request):
    """Endpoint do pobierania wizytówki agenta orkiestratora."""
    try:
        response = await orchestrator_agent.handle_authenticated_agent_card(request=request, context=None)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))