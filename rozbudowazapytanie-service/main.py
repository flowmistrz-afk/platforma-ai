# main.py
import os
import json
import traceback
import uuid
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

# --- Konfiguracja dla Vertex AI ---
# To jest kluczowy element zapewniający, że ADK używa uwierzytelniania Vertex AI
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"

# --- Modele Danych Pydantic ---
class RozbudowaRequest(BaseModel):
    query: str
    pkd_section: Optional[str] = None

class EnrichedQuery(BaseModel):
    identifiedService: str
    keywords: List[str]
    pkdCodes: List[str]

# --- Wczytanie Bazy Danych PKD ---
try:
    with open('pkd-database.json', 'r', encoding='utf-8') as f:
        pkd_data = json.load(f)
except FileNotFoundError:
    print("KRYTYCZNY BŁĄD: Plik pkd-database.json nie został znaleziony!")
    pkd_data = []

# --- Definicja Agenta ADK ---
rozbudowa_zapytania_agent = Agent(
    name='rozbudowa_zapytania_agent',
    model='gemini-2.5-pro',
    description='Agent, który analizuje zapytanie użytkownika i dobiera do niego słowa kluczowe oraz kody PKD.',
    instruction="Twoim zadaniem jest przeanalizowanie zapytania i dobranie słów kluczowych oraz KODÓW PKD z dostarczonej listy. Zwróć wynik wyłącznie w formacie JSON.",
)

# --- Runner (silnik wykonawczy dla agenta) ---
runner = Runner(
    agent=rozbudowa_zapytania_agent,
    app_name="rozbudowa_zapytania_app",
    session_service=InMemorySessionService()
)

# --- Aplikacja FastAPI ---
app = FastAPI(
    title="Rozbudowa Zapytanie Service",
    description="Serwis hostujący agenta, który wzbogaca zapytania o kody PKD i słowa kluczowe.",
)

@app.post("/rozbuduj", response_model=EnrichedQuery)
async def handle_rozbuduj(request: RozbudowaRequest):
    session_id = str(uuid.uuid4())
    final_json_response = {}

    try:
        # Przygotowanie listy kodów PKD dla promptu
        available_pkd_codes = []
        if request.pkd_section:
            section = next((s for s in pkd_data if s.get('kod') == request.pkd_section), None)
            if section and 'podklasy' in section:
                available_pkd_codes = section['podklasy']
        else:
            for section in pkd_data:
                if 'podklasy' in section:
                    available_pkd_codes.extend(section['podklasy'])

        pkd_list_for_prompt = "\n".join([f"{p['kod']} - {p['nazwa']}" for p in available_pkd_codes])

        prompt = f"""
        Jesteś światowej klasy ekspertem w polskiej gospodarce. Twoim zadaniem jest przeanalizowanie zapytania użytkownika, zidentyfikowanie głównej usługi, a następnie dobranie do niej słów kluczowych i KODÓW PKD z dostarczonej listy.

        **Oryginalne zapytanie użytkownika:** "{request.query}"

        **DOSTĘPNA LISTA KODÓW PKD:**
        ---
        {pkd_list_for_prompt}
        ---

        **Zadania do wykonania:**
        1.  **Identyfikacja Usługi:** Zidentyfikuj główną usługę (ignorując lokalizację).
        2.  **Generowanie Kluczowych Fraz:** Wygeneruj listę 8-12 unikalnych fraz.
        3.  **Dobór Kodów PKD:** Zidentyfikuj od 1 do 3 kodów PKD, które NAJLEPIEJ pasują, **WYBIERAJĄC JE WYŁĄCZNIE Z POWYŻSZEJ LISTY**.

        Zwróć wynik wyłącznie w formacie JSON, bez żadnych dodatkowych komentarzy i formatowania markdown. Struktura JSON musi być następująca:
        {{
          "identifiedService": "Główna usługa wyodrębniona z zapytania",
          "keywords": ["fraza_1", "fraza_2", "..."],
          "pkdCodes": ["kod_pkd_1_z_listy", "..."]
        }}
        """
        
        await runner.session_service.create_session(app_name=runner.app_name, user_id="user", session_id=session_id)
        message = types.Content(role="user", parts=[types.Part(text=prompt)])

        async for event in runner.run_async(user_id="user", session_id=session_id, new_message=message):
            if event.is_final_response():
                if event.content and event.content.parts:
                    response_text = "".join(part.text for part in event.content.parts if hasattr(part, 'text'))
                    # Prosta ekstrakcja JSON z odpowiedzi
                    json_match = response_text[response_text.find('{'):response_text.rfind('}')+1]
                    if json_match:
                        final_json_response = json.loads(json_match)
                break

        if not final_json_response:
            raise ValueError("Agent nie zwrócił poprawnej odpowiedzi JSON.")

        return EnrichedQuery(**final_json_response)

    except Exception as e:
        print(f"An error occurred during agent execution: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def read_root():
    return {"message": "Serwis 'rozbudowazapytanie' działa."}

# Uruchomienie serwera na porcie zdefiniowanym przez Cloud Run
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
