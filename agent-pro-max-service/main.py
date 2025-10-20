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
