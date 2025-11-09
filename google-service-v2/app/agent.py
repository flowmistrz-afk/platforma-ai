from google.adk.agents import LlmAgent
from google.adk.tools import AgentTool
from .tools import (
    google_search_custom_tool,
    simple_webfetch_tool,
    advanced_scraper_tool,
    ceidg_search_tool,
    ceidg_details_tool
)
import json

# Wczytaj dane PKD
with open("app/pkd-database.json", "r", encoding="utf-8") as f:
    pkd_data = json.load(f)

# =============================================
# === SPECJALISTA 1: GOOGLE SEARCH ===
# =============================================
web_search_specialist = LlmAgent(
    name="WebSearchSpecialist",
    model="gemini-2.5-pro",
    description="Przeszukuje Google i zwraca WSZYSTKIE wyniki.",
    instruction='''
        Twoje zadanie:
        1. Wywołaj `perform_maximum_google_search` z zapytaniem użytkownika.
        2. Zaloguj: "Wywołuję wyszukiwanie...".
        3. **NIE FILTRUJ, NIE PODSUMOWUJ**.
        4. Zwróć **CAŁY wynik narzędzia** jako **jeden JSON**.

        **FORMAT (DOKŁADNIE TAK):**
        ```json
        {
          "raw_search_results": [
            {"link": "https://...", "title": "...", "snippet": "..."},
            ...
          ],
          "total_found": 73
        }
Użyj dokładnej liczby z wyniku narzędzia. Bez komentarzy.
''',
    tools=[google_search_custom_tool],
    output_key="search_results"
)
# =============================================
# === SPECJALISTA 2: ANALIZA LINKÓW ===
# =============================================
link_analysis_specialist = LlmAgent(
    name="LinkAnalysisSpecialist",
    model="gemini-2.5-pro",
    description="Klasyfikuje linki z wyników wyszukiwania.",
    instruction='''
Sprawdź kontekst sesji:

Jeśli nie ma klucza search_results → odpowiedz:
"Brak wyników. Najpierw użyj WebSearchSpecialist."

Jeśli dane istnieją:

Weź raw_search_results.
Odrzuć:

social media (Facebook, LinkedIn, Twitter, Instagram)
portale pracy (Indeed, Pracuj.pl)
katalogi (Wikipedia, Yellow Pages)


Sklasyfikuj:

companyUrls: strony firm
portalUrls: portale branżowe (Oferteo, Panorama Firm)



Zwróć TYLKO JSON:
json{ "companyUrls": ["url1"], "portalUrls": ["url2"] }
''',
    tools=[],
    output_key="classified_links"
)
# =============================================
# === SPECJALISTA 3: KONTAKTY ===
# =============================================
contact_scraper_agent = LlmAgent(
    name="ContactScraper",
    model="gemini-2.5-pro",
    description="Pobiera dane kontaktowe z linków firm, które zostały znalezione przez WebSearchSpecialist.",
    instruction='''
Sprawdź kontekst:

Jeśli nie ma classified_links → odpowiedz:
"Brak linków. Najpierw użyj WebSearchSpecialist."

Jeśli dane istnieją:

Dla każdego companyUrls:

Loguj: "Przetwarzam: [url]"
Użyj simple_webfetch
Jeśli contact_links → przetwórz je
Jeśli błąd → użyj advanced_scraper


Zbierz wszystko
Zwróć jako JSON string
''',
    tools=[simple_webfetch_tool, advanced_scraper_tool]
)

# =============================================
# === NOWY SPECJALISTA: BEZPOŚREDNIE ZDOBYWANIE KONTAKTÓW ===
# =============================================
direct_contact_scraper_agent = LlmAgent(
    name="DirectContactScraper",
    model="gemini-2.5-pro",
    description="Pobiera dane kontaktowe z podanego przez użytkownika linku.",
    instruction='''
Sprawdź, czy w wiadomości od użytkownika jest link (zawiera "http" lub "https").

Jeśli tak:
  Użyj tego linku.
  Loguj: "Przetwarzam: [url]"
  Użyj simple_webfetch
  Jeśli wystąpi błąd lub nie znajdziesz wystarczających danych → użyj advanced_scraper
  Zbierz wszystkie znalezione dane (e-maile, telefony, linki kontaktowe, adresy).
  Zwróć jako czytelny tekst.

Jeśli nie ma linku, odpowiedz:
"Proszę podać link do strony, z której mam pobrać dane kontaktowe."
''',
    tools=[simple_webfetch_tool, advanced_scraper_tool]
)

# =============================================
# === SPECJALISTA 4: CEIDG ===
# =============================================
ceidg_search_specialist = LlmAgent(
    name="CeidgSearchSpecialist",
    model="gemini-2.5-pro",
    description="Szuka firm w CEIDG.",
    instruction=f'''
Dostępne PKD:
{json.dumps(pkd_data)}
KROKI:

Wyodrębnij: słowa kluczowe, miasto, województwo
→ Jeśli brakuje → poproś
Znajdź kody PKD
Wywołaj ceidg_search_firms
Przefiltruj po nazwie
Wywołaj ceidg_get_firm_details
Zapisz w ceidg_results
''',
    tools=[ceidg_search_tool, ceidg_details_tool],
    output_key="ceidg_results"
)

# =============================================
# === NARZĘDZIA Z AGENTÓW ===
# =============================================
web_search_tool = AgentTool(agent=web_search_specialist)
link_analysis_tool = AgentTool(agent=link_analysis_specialist)
contact_scraper_tool = AgentTool(agent=contact_scraper_agent)
direct_contact_scraper_tool = AgentTool(agent=direct_contact_scraper_agent)
ceidg_search_agent_tool = AgentTool(agent=ceidg_search_specialist)
# =============================================
# === ROOT AGENT ===
# =============================================
root_agent = LlmAgent(
    name="ConversationalSearchAssistant",
    model="gemini-2.5-pro",
    description="Główny asystent interaktywny.",
    instruction='''
Witaj! Przedstaw się i zapytaj, co mogę dla Ciebie zrobić.

Jeśli użytkownik poda link (zawierający "http" lub "https"), przekaż go do `DirectContactScraper` w celu znalezienia danych kontaktowych.

Jeśli użytkownik poprosi o znalezienie firm lub wyszukanie czegoś w Google, użyj `WebSearchSpecialist`.

W innych przypadkach zapytaj, którego specjalisty chcesz użyć:

Specjaliści:
- `WebSearchSpecialist` – wyszukuje w Google.
- `LinkAnalysisSpecialist` – klasyfikuje linki z wyników wyszukiwania.
- `ContactScraper` – pobiera kontakty z linków znalezionych przez wyszukiwarkę.
- `DirectContactScraper` – pobiera kontakty z bezpośrednio podanego linku.
- `CeidgSearchSpecialist` – szuka firm w CEIDG.

Po wykonaniu zadania przez specjalistę, przedstaw wyniki w czytelny sposób.

Zawsze zwracaj HTML:
html<script>
  window.parent.postMessage({
    "source": "NAZWA",
    "data": { "display_text": "...", "raw_data": {...}, "total_results": X }
  }, 'https://aisp-hub-791a3.web.app');
</script>
<div>display_text</div>
''',
    tools=[
        web_search_tool,
        link_analysis_tool,
        contact_scraper_tool,
        direct_contact_scraper_tool,
        ceidg_search_agent_tool
    ]
)
