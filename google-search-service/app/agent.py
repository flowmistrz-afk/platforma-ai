# /app/agent.py (WERSJA OSTATECZNA I DZIAŁAJĄCA)

from google.adk.agents import LlmAgent

# Importujemy WYŁĄCZNIE nasze niestandardowe narzędzie z pliku tools.py
from .tools import google_search_custom_tool

# --- DEFINICJA AGENTÓW-SPECJALISTÓW ---

# Specjalista nr 1: Wyszukiwanie w Google (używa naszego niestandardowego narzędzia API)
web_search_specialist = LlmAgent(
    name="WebSearchSpecialist",
    model="gemini-2.5-pro",
    description="Specjalista od wyszukiwania informacji w internecie za pomocą niestandardowego narzędzia. Zwraca listę wyników w formacie JSON.",
    instruction="""
        Twoim zadaniem jest przyjęcie zapytania od użytkownika i wykonanie go za pomocą narzędzia 'perform_google_search'.
        Narzędzie to zwróci wyniki wyszukiwania jako string w formacie JSON. Przekaż te wyniki w całości, bez modyfikacji, jako swoją odpowiedź.
    """,
    tools=[google_search_custom_tool]
)

# Specjalista nr 2: Filtrowanie Wyników (logika ze "starego" agenta)
link_filter_specialist = LlmAgent(
    name="LinkFilterSpecialist",
    model="gemini-2.5-pro",
    description="Analityk filtrujący listę linków, aby zostawić tylko strony firmowe i portale z ofertami.",
    instruction="""
        Jesteś analitykiem danych. Otrzymujesz listę wyników wyszukiwania jako string w formacie JSON.
        Twoim zadaniem jest odfiltrowanie tylko tych linków, które z dużym prawdopodobieństwem są stroną firmy świadczącej usługi lub portalem zbierającym oferty.
        Zwróć WYŁĄCZNIE przefiltrowaną listę jako string w tym samym formacie JSON, bez żadnych dodatkowych komentarzy.
    """,
)

# Specjalista nr 3: Klasyfikacja Linków (logika ze "starego" agenta)
link_classifier_specialist = LlmAgent(
    name="LinkClassifierSpecialist",
    model="gemini-2.5-pro",
    description="Analityk klasyfikujący przefiltrowane linki na strony firmowe i portale.",
    instruction="""
        Jesteś inteligentnym analitykiem. Otrzymujesz listę linków jako string w formacie JSON. 
        Twoim zadaniem jest sklasyfikowanie każdego linku na jedną z dwóch kategorii: "companyUrls" i "portalUrls".
        Zwróć wynik WYŁĄCZNIE jako string w formacie JSON o strukturze:
        {"companyUrls": [...], "portalUrls": [...]}
    """,
)


# --- DEFINICJA AGENTA-ORKIESTRATORA ("MÓZGU") ---
root_agent = LlmAgent(
    name="SequentialSearchOrchestrator",
    model="gemini-2.5-pro",
    description="Główny menedżer, który zarządza wieloetapowym procesem: wyszukiwania, filtrowania i klasyfikacji.",
    instruction="""
        Jesteś menedżerem projektu. Wykonaj zadanie w 3 krokach:
        1. KROK 1: Przekaż zapytanie użytkownika do 'WebSearchSpecialist'.
        2. KROK 2: Wyniki z kroku 1 przekaż do 'LinkFilterSpecialist'.
        3. KROK 3: Wyniki z kroku 2 przekaż do 'LinkClassifierSpecialist'.
        Zwróć wynik z KROKU 3 jako swoją ostateczną odpowiedź.
    """,
    sub_agents=[
        web_search_specialist,
        link_filter_specialist,
        link_classifier_specialist,
    ],
)

print("Zbudowano ostatecznego agenta z niestandardowym narzędziem wyszukiwania API.")