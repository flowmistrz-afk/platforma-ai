# main.py
import os
import uuid
import traceback
import json
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional

# --- NOWE IMPORTY DLA CORS ---
from fastapi.middleware.cors import CORSMiddleware

from google.genai import types
from app.orchestrator import runner, USER_ID, APP_NAME

# Model danych, który DOKŁADNIE odpowiada temu, co wysyła frontend
class UserRequest(BaseModel):
    query: str
    city: Optional[str] = None
    province: Optional[str] = None
    radius: Optional[int] = 0
    selectedPkdSection: Optional[str] = None
    selectedPkdCodes: Optional[List[str]] = []
    session_id: Optional[str] = None

app = FastAPI(
    title="Agent Pro Max Service (v2 - Modern ADK)",
    description="Serwis hostujący 'Mózg' (Orchestrator) zbudowany w oparciu o zmodernizowany Google ADK.",
)

# --- KONFIGURACJA CORS ---
# Zezwalamy na wszystkie źródła, metody i nagłówki.
# W środowisku produkcyjnym warto to ograniczyć do konkretnych domen.
origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/execute")
async def execute_agent_task(request: UserRequest):
    session_id = request.session_id or str(uuid.uuid4())
    final_response = "Agent did not produce a final response."

    try:
        await runner.session_service.create_session(
            app_name=APP_NAME, user_id=USER_ID, session_id=session_id
        )
        
        prompt_parts = [f'Użytkownik szuka: "{request.query}".']
        if request.city and request.province:
            prompt_parts.append(f'Lokalizacja: {request.city}, {request.province} (promień: {request.radius} km).')
            
        if request.selectedPkdCodes:
            prompt_parts.append(f"Użytkownik sam wybrał następujące kody PKD: {', '.join(request.selectedPkdCodes)}.")
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

        return {"session_id": session_id, "response": final_response}

    except Exception as e:
        print(f"An error occurred during agent execution: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
