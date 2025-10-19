# Główny plik aplikacji dla serwisu agentowego w Pythonie

from fastapi import FastAPI, Request, HTTPException
from vertexai.preview.reasoning_engines import A2aAgent

# Importy z nowo utworzonego pliku agenta
from app.agents.enricher import (
    agent_card as enricher_agent_card,
    EnricherAgentExecutor,
    enricher_llm_agent,
)

# Inicjalizacja aplikacji FastAPI
app = FastAPI(
    title="Agent Pro Max Service (Enricher)",
    description="Serwis hostujący agenta EnricherProMax zbudowanego w oparciu o ADK.",
)

# Stworzenie i skonfigurowanie agenta EnricherProMax
enricher_agent = A2aAgent(
    agent_card=enricher_agent_card,
    agent_executor_builder=lambda: EnricherAgentExecutor(
        agent=enricher_llm_agent,
    )
)
enricher_agent.set_up()


# Endpointy dla agenta EnricherProMax
@app.post("/agent/EnricherProMax")
async def message_agent(request: Request):
    """Endpoint do wysyłania wiadomości do agenta i tworzenia zadania."""
    try:
        response = await enricher_agent.on_message_send(request=request, context=None)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/agent/EnricherProMax/card")
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
