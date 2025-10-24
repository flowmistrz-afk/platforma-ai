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
FIRM_NAME_AI_FILTER_URL = "https://firm-name-ai-filter-service-567539916654.europe-west1.run.app"

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

def firm_name_ai_filter(query: dict, firm_summaries: list) -> Dict[str, Any]:
    """Użyj tego narzędzia, aby przefiltrować listę firm za pomocą AI, aby pozostały tylko te najbardziej pasujące do zapytania."""
    payload = {"query": query, "firmSummaries": firm_summaries}
    response = requests.post(f"{FIRM_NAME_AI_FILTER_URL}/filter", json=payload, timeout=300)
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
    instruction='''Jesteś systemem orkiestrującym. Twoim zadaniem jest zrozumienie polecenia użytkownika i wywołanie odpowiednich narzędzi w logicznej kolejności. Twoja finalna odpowiedź MUSI być szczegółowym raportem z całego procesu.

**LOGIKA DZIAŁANIA KROK PO KROKU:**

1.  **Analiza Zapytania:** Przeanalizuj `userInput`.

2.  **Warunek PKD:**
    *   **JEŚLI `selectedPkdCodes` jest PUSTE:** Wywołaj `rozbudowa_zapytania`.
    *   **JEŚLI `selectedPkdCodes` ZAWIERA KODY:** Pomiń ten krok.

3.  **Wyszukiwanie w CEIDG:** Wywołaj `ceidg_firm_searcher` z odpowiednimi kodami PKD i lokalizacją.

4.  **Filtrowanie AI:** Wynik z `ceidg_firm_searcher` przekaż do `firm_name_ai_filter`.

5.  **Pobieranie Szczegółów:** Przefiltrowane ID z poprzedniego kroku przekaż do `ceidg_details_fetcher`.

6.  **Finalny Raport:** Po zakończeniu wszystkich kroków, przygotuj szczegółowe podsumowanie. Twoja odpowiedź MUSI zawierać następujące sekcje w dokładnie tej kolejności:

    **--- KROK 1: WYNIK ROZBUDOWY ZAPYTANIA ---**
    *(Jeśli narzędzie `rozbudowa_zapytania` było użyte, wylistuj tutaj jego pełny wynik: zidentyfikowaną usługę, słowa kluczowe i kody PKD. Jeśli nie, napisz "Pominięto").*

    **--- KROK 2: WYNIK WYSZUKIWANIA FIRM ---**
    *Wylistuj tutaj nazwy i ID **wszystkich** firm znalezionych przez `ceidg_firm_searcher`.*

    **--- KROK 3: WYNIK FILTROWANIA AI ---**
    *Wylistuj nazwy i ID firm, które pozostały po filtracji przez `firm_name_ai_filter`. Podaj również, ile firm zostało odrzuconych.*

    **--- KROK 4: ZEBRANE DANE KONTAKTOWE ---**
    *Dla każdej firmy z kroku 3, przedstaw jej pełne dane kontaktowe (nazwa, email, telefon, adres) uzyskane z `ceidg_details_fetcher`.*

    Sformatuj każdą sekcję w sposób czytelny i przejrzysty.
''',
    tools=[rozbudowa_zapytania, ceidg_firm_searcher, firm_name_ai_filter, ceidg_details_fetcher]
)

# --- Runner (silnik wykonawczy) ---
runner = Runner(
    agent=orchestrator_agent,
    app_name=APP_NAME,
    session_service=InMemorySessionService()
)
