# app/orchestrator.py
import os
import requests
import json
from typing import Dict, Any

from google.adk.agents import Agent
from google.adk.sessions import InMemorySessionService
from google.adk.runners import Runner
from google.genai import types

# --- KONFIGURACJA DLA VERTEX AI ---
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"

# Adresy URL Mikroserwisów
CEIDG_SEARCHER_URL = "https://ceidg-firm-searcher-service-567539916654.europe-west1.run.app"
CEIDG_DETAILS_URL = "https://ceidg-details-fetcher-service-567539916654.europe-west1.run.app"

# Stałe do identyfikacji sesji
APP_NAME = "agent-pro-max-v2"
USER_ID = "user_default"

# --- Narzędzia (Tools) ---
def ceidg_firm_searcher(pkd_codes: list, city: str, province: str) -> Dict[str, Any]:
    """Use this tool to find a list of companies in CEIDG."""
    payload = {"pkd_codes": pkd_codes, "city": city, "province": province}
    response = requests.post(f"{CEIDG_SEARCHER_URL}/search", json=payload, timeout=600)
    response.raise_for_status()
    return response.json()

def ceidg_details_fetcher(firm_ids: list) -> Dict[str, Any]:
    """Use this tool to get full contact details for companies."""
    payload = {"firm_ids": firm_ids}
    response = requests.post(f"{CEIDG_DETAILS_URL}/details", json=payload, timeout=600)
    response.raise_for_status()
    return response.json()

# --- Definicja Agenta z OSTATECZNĄ INSTRUKCJĄ ---
orchestrator_agent = Agent(
    name='orchestrator_agent_v2',
    model='gemini-2.5-pro',
    description='A master agent that creates execution plans and calls other microservices.',
    instruction='''You are a system orchestrator. Your final response MUST be a user-friendly summary of the data you found.
**CRITICAL RULES:**
1. You MUST call the tools in sequence. Do not answer from your own knowledge.
2. For location parameters, use Polish names (e.g., "Warszawa", "mazowieckie").
3. The 'ceidg_firm_searcher' tool returns a JSON object like this: {"firms": [{"id": "some_id", "name": "some_name"}, ...]}.
4. After using 'ceidg_firm_searcher', you MUST parse its JSON output, extract the 'id' value from EACH firm, and pass this list of IDs to the 'ceidg_details_fetcher' tool.
5. The 'ceidg_details_fetcher' tool returns a list of detailed company objects.
6. **FINAL RESPONSE RULE:** After receiving the final list of company details from 'ceidg_details_fetcher', you MUST format the output for the user. For each company, present its name, email, phone, and address in a clear, readable format.
''',
    tools=[ceidg_firm_searcher, ceidg_details_fetcher]
)

# --- Runner (silnik wykonawczy) ---
session_service = InMemorySessionService()
runner = Runner(
    agent=orchestrator_agent,
    app_name=APP_NAME,
    session_service=session_service
)
