# app/tools.py
import os
import json
import time
import requests
import logging
from urllib.parse import quote
from google.adk.tools import FunctionTool

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def perform_maximum_google_search(query: str) -> str:
    api_key = os.environ.get("SEARCH_API_KEY")
    search_engine_id = os.environ.get("SEARCH_ENGINE_CX")

    if not api_key or not search_engine_id:
        error_msg = "Błąd konfiguracji: Brak kluczy API (SEARCH_API_KEY, SEARCH_ENGINE_CX)."
        logging.error(error_msg)
        return json.dumps({"error": error_msg})

    all_results = []
    num_pages_to_fetch = 10
    encoded_query = quote(query)

    for page in range(num_pages_to_fetch):
        start_index = 1 + page * 10
        url = f"https://www.googleapis.com/customsearch/v1?key={api_key}&cx={search_engine_id}&q={encoded_query}&start={start_index}"

        try:
            response = requests.get(url, timeout=20)
            response.raise_for_status()
            data = response.json()
            items = data.get("items", [])
            if not items:
                break
            page_results = [
                {"link": item.get("link"), "title": item.get("title"), "snippet": item.get("snippet")}
                for item in items
            ]
            all_results.extend(page_results)
            time.sleep(0.1)
        except Exception as e:
            logging.error(f"Błąd na stronie {page + 1}: {e}")
            break

    logging.info(f"Pobrano {len(all_results)} wyników.")
    return json.dumps(all_results, ensure_ascii=False)

# Narzędzie ADK
google_search_custom_tool = FunctionTool(func=perform_maximum_google_search)