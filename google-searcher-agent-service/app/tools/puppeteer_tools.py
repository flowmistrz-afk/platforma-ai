# google-searcher-agent-service/app/tools/puppeteer_tools.py
import os
import requests
from google.adk.tools.tool_context import ToolContext

PUPPETEER_SERVICE_URL = os.environ.get("PUPPETEER_SERVICE_URL")

def _call_puppeteer(action: str, params: dict, session_id: str) -> dict:
    """Wewnętrzna funkcja do komunikacji z usługą Puppeteer."""
    if not PUPPETEER_SERVICE_URL:
        raise ValueError("Brak skonfigurowanego adresu URL usługi Puppeteer (PUPPETEER_SERVICE_URL).")

    print(f"[PuppeteerTool] -> Sesja {session_id}, Akcja: {action}")
    
    try:
        response = requests.post(
            f"{PUPPETEER_SERVICE_URL}/execute",
            json={"action": action, "params": params, "sessionId": session_id},
            timeout=180
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"[PuppeteerTool] Błąd krytyczny: {e}")
        return {"success": False, "error": str(e)}

# --- Narzędzia dla Agentów ---

def go_to_url_and_look(url: str, tool_context: ToolContext) -> str:
    """
    Nawiguje do podanego adresu URL, czeka na załadowanie strony,
    a następnie "rozgląda się" i zwraca uproszczoną strukturę DOM
    zawierającą tylko interaktywne i widoczne elementy.
    """
    session_id = tool_context.state.get("puppeteer_session_id")
    if not session_id:
        return "Błąd: Brak puppeteer_session_id w stanie sesji."
        
    _call_puppeteer('goToURL', {'url': url}, session_id)
    view = _call_puppeteer('lookAtPage', {}, session_id)
    
    if view.get('success') and view.get('simplifiedDom'):
        return view['simplifiedDom']
    else:
        return f"Błąd: Nie udało się uzyskać widoku strony dla {url}. Szczegóły: {view.get('error', 'Brak szczegółów')}"

def close_browser_session(tool_context: ToolContext) -> str:
    """
    Zamyka sesję przeglądarki Puppeteer, aby zwolnić zasoby.
    Należy ją wywołać na końcu każdego zadania.
    """
    session_id = tool_context.state.get("puppeteer_session_id")
    if not session_id:
        return "Brak aktywnej sesji do zamknięcia."
        
    result = _call_puppeteer('closeSession', {}, session_id)
    if result.get('success'):
        return "Sesja przeglądarki została pomyślnie zamknięta."
    else:
        return f"Błąd podczas zamykania sesji: {result.get('error', 'Brak szczegółów')}"
