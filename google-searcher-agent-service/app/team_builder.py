# google-searcher-agent-service/app/team_builder.py
from google.adk.agents import LlmAgent, Agent
from google.adk.tools import google_search
from google.adk.tools.tool_context import ToolContext
import requests

# Importujemy narzędzia z naszego mostu do puppeteer-service
from .tools.puppeteer_tools import go_to_url_and_look, close_browser_session

# --- Definicja Narzędzi dla Zespołu ---

def simple_web_fetch(url: str) -> str:
    """
    Szybko pobiera surową, pełną treść HTML z podanego adresu URL.
    Nie przetwarza JavaScript ani nie wykonuje interakcji.
    """
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        return response.text
    except requests.exceptions.RequestException as e:
        return f"Błąd podczas pobierania {url}: {e}"

# --- Definicja Agentów-Specjalistów ---

# Specjalista nr 1: Proste wyszukiwanie w Google
simple_search_agent = Agent(
    name="SimpleSearchAgent",
    model="gemini-1.5-flash",
    description="Specjalista od szybkiego wyszukiwania w Google. Użyj go, aby uzyskać ogólną listę wyników i linków.",
    instruction="Użyj narzędzia 'google_search' z zapytaniem od użytkownika i zwróć wyniki.",
    tools=[google_search]
)

# Specjalista nr 2: Szybkie pobieranie HTML
web_fetch_agent = LlmAgent(
    name="WebFetchAgent",
    model="gemini-1.5-flash",
    description="Specjalista od szybkiego pobierania surowej treści HTML ze strony internetowej.",
    instruction="Twoim zadaniem jest użycie narzędzia 'simple_web_fetch' z podanym URL i zwrócenie pełnej, niezmodyfikowanej treści HTML.",
    tools=[simple_web_fetch]
)

# Specjalista nr 3: Inteligentne skanowanie strony
advanced_scraper_agent = LlmAgent(
    name="AdvancedScraperAgent",
    model="gemini-2.5-pro",
    description="Specjalista od wchodzenia na strony i inteligentnego wyciągania z nich kluczowych informacji.",
    instruction="""
        Twoim zadaniem jest użycie narzędzia 'go_to_url_and_look', aby wejść na stronę i uzyskać jej uproszczony widok.
        Następnie przeanalizuj ten widok i wyciągnij kluczowe informacje (nazwa firmy, adres, email, telefon).
        Na końcu wywołaj 'close_browser_session'. Zwróć dane w formacie JSON.
    """,
    tools=[go_to_url_and_look, close_browser_session]
)

# --- Definicja "Mózga-Menedżera" ---
google_searcher_manager = LlmAgent(
    name="GoogleSearcherManager",
    model="gemini-2.5-pro",
    description="Główny menedżer zespołu researcherów. Deleguje zadania do odpowiednich specjalistów.",
    instruction="""
        Jesteś menedżerem zespołu agentów-researcherów. Przeanalizuj zlecenie i przekaż je
        do odpowiedniego specjalisty (sub-agenta) za pomocą funkcji 'transfer_to_agent'.
        - Do prostego wyszukania listy linków użyj 'SimpleSearchAgent'.
        - Do szybkiego pobrania całego HTML ze strony użyj 'WebFetchAgent'.
        - Do inteligentnej analizy i wyciągnięcia konkretnych danych ze strony użyj 'AdvancedScraperAgent'.
    """,
    sub_agents=[
        simple_search_agent,
        web_fetch_agent,
        advanced_scraper_agent
    ]
)

print("Zbudowano kompletny, trzyosobowy zespół agentów.")
