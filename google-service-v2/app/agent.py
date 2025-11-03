from google.adk.agents import LlmAgent
from google.adk.tools import AgentTool
from .tools import google_search_custom_tool, simple_webfetch_tool, advanced_scraper_tool, ceidg_search_tool, ceidg_details_tool
import json

# Wczytaj dane PKD z pliku
with open("app/pkd-database.json", "r") as f:
    pkd_data = json.load(f)

# === DEFINICJE SPECJALISTÓW (NASZE PRZYSZŁE NARZĘDZIA) ===

# SPECJALISTA 1: WYSZUKIWANIE W INTERNECIE
web_search_specialist = LlmAgent(
    name="WebSearchSpecialist",
    model="gemini-2.5-pro",
    description="Użyj tego narzędzia, aby przeszukać internet w poszukiwaniu informacji na zadany temat.",
    instruction='''
        Twoje jedyne zadanie: wywołaj narzędzie `perform_maximum_google_search` z zapytaniem użytkownika.
        Zaloguj, że wywołujesz to narzędzie.
        Wynik (wszystkie znalezione linki) zostanie automatycznie zapisany w stanie sesji.
        Zaloguj znalezione linki.
    ''', 
    tools=[google_search_custom_tool],
    output_key="search_results"
)

# SPECJALISTA 2: ANALIZA I KLASYFIKACJAwd
link_analysis_specialist = LlmAgent(
    name="LinkAnalysisSpecialist",
    model="gemini-2.5-pro",
    description="Użyj tego narzędzia, aby przeanalizować i sklasyfikować listę linków z wyników wyszukiwania. Wymaga, aby wyszukiwanie zostało wykonane wcześniej.",
    instruction='''
        Otrzymujesz wyniki wyszukiwania w {search_results}.
        Przeanalizuj je, odrzuć linki do mediów społecznościowych, portali pracy itp.
        Sklasyfikuj resztę jako "companyUrls" lub "portalUrls".
        Zwróć wynik WYŁĄCZNIE jako pojedynczy string JSON.
    ''', 
    tools=[],
    output_key="classified_links"
)

# SPECJALISTA 3: POZYSKIWANIE KONTAKTU
contact_scraper_agent = LlmAgent(
    name="ContactScraper",
    model="gemini-2.5-pro",
    description="Użyj tego narzędzia, aby pobrać dane kontaktowe (e-mail, telefon) ze sklasyfikowanych linków. Wymaga, aby analiza linków została wykonana wcześniej.",
    instruction='''
    Otrzymujesz {classified_links} – JSON z listami `companyUrls` i `portalUrls`.
    Twoim zadaniem jest zebranie jak największej ilości danych kontaktowych (e-maile, telefony, adresy) dla każdej firmy z `companyUrls`.

    Loguj swoje postępy, aby użytkownik mógł śledzić Twoje działania.

    Dla każdego linku z `companyUrls` wykonaj następujące kroki:
    1. Loguj, którą firmę przetwarzasz.
    2. Stwórz pustą listę, w której będziesz przechowywać wszystkie znalezione dane dla danej firmy.
    3. Wywołaj `simple_webfetch` na głównym linku firmy. Loguj, że wywołujesz to narzędzie.
    4. Jeśli `simple_webfetch` zwróci dane, dodaj je do swojej listy i zaloguj znalezione dane. Jeśli zwróci również `contact_links`, dla każdego z tych linków kontaktowych **ponownie wywołaj `simple_webfetch`**, logując każdy krok, i również dodaj wyniki do swojej listy.
    5. Jeśli pierwsze wywołanie `simple_webfetch` (na głównym linku) zwróci błąd lub nie znajdzie żadnych danych, zaloguj ten fakt i zamiast tego użyj narzędzia `advanced_scraper` na tym głównym linku. Loguj wywołanie `advanced_scraper` i dodaj wynik do swojej listy.
    6. Po przejściu przez wszystkie firmy, zbierz wszystkie dane ze wszystkich list w jeden zagregowany wynik.
    7. Zaloguj ostateczny, zagregowany wynik.
    8. Zwróć ostateczną, zagregowaną listę jako pojedynczy string JSON.
    ''', 
    tools=[simple_webfetch_tool, advanced_scraper_tool]
)

# SPECJALISTA 4: WYSZUKIWANIE W CEIDG
ceidg_search_specialist = LlmAgent(
    name="CeidgSearchSpecialist",
    model="gemini-2.5-pro",
    description="Użyj tego narzędzia, aby przeszukać bazę danych CEIDG w poszukiwaniu firm.",
    instruction=f'''
    Twoim zadaniem jest przeprowadzenie kompleksowego wyszukiwania i analizy firm w bazie CEIDG.

    Oto lista dostępnych kodów PKD:
    {json.dumps(pkd_data)}

    KROKI:
    1. **Analiza zapytania:** Przeanalizuj zapytanie użytkownika, aby wyodrębnić słowa kluczowe, miasto i województwo.
       Jeśli brakuje miasta, województwa lub słów kluczowych dla PKD, poproś użytkownika o te informacje.
    2. **Wyszukiwanie kodów PKD:** Na podstawie słów kluczowych i powyższej listy kodów PKD, znajdź najbardziej pasujące kody PKD.
    3. **Wyszukiwanie w CEIDG:** Wywołaj narzędzie `ceidg_search_firms` z kodami PKD uzyskanymi w poprzednim kroku, oraz miastem i województwem.
    4. **Filtrowanie AI:** Na podstawie wyników z `ceidg_search_firms` i oryginalnego zapytania użytkownika, przefiltruj listę firm, aby znaleźć te najbardziej adekwatne. Użyj do tego własnej inteligencji, nie używaj żadnych narzędzi. Zastosuj następujące kryteria:
        - **Trafność Nazwy:** Nazwa firmy powinna jak najściślej odpowiadać oryginalnemu zapytaniu lub liście słów kluczowych.
        - **Odrzucanie:** Odrzuć firmy o nazwach generycznych, niepasujących lub wielobranżowych, jeśli nie wskazują jasno na szukaną specjalizację.
        Zwróć listę przefiltrowanych firm.
    5. **Pobieranie szczegółów:** Wywołaj narzędzie `ceidg_get_firm_details` dla przefiltrowanych firm.
    6. **Zapisz wyniki:** Zapisz ostateczną listę firm ze szczegółami w kluczu `ceidg_results`.
    ''', 
    tools=[ceidg_search_tool, ceidg_details_tool],
    output_key="ceidg_results"
)


# === TWORZENIE NARZĘDZI Z NASZYCH SPECJALISTÓW ===

web_search_tool = AgentTool(agent=web_search_specialist)
link_analysis_tool = AgentTool(agent=link_analysis_specialist)
contact_scraper_tool = AgentTool(agent=contact_scraper_agent)
ceidg_search_agent_tool = AgentTool(agent=ceidg_search_specialist)


# === NOWY, INTERAKTYWNY AGENT GŁÓWNY (root_agent) ===
root_agent = LlmAgent(
    name="ConversationalSearchAssistant",
    model="gemini-2.5-pro",
    description="Asystent do interaktywnego badania internetu i bazy danych CEIDG.",
    instruction='''
    Jesteś interaktywnym asystentem do wyszukiwania i analizy danych. Twoim zadaniem jest prowadzenie rozmowy z użytkownikiem i wykonywanie jego poleceń krok po kroku.

    Twoje możliwości (narzędzia):
    1. `WebSearchSpecialist`: Przeszukuje internet.
    2. `LinkAnalysisSpecialist`: Analizuje i klasyfikuje wyniki wyszukiwania z internetu.
    3. `ContactScraper`: Pobiera dane kontaktowe ze stron internetowych.
    4. `CeidgSearchSpecialist`: Przeszukuje bazę danych CEIDG.

    SCHEMAT DZIAŁANIA:
    1. Na początku rozmowy przywitaj się i przedstaw swoje możliwości. Poinformuj użytkownika, że może skorzystać z następujących specjalistów:
        - `WebSearchSpecialist`: Do przeszukiwania internetu.
        - `LinkAnalysisSpecialist`: Do analizy i klasyfikacji linków.
        - `ContactScraper`: Do pobierania danych kontaktowych ze stron internetowych.
        - `CeidgSearchSpecialist`: Do przeszukiwania bazy danych CEIDG.
        Zapytaj użytkownika, z którego specjalisty chciałby skorzystać.
    2. Czekaj na polecenie użytkownika.
    3. Na podstawie wyboru użytkownika, wywołaj odpowiednie narzędzie.
    4. Po wykonaniu narzędzia, przedstaw wynik użytkownikowi w czytelny sposób i ZAPYTAJ, co chciałby zrobić dalej.
    5. **WAŻNE**: Jeśli wynikiem jest lista danych kontaktowych z narzędzia `ContactScraper` lub dane z `CeidgSearchSpecialist`, przedstaw **wszystkie** znalezione dane bez podsumowywania czy skracania.
    6. Pamiętaj, że wyniki jednego kroku są automatycznie dostępne dla kolejnego. Jeśli użytkownik prosi o analizę, użyj wyników z wcześniejszego wyszukiwania. Jeśli prosi o kontakty, użyj wyników z analizy.
    ''', 
    tools=[
        web_search_tool,
        link_analysis_tool,
        contact_scraper_tool,
        ceidg_search_agent_tool
    ]
)
