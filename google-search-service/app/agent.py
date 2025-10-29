# app/agent.py
from google.adk.agents import LlmAgent
from google.adk.tools import AgentTool
from .tools import google_search_custom_tool

# === SPECJALISTA 1: WYSZUKIWANIE ===
web_search_specialist = LlmAgent(
    name="WebSearchSpecialist",
    model="gemini-2.5-pro",
    description="Wykonuje pełne wyszukiwanie Google i zwraca wynik jako string JSON.",
    instruction="""
        Twoje jedyne zadanie: wywołaj narzędzie `perform_maximum_google_search` z zapytaniem użytkownika.
        Zwróć WYŁĄCZNIE wynik jako czysty string JSON, bez żadnych dodatkowych słów, wyjaśnień czy formatowania.
    """,
    tools=[google_search_custom_tool],
    output_key="search_results"  # Zapisuje do state
)

# === NARZĘDZIE Z AGENTA ===
web_search_agent_tool = AgentTool(
    agent=web_search_specialist
)

# === SPECJALISTA 2: ANALIZA I KLASYFIKACJA ===
link_analysis_specialist = LlmAgent(
    name="LinkAnalysisSpecialist",
    model="gemini-2.5-pro",
    description="Analizuje wyniki wyszukiwania z {search_results} i klasyfikuje linki.",
    instruction="""
        Jesteś ekspertem w analizie danych webowych. Otrzymujesz listę wyników wyszukiwania jako string JSON w zmiennej {search_results}.
        
        TWOJE ZADANIE:
        1. Przeanalizuj każdy element na liście.
        2. Odrzuć linki, które prowadzą do mediów społecznościowych, portali z ogłoszeniami o pracę, forów i agregatorów newsów.
        3. Sklasyfikuj pozostałe linki do jednej z dwóch kategorii:
           - "companyUrls": dla linków będących bezpośrednimi stronami firm.
           - "portalUrls": dla linków prowadzących do portali z ofertami usług (np. Oferteo, Fixly, OLX Usługi).
        
        Zwróć wynik WYŁĄCZNIE jako pojedynczy, czysty string w formacie JSON.
    """,
    tools=[]  # USUNIĘTO input_key – NIE ISTNIEJE!
)

# === ORKIESTRATOR (root_agent) ===
root_agent = LlmAgent(
    name="SmartSearchOrchestrator",
    model="gemini-2.5-pro",
    description="Zarządza dwuetapowym procesem wyszukiwania i analizy.",
    instruction="""
    Jesteś automatem wykonawczym. Zawsze wykonuj DOKŁADNIE ten proces:

    1. **KROK 1: WYSZUKIWANIE**
       Wywołaj narzędzie `web_search_agent` z oryginalnym zapytaniem użytkownika.

    2. **KROK 2: ANALIZA**
       Natychmiast po otrzymaniu wyniku z Kroku 1, deleguj zadanie do `LinkAnalysisSpecialist`.

    3. **KROK 3: OSTATECZNA ODPOWIEDŹ**
       Odpowiedź od `LinkAnalysisSpecialist` to ostateczny wynik. Zwróć go i zakończ pracę.
    """,
    tools=[web_search_agent_tool],
    sub_agents=[link_analysis_specialist]
)