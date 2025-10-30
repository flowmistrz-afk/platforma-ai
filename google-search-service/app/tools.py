# app/tools.py
import os
import json
import time
import requests
import logging
import re
from urllib.parse import quote
from google.adk.tools import FunctionTool

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# === GOOGLE SEARCH ===
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

# === CONTACT SCRAPER ===
PUPPETEER_SERVICE_URL = os.environ.get("PUPPETEER_SERVICE_URL", "http://localhost:8080/execute")  # Zmień na swój

def scrape_contact(url: str) -> dict:
    # 1. Prosty fetch
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        text = response.text

        email = _extract_email(text)
        phone = _extract_phone(text)

        if email or phone:
            return {"url": url, "email": email, "phone": phone}
    except Exception as e:
        logging.warning(f"Simple fetch failed for {url}: {e}")

    # 2. Puppeteer – użyj istniejącego serwisu
    session_id = f"scrape-{hash(url) % 10000}"
    try:
        # Krok 1: Otwórz stronę
        requests.post(PUPPETEER_SERVICE_URL, json={
            "action": "goToURL",
            "params": {"url": url},
            "sessionId": session_id
        }, timeout=30)

        # Krok 2: Pobierz treść
        result = requests.post(PUPPETEER_SERVICE_URL, json={
            "action": "scrapeContent",
            "params": {},
            "sessionId": session_id
        }, timeout=60).json()

        if not result.get("success"):
            return {"url": url, "error": result.get("error", "Puppeteer failed")}

        html = result["content"]
        email = _extract_email(html)
        phone = _extract_phone(html)

        return {"url": url, "email": email, "phone": phone}

    except Exception as e:
        return {"url": url, "error": str(e)}
    finally:
        # Zamknij sesję
        requests.post(PUPPETEER_SERVICE_URL, json={
            "action": "closeSession",
            "params": {},
            "sessionId": session_id
        }).ok

def _extract_email(text: str) -> str:
    match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)
    return match.group(0) if match else ""

def _extract_phone(text: str) -> str:
    matches = re.findall(r'(\+?\d{1,4}[\s\.\-]?)?\(?\d{1,4}\)?[\s\.\-]?\d{1,4}[\s\.\-]?\d{1,9}', text)
    return ''.join(filter(str.isdigit, matches[0]))[-9:] if matches else ""

# === NARZĘDZIA ADK ===
google_search_custom_tool = FunctionTool(func=perform_maximum_google_search)
scrape_contact_tool = FunctionTool(func=scrape_contact)