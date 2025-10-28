# google-searcher-agent-service/app/tools.py
import os
import requests
import uuid  # <-- NOWY, WAŻNY IMPORT
from google.adk.tools.tool_context import ToolContext

PUPPETEER_SERVICE_URL = os.environ.get("PUPPETEER_SERVICE_URL")

def _get_or_create_puppeteer_session_id(tool_context: ToolContext) -> str:
    """
    Sprawdza, czy w pamięci sesji istnieje już ID sesji Puppeteera.
    Jeśli nie, tworzy nowe, unikalne ID i zapisuje je w pamięci.
    Zawsze zwraca aktywne ID sesji.
    """
    session_id = tool_context.state.get("puppeteer_session_id")
    if not session_id:
        session_id = f"puppeteer-{uuid.uuid4()}"
        tool_context.state["puppeteer_session_id"] = session_id
        print(f"[PuppeteerTool] NOWA sesja Puppeteer utworzona: {session_id}")
    return session_id

def _call_puppeteer(action: str, params: dict, session_id: str) -> dict:
    """Wewnętrzna funkcja do komunikacji z usługą Puppeteer."""
    if not PUPPETEER_SERVICE_URL:
        raise ValueError("Brak skonfigurowanego adresu URL usługi Puppeteer (PUPPETEER_SERVICE_URL).")
    print(f"[PuppeteerTool] -> Sesja {session_id}, Akcja: {action}")
    try:
        response = requests.post(
            f"{PUPPETEER_SERVICE_URL}/execute",
            json={"action": action, "params": params, "sessionId": session_id},
            timeout=300
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"[PuppeteerTool] Błąd krytyczny: {e}")
        return {"success": False, "error": str(e)}

# --- Narzędzia dla Agentów (teraz samowystarczalne) ---

def perform_web_search(query: str, tool_context: ToolContext) -> str:
    """Wyszukuje informacje w internecie i zwraca uproszczoną listę wyników."""
    session_id = _get_or_create_puppeteer_session_id(tool_context)
    _call_puppeteer('goToURL', {'url': 'https://duckduckgo.com/'}, session_id)
    _call_puppeteer('typeText', {'selector': 'input[name="q"]', 'text': query}, session_id)
    _call_puppeteer('clickElement', {'selector': 'button[type="submit"]'}, session_id)
    view = _call_puppeteer('lookAtPage', {}, session_id)
    if view.get('success') and view.get('simplifiedDom'):
        return view['simplifiedDom']
    else:
        return f"Błąd: Nie udało się uzyskać widoku strony z wynikami. Szczegóły: {view.get('error', 'Brak')}"

def scrape_website_intelligently(url: str, tool_context: ToolContext) -> str:
    """Wchodzi na podany URL i zwraca jego uproszczoną strukturę."""
    session_id = _get_or_create_puppeteer_session_id(tool_context)
    _call_puppeteer('goToURL', {'url': url}, session_id)
    view = _call_puppeteer('lookAtPage', {}, session_id)
    if view.get('success') and view.get('simplifiedDom'):
        return view['simplifiedDom']
    else:
        return f"Błąd: Nie udało się uzyskać widoku strony dla {url}. Szczegóły: {view.get('error', 'Brak')}"

def simple_web_fetch(url: str) -> str:
    """Szybko pobiera surową treść HTML z podanego adresu URL."""
    try:
        response = requests.get(url, timeout=20)
        response.raise_for_status()
        return response.text[:10000]
    except requests.exceptions.RequestException as e:
        return f"Błąd podczas pobierania {url}: {e}"

def close_browser_session(tool_context: ToolContext) -> str:
    """Zamyka sesję przeglądarki i czyści jej ID z pamięci."""
    session_id = tool_context.state.get("puppeteer_session_id")
    if not session_id:
        return "Brak aktywnej sesji do zamknięcia."
    result = _call_puppeteer('closeSession', {}, session_id)
    # Usuwamy ID z pamięci, aby następne zadanie stworzyło nową, czystą sesję
    del tool_context.state["puppeteer_session_id"]
    if result.get('success'):
        return "Sesja przeglądarki została pomyślnie zamknięta."
    else:
        return f"Błąd podczas zamykania sesji: {result.get('error', 'Brak')}"
