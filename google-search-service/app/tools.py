# /app/tools.py (WERSJA OSTATECZNA I DZIAŁAJĄCA)

import os
import json
import requests
from urllib.parse import quote
from google.adk.tools import FunctionTool

def perform_google_search(query: str) -> str:
    """
    Wykonuje wyszukiwanie Google poprzez bezpośrednie zapytanie do Google Custom Search API.
    To jest jedyny niezawodny sposób na zintegrowanie wyszukiwania z hierarchią agentów.
    """
    api_key = os.environ.get("SEARCH_API_KEY")
    search_engine_id = os.environ.get("SEARCH_ENGINE_CX")

    if not api_key or not search_engine_id:
        error_msg = "Błąd: Brak SEARCH_API_KEY lub SEARCH_ENGINE_CX w zmiennych środowiskowych."
        print(error_msg)
        return json.dumps({"error": error_msg})

    encoded_query = quote(query)
    url = f"https://www.googleapis.com/customsearch/v1?key={api_key}&cx={search_engine_id}&q={encoded_query}"

    try:
        response = requests.get(url, timeout=20)
        response.raise_for_status()
        data = response.json()
        items = data.get("items", [])
        results = [
            {"link": item.get("link"), "title": item.get("title"), "snippet": item.get("snippet")}
            for item in items
        ]
        return json.dumps(results)
    except requests.exceptions.RequestException as e:
        error_msg = f"Błąd komunikacji z Google Search API: {e}"
        print(error_msg)
        return json.dumps({"error": error_msg})

# Tworzymy z naszej funkcji narzędzie zrozumiałe dla agenta ADK
google_search_custom_tool = FunctionTool(
    func=perform_google_search,
)