# main.py
import os
import uuid
import traceback
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
from google.genai import types

# Importujemy gotowego runnera z naszego modułu orchestrator
from app.orchestrator import runner, USER_ID, APP_NAME

# Model danych dla przychodzącego zapytania
class UserRequest(BaseModel):
    query: str
    session_id: str = None # Opcjonalne, możemy generować nowe

app = FastAPI(
    title="Agent Pro Max Service (v2 - Modern ADK)",
    description="Serwis hostujący 'Mózg' (Orchestrator) zbudowany w oparciu o zmodernizowany Google ADK.",
)

@app.post("/execute")
async def execute_agent_task(request: UserRequest):
    """Główny endpoint do interakcji z agentem."""
    session_id = request.session_id or str(uuid.uuid4())
    final_response = "Agent did not produce a final response."

    try:
        # Tworzymy lub pobieramy sesję
        await runner.session_service.create_session(
            app_name=APP_NAME, user_id=USER_ID, session_id=session_id
        )
        
        # --- POPRAWKA: Tworzymy poprawny obiekt wiadomości ---
        message = types.Content(role="user", parts=[types.Part(text=request.query)])

        # Uruchamiamy agenta z zapytaniem użytkownika
        async for event in runner.run_async(
            user_id=USER_ID,
            session_id=session_id,
            new_message=message
        ):
            if event.is_final_response():
                if event.content and event.content.parts:
                    final_response = "".join(part.text for part in event.content.parts if hasattr(part, 'text'))
                break # Zakończ pętlę po otrzymaniu finalnej odpowiedzi

        return {"session_id": session_id, "response": final_response}

    except Exception as e:
        # Logowanie błędu na serwerze jest kluczowe
        print(f"An error occurred during agent execution: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "ok"}

# Uruchomienie serwera na porcie zdefiniowanym przez Cloud Run
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
