# app/orchestrator.py
import os
import requests
import json
from typing import Dict, Any, Optional

from google.adk.agents import Agent
from google.adk.sessions import InMemorySessionService
from google.adk.runners import Runner
from google.genai import types

# --- Konfiguracja ---
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"

# Adresy URL Mikroserwisów
ROZBUDOWAZAPYTANIE_URL = "https://rozbudowazapytanie-service-567539916654.europe-west1.run.app"
CEIDG_SEARCHER_URL = "https://ceidg-firm-searcher-service-567539916654.europe-west1.run.app"
CEIDG_DETAILS_URL = "https://ceidg-details-fetcher-service-567539916654.europe-west1.run.app"

# Stałe
APP_NAME = "agent-pro-max-v2"
USER_ID = "user_default"

# --- Definicje Narzędzi (Tools) ---

def rozbudowa_zapytania(query: str, pkd_section: Optional[str] = None) -> Dict[str, Any]:
    """Użyj tego narzędzia jako pierwszego kroku, jeśli użytkownik NIE PODAŁ konkretnych kodów PKD. 
    Narzędzie to analizuje zapytanie i dobiera do niego odpowiednie kody PKD."""
    payload = {"query": query, "pkd_section": pkd_section}
    response = requests.post(f"{ROZBUDOWAZAPYTANIE_URL}/rozbuduj", json=payload, timeout=300)
    response.raise_for_status()
    return response.json()

def ceidg_firm_searcher(pkd_codes: list, city: str, province: str, radius: int = 0) -> Dict[str, Any]:
    """Użyj tego narzędzia do znalezienia listy firm w CEIDG na podstawie kodów PKD i lokalizacji."""
    payload = {"pkd_codes": pkd_codes, "city": city, "province": province, "radius": radius}
    response = requests.post(f"{CEIDG_SEARCHER_URL}/search", json=payload, timeout=600)
    response.raise_for_status()
    return response.json()

def ceidg_details_fetcher(firm_ids: list) -> Dict[str, Any]:
    """Użyj tego narzędzia, aby pobrać pełne dane kontaktowe dla firm, których ID posiadasz."""
    payload = {"firm_ids": firm_ids}
    response = requests.post(f"{CEIDG_DETAILS_URL}/details", json=payload, timeout=600)
    response.raise_for_status()
    return response.json()

# --- Definicja Głównego Agenta ("Mózgu") ---
orchestrator_agent = Agent(
    name='orchestrator_agent_v2',
    model='gemini-2.5-pro', # Zgodnie z Twoją prośbą
    description='Inteligentny orkiestrator, który planuje i wywołuje inne serwisy w celu odpowiedzi na zapytanie użytkownika.',
    instruction='''Jesteś systemem orkiestrującym. Twoim zadaniem jest zrozumienie polecenia użytkownika i wywołanie odpowiednich narzędzi w logicznej kolejności. Twoja finalna odpowiedź MUSI być przyjaznym podsumowaniem znalezionych danych.

**LOGIKA DZIAŁANIA KROK PO KROKU:**

1.  **Analiza Zapytania:** Przeanalizuj `userInput` dostarczone przez użytkownika. Zawiera ono kluczowe informacje: `query`, `city`, `province`, `radius` oraz `selectedPkdCodes`.

2.  **Warunek PKD:**
    *   **JEŚLI `selectedPkdCodes` jest PUSTE:** Oznacza to, że użytkownik nie wybrał kodów. Twoim pierwszym krokiem **MUSI** być wywołanie narzędzia `rozbudowa_zapytania`. Przekaż do niego `query` użytkownika.
    *   **JEŚLI `selectedPkdCodes` ZAWIERA KODY:** Pomiń krok z `rozbudowa_zapytania` i przejdź od razu do kroku 3, używając kodów podanych przez użytkownika.

3.  **Wyszukiwanie w CEIDG:** Użyj narzędzia `ceidg_firm_searcher`. Jako `pkd_codes` podaj kody od użytkownika (jeśli były) LUB kody zwrócone przez narzędzie `rozbudowa_zapytania`. Przekaż również `city`, `province` i `radius` z `userInput`.

4.  **Pobieranie Szczegółów:** Wynik z `ceidg_firm_searcher` będzie zawierał listę firm z ich ID. Wyciągnij te ID i przekaż je do narzędzia `ceidg_details_fetcher`.

5.  **Finalna Odpowiedź:** Po otrzymaniu pełnych danych z `ceidg_details_fetcher`, sformatuj je w czytelną, przyjazną dla użytkownika listę. Dla każdej firmy przedstaw jej nazwę, email, telefon i adres.
''',
    tools=[rozbudowa_zapytania, ceidg_firm_searcher, ceidg_details_fetcher]
)

# --- Runner (silnik wykonawczy) ---
runner = Runner(
    agent=orchestrator_agent,
    app_name=APP_NAME,
    session_service=InMemorySessionService()
)
