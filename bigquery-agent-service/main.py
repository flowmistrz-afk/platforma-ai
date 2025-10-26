# main.py for BigQuery Multi-Agent System
import logging
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Tuple
import json

from google.cloud import bigquery
import vertexai
from vertexai.generative_models import GenerativeModel, Tool, Part, FunctionDeclaration, Content

# --- Basic Configuration ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- FastAPI App Initialization ---
app = FastAPI(title="BigQuery Agent Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Schema and Agent Definition ---
_EXPECTED_SCHEMA: List[Tuple[str, str, str]] = [
    ('numer_urzad', 'STRING', 'Numer urzędu.'),
    ('nazwa_organu', 'STRING', 'Nazwa organu administracji.'),
    ('adres_organu', 'STRING', 'Adres organu.'),
    ("data_wplywu_wniosku", "STRING", "Data wpłynięcia wniosku (format tekstowy, np. 'YYYY-MM-DD')."),
    ('numer_decyzji_urzedu', 'STRING', 'Numer decyzji nadany przez urząd.'),
    ("data_wydania_decyzji", "STRING", "Data wydania decyzji (format tekstowy, np. 'YYYY-MM-DD')."),
    ('nazwa_inwestor', 'STRING', 'Nazwa lub imię i nazwisko inwestora.'),
    ('wojewodztwo_z_pliku', 'STRING', 'Województwo odczytane z oryginalnego pliku (może być nieustandaryzowane).'),
    ('miasto', 'STRING', 'Miasto lokalizacji inwestycji.'),
    ('terc', 'STRING', 'Identyfikator TERYT gminy.'),
    ('cecha', 'STRING', 'Identyfikator rodzaju gminy z kodu TERYT.'),
    ('cecha_1', 'STRING', 'Dodatkowa cecha (prawdopodobnie nieużywana).'),
    ('ulica', 'STRING', 'Ulica lokalizacji inwestycji.'),
    ('ulica_dalej', 'STRING', 'Dalsza część adresu ulicy.'),
    ('nr_domu', 'STRING', 'Numer domu.'),
    ('rodzaj_inwestycji', 'STRING', 'Kategoria opisowa inwestycji (np. "BUDYNEK MIESZKALNY JEDNORODZINNY").'),
    ('kategoria', 'STRING', 'Kategoria obiektu budowlanego (np. "I", "V", "XVII").'),
    ('nazwa_zamierzenia_bud', 'STRING', 'Nazwa zamierzenia budowlanego.'),
    ('nazwa_zam_budowlanego', 'STRING', 'Alternatywna nazwa zamierzenia budowlanego.'),
    ('kubatura', 'STRING', 'Kubatura budynku w metrach sześciennych (jako tekst, wymaga konwersji, np. `CAST(kubatura AS FLOAT64)`).'),
    ('projektant_nazwisko', 'STRING', 'Nazwisko projektanta.'),
    ('projektant_imie', 'STRING', 'Imię projektanta.'),
    ('projektant_numer_uprawnien', 'STRING', 'Numer uprawnień projektanta.'),
    ('jednosta_numer_ew', 'STRING', 'Numer jednostki ewidencyjnej.'),
    ('obreb_numer', 'STRING', 'Numer obrębu ewidencyjnego.'),
    ('numer_dzialki', 'STRING', 'Numer działki ewidencyjnej.'),
    ('numer_arkusza_dzialki', 'STRING', 'Numer arkusza mapy dla działki.'),
    ('jednostka_stara_numeracja_z_wniosku', 'STRING', 'Stara numeracja jednostki z wniosku.'),
    ('stara_numeracja_obreb_z_wniosku', 'STRING', 'Stara numeracja obrębu z wniosku.'),
    ('stara_numeracja_dzialka_z_wniosku', 'STRING', 'Stara numeracja działki z wniosku.'),
    ('data_przetworzenia', 'TIMESTAMP', 'Data i czas załadowania rekordu w systemie.'),
    ('wojewodztwo', 'STRING', 'Ustandaryzowana, oficjalna nazwa województwa (preferowana do zapytań).')
]
_PROMPT_SCHEMA_STRING = "\n".join([f"- {name} ({dtype}): {desc}" for name, dtype, desc in _EXPECTED_SCHEMA])

try:
    PROJECT_ID = "automatyzacja-pesamu"
    LOCATION = "europe-west1"
    BQ_DATASET = "pozwolenia_na_budowe"
    BQ_TABLE = "dane_z_plikow_csv"
    _TABLE_NAME = f"{PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE}"

    vertexai.init(project=PROJECT_ID, location=LOCATION)
    bq_client = bigquery.Client(project=PROJECT_ID)

    _AGENT_INSTRUCTION_TEMPLATE = """Jesteś 'Bud-E', wysoce inteligentnym asystentem AI do analizy danych o pozwoleniach na budowę w Polsce.

**KRYTYCZNE INSTRUKCJE:**
1.  **Korzystaj z Poniższego Schematu:** To jest kompletny schemat, jakiego masz używać do tworzenia zapytań SQL.
2.  **Używaj Pełnej Nazwy Tabeli:** W zapytaniach SQL MUSISZ używać pełnej nazwy tabeli: `{table_name}`.
3.  **Pamiętaj o Typach Danych:** Kolumny `data_wplywu_wniosku`, `data_wydania_decyzji` i `kubatura` są typu STRING. Używaj `CAST` lub `PARSE_DATE` do filtrowania.

**Schemat tabeli `{table_name}`:**
{table_schema}

**Twój Przepływ Pracy:**
1.  **Weryfikacja Schematu (KROK OBOWIĄZKOWY):** TWOJĄ PIERWSZĄ CZYNNOŚCIĄ ZAWSZE jest wywołanie narzędzia `verify_schema` w celu upewnienia się, że struktura bazy danych jest zgodna z oczekiwaniami. Nie odpowiadaj na żadne pytania użytkownika, dopóki nie wykonasz tej weryfikacji.
2.  **Przywitaj się i Zrozum:** Po pomyślnej weryfikacji schematu, przywitaj się i zapytaj użytkownika, jakich informacji potrzebuje.
3.  **Generuj SQL i Proś o Zgodę:** Na podstawie prośby użytkownika, sformuluj precyzyjne zapytanie `SELECT`. Zanim je wykonasz, przedstaw je użytkownikowi do akceptacji.
4.  **Wykonaj i Przedstaw Wyniki:** Jeśli użytkownik się zgodzi, użyj narzędzia `execute_sql_query` i przedstaw wyniki.
"""
    _AGENT_INSTRUCTION = _AGENT_INSTRUCTION_TEMPLATE.format(table_name=_TABLE_NAME, table_schema=_PROMPT_SCHEMA_STRING)

    model = GenerativeModel("gemini-2.5-pro", system_instruction=_AGENT_INSTRUCTION)
    logger.info("Vertex AI and BigQuery clients initialized successfully.")
except Exception as e:
    logger.critical(f"CRITICAL: Could not initialize GCP clients: {e}")
    model = None
    bq_client = None

# --- Agent Tools ---
def verify_schema() -> str:
    """Checks if the live BigQuery table schema matches the expected structure and column order."""
    if not bq_client: return "Error: BigQuery client not initialized."
    try:
        table_ref = bq_client.dataset(BQ_DATASET).table(BQ_TABLE)
        live_table = bq_client.get_table(table_ref)
        live_schema = [(field.name, field.field_type) for field in live_table.schema]
        expected_schema_name_type = [(name, dtype) for name, dtype, desc in _EXPECTED_SCHEMA]
        if live_schema == expected_schema_name_type:
            return "Schema verification successful."
        else:
            return f"CRITICAL ERROR: Schema mismatch! Expected: {expected_schema_name_type}. Found: {live_schema}."
    except Exception as e:
        return f"CRITICAL ERROR: Could not verify schema: {e}"

def execute_sql_query(query: str) -> str:
    """Executes a read-only (SELECT) SQL query against the BigQuery database."""
    if not bq_client: return "BigQuery client not initialized."
    if not query.strip().upper().startswith("SELECT"): return "Error: Only SELECT queries are allowed."
    try:
        logger.info(f"Executing BigQuery query: {query}")
        query_job = bq_client.query(query)
        results = query_job.result()
        rows = [dict(row) for row in results]
        if not rows:
            return "Twoje zapytanie nie zwróciło żadnych wyników."
        return json.dumps(rows, indent=2, default=str)
    except Exception as e:
        logger.error(f"Error executing BigQuery query: {e}")
        return f"Błąd wykonania zapytania: {e}"

available_tools = {
    "verify_schema": verify_schema,
    "execute_sql_query": execute_sql_query,
}
agent_tools = Tool(function_declarations=[FunctionDeclaration.from_func(f) for f in available_tools.values()])

# --- Pydantic Models & API Endpoint ---
class ChatMessage(BaseModel):
    role: str
    content: str

class AgentChatRequest(BaseModel):
    history: List[ChatMessage]

@app.post("/chat")
async def chat_with_agent(request: AgentChatRequest):
    if not model: raise HTTPException(status_code=500, detail="Vertex AI model not initialized.")
    try:
        history_for_sdk = [Content(role=msg.role, parts=[Part.from_text(msg.content)]) for msg in request.history]
        chat = model.start_chat(history=history_for_sdk)
        
        prompt_for_model = "Kontynuuj konwersację na podstawie dostarczonej historii, ściśle przestrzegając instrukcji i przepływu pracy."
        if not history_for_sdk:
             prompt_for_model = "Zacznij konwersację, wykonując KROK 1 swojego przepływu pracy (weryfikacja schematu)."

        response = chat.send_message(
            prompt_for_model,
            generation_config={"temperature": 0.0},
            tools=[agent_tools],
        )

        while response.candidates and response.candidates[0].content.parts and response.candidates[0].content.parts[0].function_call:
            function_call = response.candidates[0].content.parts[0].function_call
            function_name = function_call.name
            
            if function_name in available_tools:
                function_to_call = available_tools[function_name]
                function_args = dict(function_call.args)
                
                logger.info(f"Executing tool: {function_name} with args: {function_args}")
                tool_response = function_to_call(**function_args)
                
                response = chat.send_message(
                    Part.from_function_response(name=function_name, response={"content": tool_response}),
                    tools=[agent_tools],
                )
            else:
                logger.warning(f"Unknown tool called: {function_name}")
                response = chat.send_message(
                    Part.from_function_response(name=function_name, response={"content": f"Unknown tool: {function_name}"}),
                    tools=[agent_tools],
                )
        
        final_response = response.text if hasattr(response, 'text') else ''
        return {"role": "model", "content": final_response}

    except Exception as e:
        logger.error(f"Error during chat with agent: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An internal error occurred: {type(e).__name__}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
