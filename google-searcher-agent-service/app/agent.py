# google-searcher-agent-service/app/agent.py
from google.adk.agents import LlmAgent, Agent

# Importujemy WYŁĄCZNIE nasze niestandardowe narzędzia
from .tools import (
    simple_web_fetch,
    scrape_website_intelligently,
    close_browser_session,
)
from .google_search_pubsub_tool import google_search_pubsub_tool

# --- Definicja Agentów-Specjalistów ---

# Specjalista nr 1: Szybkie pobieranie surowej treści HTML
web_fetch_agent = LlmAgent(
    name="WebFetchAgent",
    model="gemini-2.5-pro",
    description="Specjalista od szybkiego pobierania surowej treści HTML ze wskazanego adresu URL.",
    instruction="Użyj narzędzia 'simple_web_fetch' z podanym URL i zwróć pełną treść HTML.",
    tools=[simple_web_fetch],
)

# Specjalista nr 2: Zaawansowany, inteligentny scraping
advanced_scraper_agent = LlmAgent(
    name="AdvancedScraperAgent",
    model="gemini-2.5-pro",
    description="Specjalista od wchodzenia na strony i inteligentnego wyciągania z nich kluczowych informacji.",
    instruction="""
        Użyj narzędzia 'scrape_website_intelligently' aby wejść na stronę.
        Przeanalizuj widok i wyciągnij wymagane dane (np. email, telefon).
        Na końcu **zawsze** wywołaj 'close_browser_session'.
        Zwróć dane w formacie JSON.
    """,
    tools=[scrape_website_intelligently, close_browser_session],
)

# Specjalista nr 3: Wyszukiwanie Google przez Pub/Sub
google_search_pubsub_agent = LlmAgent(
    name="GoogleSearchPubSubAgent",
    model="gemini-2.5-pro",
    description="Specjalista od wyszukiwania informacji w Google za pomocą zewnętrznej usługi poprzez Pub/Sub.",
    instruction="""
        Twoim zadaniem jest przyjęcie zapytania od użytkownika i wykonanie go za pomocą narzędzia 'perform_google_search_pubsub'.
        Narzędzie to zwróci wyniki wyszukiwania Google. Przeanalizuj je i zwróć 3-5 najbardziej obiecujących,
        organicznych wyników w formacie JSON jako tablica obiektów: [{"title": "...", "link": "..."}].
    """,
    tools=[google_search_pubsub_tool],
)

# --- Definicja "Mózga-Menedżera" ---
root_agent = LlmAgent(
    name="GoogleSearcherManager",
    model="gemini-2.5-pro",
    description="Główny menedżer zespołu researcherów. Deleguje zadania.",
    instruction="""
        Jesteś menedżerem zespołu agentów. Przeanalizuj zlecenie i przekaż je
        do jednego, najbardziej odpowiedniego specjalisty za pomocą 'transfer_to_agent'.

        Twoi pracownicy:
        1.  **WebFetchAgent**: Do pobrania surowego HTML z konkretnego URL.
        2.  **AdvancedScraperAgent**: Do inteligentnej analizy i wyciągania konkretnych danych ze strony internetowej.
        3.  **GoogleSearchPubSubAgent**: Do wyszukiwania w Google, gdy potrzebne są wyniki z wyszukiwarki Google.

        Zawsze deleguj. Nie wykonuj pracy samodzielnie.
    """,
    sub_agents=[
        web_fetch_agent,
        advanced_scraper_agent,
        google_search_pubsub_agent,
    ],
)

print("Zbudowano ostateczny, w pełni niestandardowy zespół agentów.")
