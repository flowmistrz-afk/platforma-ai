# app/agent.py
from google.adk.agents import LlmAgent
from google.adk.tools import AgentTool
from .tools import google_search_custom_tool, scrape_contact_tool

# === DEFINICJE SPECJALISTÓW (NASZE PRZYSZŁE NARZĘDZIA) ===

# SPECJALISTA 1: WYSZUKIWANIE
web_search_specialist = LlmAgent(
    name="WebSearchSpecialist",
    model="gemini-2.5-pro",
    description="Użyj tego narzędzia, aby przeszukać internet w poszukiwaniu informacji na zadany temat.",
    instruction="""
        Twoje jedyne zadanie: wywołaj narzędzie `perform_maximum_google_search` z zapytaniem użytkownika.
        Zwróć WYŁĄCZNIE wynik jako czysty string JSON.
    """,
    tools=[google_search_custom_tool],
    output_key="search_results"  # Zapisuje wyniki do stanu sesji
)

# SPECJALISTA 2: ANALIZA I KLASYFIKACJA
link_analysis_specialist = LlmAgent(
    name="LinkAnalysisSpecialist",
    model="gemini-2.5-pro",
    description="Użyj tego narzędzia, aby przeanalizować i sklasyfikować listę linków z wyników wyszukiwania. Wymaga, aby wyszukiwanie zostało wykonane wcześniej.",
    instruction="""
        Otrzymujesz wyniki wyszukiwania w {search_results}.
        Przeanalizuj je, odrzuć linki do mediów społecznościowych, portali pracy itp.
        Sklasyfikuj resztę jako "companyUrls" lub "portalUrls".
        Zwróć wynik WYŁĄCZNIE jako pojedynczy string JSON.
    """,
    tools=[],
    output_key="classified_links"  # Zapisuje wyniki do stanu sesji
)

# SPECJALISTA 3: POZYSKIWANIE KONTAKTU
contact_scraper_agent = LlmAgent(
    name="ContactScraper",
    model="gemini-2.5-pro",
    description="Użyj tego narzędzia, aby pobrać dane kontaktowe (e-mail, telefon) ze sklasyfikowanych linków. Wymaga, aby analiza linków została wykonana wcześniej.",
    instruction="""
    Otrzymujesz {classified_links} – JSON z listami `companyUrls` i `portalUrls`.
    Dla każdego linku wywołaj narzędzie `scrape_contact`.
    Zbierz wyniki w listę i zwróć ją jako string JSON.
    """,
    tools=[scrape_contact_tool]
)

# === TWORZENIE NARZĘDZI Z NASZYCH SPECJALISTÓW ===

# Opis dla narzędzia jest pobierany z pola "description" agenta powyżej.
web_search_tool = AgentTool(agent=web_search_specialist)
link_analysis_tool = AgentTool(agent=link_analysis_specialist)
contact_scraper_tool = AgentTool(agent=contact_scraper_agent)


# === NOWY, INTERAKTYWNY AGENT GŁÓWNY (root_agent) ===
root_agent = LlmAgent(
    name="ConversationalSearchAssistant",
    model="gemini-2.5-pro",
    description="Asystent do interaktywnego badania internetu.",
    instruction="""
    Jesteś interaktywnym asystentem do wyszukiwania i analizy danych w internecie. Twoim zadaniem jest prowadzenie rozmowy z użytkownikiem i wykonywanie jego poleceń krok po kroku.

    Twoje możliwości (narzędzia):
    1. `WebSearchSpecialist`: Przeszukuje internet.
    2. `LinkAnalysisSpecialist`: Analizuje i klasyfikuje wyniki wyszukiwania.
    3. `ContactScraper`: Pobiera dane kontaktowe ze sklasyfikowanych linków.

    SCHEMAT DZIAŁANIA:
    1. Na początku rozmowy przywitaj się i przedstaw swoje trzy główne funkcje: wyszukiwanie, analiza, pozyskiwanie kontaktów.
    2. Czekaj na polecenie użytkownika.
    3. Gdy użytkownik poprosi o wykonanie akcji (np. "wyszukaj firmy budowlane", "przeanalizuj te linki", "znajdź kontakty"), wywołaj ODPOWIEDNIE narzędzie.
    4. Po wykonaniu narzędzia, przedstaw wynik użytkownikowi w czytelny sposób i ZAPYTAJ, co chciałby zrobić dalej.
    5. Pamiętaj, że wyniki jednego kroku są automatycznie dostępne dla kolejnego. Jeśli użytkownik prosi o analizę, użyj wyników z wcześniejszego wyszukiwania. Jeśli prosi o kontakty, użyj wyników z analizy.
    """,
    tools=[
        web_search_tool,
        link_analysis_tool,
        contact_scraper_tool
    ]
)
