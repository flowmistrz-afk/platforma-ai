# app/tools.py
import os
import json
import time
import requests
import logging
from urllib.parse import quote
from google.adk.tools import FunctionTool
import google.generativeai as genai
from google.generativeai.types import Tool

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

# === AI CONTACT SCRAPER ===
def scrape_contact(url: str) -> dict:
    """
    Używa Gemini Pro do inteligentnej analizy strony i wyodrębnienia danych kontaktowych.
    """
    logging.info(f"Rozpoczynam inteligentny scraping AI dla URL: {url}")
    try:
        # Model jest skonfigurowany do używania Vertex AI przez zmienną środowiskową
        model = genai.GenerativeModel(
            'gemini-2.5-pro',
            system_instruction="Jesteś AI scraperem. Twoim zadaniem jest pobranie treści z danego URL, wyodrębnienie informacji zgodnie z instrukcją użytkownika i zwrócenie tych informacji w formacie JSON. Cała Twoja odpowiedź musi być wyłącznie danymi JSON. Jeśli nie możesz znaleźć żądanych informacji, zwróć pusty obiekt JSON z pustymi stringami jako wartościami."
        )

        prompt = f"""
Przeanalizuj zawartość podanego adresu URL i wyodrębnij informacje kontaktowe.
**URL do analizy:**
{url}
**Żądanie użytkownika:**
Wyodrębnij główny kontaktowy adres e-mail i numer telefonu ze strony internetowej.
**Instrukcje:**
1. Uzyskaj dostęp do treści podanego adresu URL.
2. Wyodrębnij dane zgodnie z żądaniem użytkownika.
3. Sformatuj ostateczny wynik jako prawidłowy obiekt JSON z dwoma kluczami: "email" i "phone".
4. Jeśli nie możesz znaleźć żądanych informacji, wartością powinien być pusty ciąg znaków ("").
5. Nie dołączaj żadnych wyjaśnień, tekstu wprowadzającego ani formatowania markdown. Odpowiedź musi zawierać wyłącznie dane JSON.
"""
        # POPRAWKA DLA VERTEX AI:
        # Aktywujemy wbudowane narzędzie do wyszukiwania, przekazując pusty obiekt
        # do parametru `google_search_retrieval` w konstruktorze `Tool`.
        # To unika błędu importu, ponieważ nie importujemy już `GoogleSearchRetrieval`.
        google_search_tool = Tool(google_search_retrieval={})

        response = model.generate_content(
            prompt,
            tools=[google_search_tool]
        )

        logging.info(f"Otrzymano odpowiedź od Gemini dla {url}: {response.text}")

        clean_text = response.text.strip().replace('```json', '').replace('```', '').strip()
        parsed_json = json.loads(clean_text)
        
        email = parsed_json.get("email", "")
        phone = parsed_json.get("phone", "")

        return {"url": url, "email": email, "phone": phone}

    except json.JSONDecodeError:
        logging.error(f"Nie udało się zdekodować JSON z odpowiedzi Gemini dla {url}. Odpowiedź: {clean_text}")
        return {"url": url, "error": "Invalid JSON response from AI."}
    except Exception as e:
        logging.error(f"Błąd podczas AI scrapingu dla {url}: {e}")
        return {"url": url, "error": str(e)}


# === NARZĘDZIA ADK ===
google_search_custom_tool = FunctionTool(func=perform_maximum_google_search)
scrape_contact_tool = FunctionTool(func=scrape_contact)
