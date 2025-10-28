# google-searcher-agent-service/app/agent.py
from google.adk.agents import LlmAgent, Agent

# Importujemy WYŁĄCZNIE nasze niestandardowe narzędzia
from .tools import (
    simple_web_fetch,
    perform_web_search,
    scrape_website_intelligently,
    close_browser_session,
)

# --- Definicja Agentów-Specjalistów ---

# NOWY Specjalista nr 1: Wyszukiwanie w internecie za pomocą Puppeteera
web_search_agent = LlmAgent(
    name="WebSearchAgent",
    model="gemini-2.5-pro",
    description="Specjalista od wyszukiwania informacji w internecie. Użyj go, aby znaleźć listę linków i odpowiedzi na ogólne pytania.",
    instruction="""
        Twoim zadaniem jest przyjęcie zapytania od użytkownika i wykonanie go za pomocą narzędzia 'perform_web_search'.
        Następnie przeanalizuj otrzymany uproszczony widok strony z wynikami i zwróć listę 3-5 najbardziej obiecujących,
        organicznych wyników w formacie JSON jako tablica obiektów: [{"title": "...", "link": "..."}].
    """,
    tools=[perform_web_search],
)

# Specjalista nr 2: Szybkie pobieranie surowej treści HTML
web_fetch_agent = LlmAgent(
    name="WebFetchAgent",
    model="gemini-2.5-pro",
    description="Specjalista od szybkiego pobierania surowej treści HTML ze wskazanego adresu URL.",
    instruction="Użyj narzędzia 'simple_web_fetch' z podanym URL i zwróć pełną treść HTML.",
    tools=[simple_web_fetch],
)

# Specjalista nr 3: Zaawansowany, inteligentny scraping
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

# --- Definicja "Mózga-Menedżera" ---
root_agent = LlmAgent(
    name="GoogleSearcherManager",
    model="gemini-2.5-pro",
    description="Główny menedżer zespołu researcherów. Deleguje zadania.",
    instruction="""
        Jesteś menedżerem zespołu agentów. Przeanalizuj zlecenie i przekaż je
        do jednego, najbardziej odpowiedniego specjalisty za pomocą 'transfer_to_agent'.

        Twoi pracownicy:
        1.  **WebSearchAgent**: Do ogólnego wyszukiwania w internecie i znajdowania linków.
        2.  **WebFetchAgent**: Do pobrania surowego HTML z konkretnego URL.
        3.  **AdvancedScraperAgent**: Do inteligentnej analizy i wyciągania konkretnych danych ze strony internetowej.

        Zawsze deleguj. Nie wykonuj pracy samodzielnie.
    """,
    sub_agents=[
        web_search_agent,
        web_fetch_agent,
        advanced_scraper_agent,
    ],
)

print("Zbudowano ostateczny, w pełni niestandardowy zespół agentów.")
