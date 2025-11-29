# =============================================
# === agent.py - KOMPLETNY I POPRAWNY KOD ===
# =============================================
from google.adk.agents import LlmAgent
from google.adk.tools import AgentTool
from .tools import (
    google_search_custom_tool,
    simple_webfetch_tool,
    advanced_scraper_tool,
    ceidg_search_tool,
    ceidg_details_tool
)
import asyncio
import json
import re
import logging
import html
from google.genai.types import Content, Part , Blob
from typing import Optional, TYPE_CHECKING, Dict, Any

if TYPE_CHECKING:
    from google.adk.tools.tool_context import ToolContext
    from google.adk.tools.base_tool import BaseTool

# Wczytaj dane PKD
with open("app/pkd-database.json", "r", encoding="utf-8") as f:
    pkd_data = json.load(f)

# =============================================
# === SPECJALIŚCI ===
# =============================================
web_search_specialist = LlmAgent(
    name="WebSearchSpecialist",
    model="gemini-2.5-pro",
    description="Przeszukuje Google i zwraca WSZYSTKIE wyniki.",
    instruction='''
Twoje zadanie:
1. Wywołaj `perform_maximum_google_search` z zapytaniem użytkownika.
2. **NIE DODAWAJ ŻADNYCH KOMENTARZY, NIE UŻYWAJ MARKDOWN, NIE PISZ "Wywołuję wyszukiwanie..."**
3. Zwróć **TYLKO I WYŁĄCZNIE** JSON w formacie:
{
  "search_results": {
    "raw_search_results": [ ... ],
    "total_found": 84
  }
}
**BEZ ```json, BEZ TEKSTU PRZED I PO, BEZ OBJAŚNIEŃ.**
''',
    tools=[google_search_custom_tool],
)

link_analysis_specialist = LlmAgent(
    name="LinkAnalysisSpecialist",
    model="gemini-2.5-pro",
    description="Klasyfikuje linki z wyników wyszukiwania.",
    instruction='''
Sprawdź kontekst sesji. Jeśli są wyniki wyszukiwania, sklasyfikuj linki na firmowe i portale, odrzucając social media i portale pracy. Zwróć TYLKO JSON: {"companyUrls": [...], "portalUrls": [...]}. Jeśli nie ma wyników, odpowiedz: "Brak wyników. Najpierw użyj WebSearchSpecialist."
''',
    tools=[],
    output_key="classified_links"
)

contact_scraper_agent = LlmAgent(
    name="ContactScraper",
    model="gemini-2.5-pro",
    description="Pobiera dane kontaktowe z linków firm.",
    instruction='''
Sprawdź kontekst. Jeśli są sklasyfikowane linki firm (`companyUrls`), dla każdego z nich użyj `simple_webfetch` lub `advanced_scraper`, aby znaleźć dane kontaktowe. Zbierz wszystkie dane i zwróć jako JSON. Jeśli nie ma linków, odpowiedz: "Brak linków. Najpierw użyj WebSearchSpecialist."
''',
    tools=[simple_webfetch_tool, advanced_scraper_tool]
)

direct_contact_scraper_agent = LlmAgent(
    name="DirectContactScraper",
    model="gemini-2.5-pro",
    description="Pobiera dane kontaktowe z podanego przez użytkownika linku.",
    instruction='''
Jeśli w wiadomości od użytkownika jest link, użyj `simple_webfetch` lub `advanced_scraper`, aby pobrać z niego dane kontaktowe. Zwróć je w czytelnym tekście. Jeśli nie ma linku, odpowiedz: "Proszę podać link do strony, z której mam pobrać dane kontaktowe."
''',
    tools=[simple_webfetch_tool, advanced_scraper_tool]
)

ceidg_search_specialist = LlmAgent(
    name="CeidgSearchSpecialist",
    model="gemini-2.5-pro",
    description="Szuka firm w CEIDG.",
    instruction=f'''
Na podstawie zapytania użytkownika (słowa kluczowe, miasto, województwo) i dostępnych kodów PKD: {json.dumps(pkd_data)}, znajdź odpowiednie kody PKD, a następnie użyj narzędzi `ceidg_search_firms` i `ceidg_get_firm_details`, aby znaleźć firmy. Zapisz wyniki w `ceidg_results`.
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

# ================================================================= #
# === CALLBACK Z POPRAWIONYM MECHANIZMEM RENDEROWANIA ===
# ================================================================= #
# ================================================================= #
# === CALLBACK Z POPRAWIONYM MECHANIZMEM RENDEROWANIA ===
# ================================================================= #
# ================================================================= #
# === CALLBACK Z POPRAWIONYM MECHANIZMEM RENDEROWANIA ===
# ================================================================= #
async def after_tool_root_callback(
    tool: "BaseTool",
    args: Dict[str, Any],
    tool_context: "ToolContext",
    tool_response: Any,
) -> Optional[Content]:
    """
    Ten callback przechwytuje wynik z WebSearchSpecialist, formatuje go jako HTML
    i zapisuje jako artifact dla renderowania w WebUI.
    """
    if not (hasattr(tool, "agent") and tool.agent.name == "WebSearchSpecialist"):
        return None

    logging.warning(f"[CALLBACK] Przechwycono odpowiedź z '{tool.name}'. Rozpoczynanie formatowania HTML.")

    raw_response_str = tool_response if isinstance(tool_response, str) else str(tool_response)
    
    json_str = None
    # Try to find JSON within a markdown code block
    match = re.search(r"```json\s*(\{.*?\})\s*```", raw_response_str, re.DOTALL)
    if match:
        json_str = match.group(1)
    else:
        # Fallback to finding the first and last curly brace
        match = re.search(r"\{.*\}", raw_response_str, re.DOTALL)
        if match:
            json_str = match.group(0)

    if not json_str:
        return Content(parts=[Part(text="Błąd przetwarzania wyników: nie znaleziono JSON.")], role="function")

    try:
        parsed_response = json.loads(json_str)
        search_results_data = parsed_response.get("search_results")
    except json.JSONDecodeError:
        return Content(parts=[Part(text="Błąd odczytu wyników (JSONDecodeError).")], role="function")
    
    if not search_results_data:
        return Content(parts=[Part(text="Nie udało się uzyskać wyników (brak klucza 'search_results').")], role="function")

    raw_results = search_results_data.get("raw_search_results", [])
    total_found = search_results_data.get("total_found", 0)

    if not raw_results:
        return Content(parts=[Part(text="Nie znalazłem żadnych wyników.")], role="function")

    # Budowanie stringu HTML na podstawie wyników
    display_text = f"<h3 style='color: #e8eaed; font-weight: 500;'>Znalazłem {total_found} wyników:</h3><ul style='list-style-type:none; padding-left:0; font-family: sans-serif;'>"
    for item in raw_results[:]:
        title = html.escape(item.get("title") or "Brak tytułu")
        link = item.get("link", "#")
        snippet = html.escape(item.get("snippet") or "Brak opisu.")
        display_text += f"<li style='margin-bottom: 12px; border: 1px solid #444; padding: 10px; border-radius: 8px;'><a href='{link}' target='_blank' style='font-size: 1.1em; text-decoration: none; color: #8ab4f8; font-weight: 600;'>{title}</a><p style='margin: 5px 0 0; color: #bdc1c6; font-size: 0.9em;'>{snippet}</p></li>"
    display_text += "</ul>"

    # POPRAWKA: Użyj Part(inline_data=...) z Blobem, aby ustawić poprawny mime_type
    html_blob = Blob(data=display_text.encode("utf-8"), mime_type="text/html")
    html_artifact = Part(inline_data=html_blob)
    await tool_context.save_artifact(filename="search_results.html", artifact=html_artifact)

    tool_context.actions.skip_summarization = True
    logging.warning("[CALLBACK] HTML zapisany jako artifact. Zwracam tekst wskazujący na artifact.")

    # Zwróć Content z role="function" (jako tool response), z tekstem dla czatu
    return Content(
        role="function",
        parts=[Part(text=f"Znalazłem {total_found} wyników. Sprawdź artifact 'search_results.html' dla pełnej listy.")]
    )
# === ROOT AGENT ===
# =============================================
root_agent = LlmAgent(
    name="ConversationalSearchAssistant",
    model="gemini-2.5-pro",
    description="Główny asystent interaktywny.",
    instruction='''
JESTEŚ PRECYZYJNYM ROUTEREM. Twoim zadaniem jest analiza zapytania i wybranie jednego, najbardziej pasującego narzędzia.
Po otrzymaniu wyniku od narzędzia, po prostu go zwróć.
''',
    tools=[
        web_search_tool,
        link_analysis_tool,
        contact_scraper_tool,
        direct_contact_scraper_tool, # Poprawiłem literówkę w nazwie
        ceidg_search_agent_tool
    ],
    after_tool_callback=after_tool_root_callback
)