import os
import json
import time
import requests
import logging
import re
import httpx
import asyncio
from urllib.parse import quote
from google.adk.tools import FunctionTool
from bs4 import BeautifulSoup
from typing import Dict, List, Optional

# === KONFIGURACJA LOGOWANIA ===
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# === GOOGLE SEARCH ===
def perform_maximum_google_search(query: str) -> dict:
    api_key = os.environ.get("SEARCH_API_KEY")
    search_engine_id = os.environ.get("SEARCH_ENGINE_CX")

    if not api_key or not search_engine_id:
        error_msg = "Błąd konfiguracji: Brak kluczy API (SEARCH_API_KEY, SEARCH_ENGINE_CX)."
        logging.error(error_msg)
        return {
            "raw_search_results": [],
            "total_found": 0,
            "error": error_msg
        }

    all_results = []
    num_pages_to_fetch = 10  # max 100 wyników
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

    total = len(all_results)
    logging.info(f"[Google Search] Pobrano dokładnie {total} linków dla zapytania: '{query}'")

    return {
        "raw_search_results": all_results,
        "total_found": total
    }

# === AI CONTACT SCRAPER ===
PUPPETEER_SERVICE_URL = os.environ.get("PUPPETEER_SERVICE_URL", "http://localhost:8080/execute")

def simple_webfetch(url: str, timeout: int = 10, user_agent: Optional[str] = None) -> Dict[str, List[str]]:
    logging.info(f"[simple_webfetch] Próba pobrania danych z: {url}")
    if url.lower().endswith('.pdf'):
        logging.info(f"[simple_webfetch] Pomijanie pliku PDF: {url}")
        return {}

    headers = {}
    if user_agent:
        headers['User-Agent'] = user_agent
    else:
        headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    
    try:
        response = requests.get(url, headers=headers, timeout=timeout)
        response.raise_for_status()
        html = response.text
    except requests.exceptions.RequestException as e:
        logging.error(f"[simple_webfetch] Błąd podczas pobierania {url}: {str(e)}")
        return {"error": [f"Błąd podczas pobierania {url}: {str(e)}"]}
    
    soup = BeautifulSoup(html, 'html.parser')
    contacts = {"emails": [], "phones": [], "contact_links": [], "addresses": []}
    
    # Email
    email_pattern = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
    for text in soup.find_all(text=True):
        contacts["emails"].extend(email_pattern.findall(text))
    for a in soup.find_all('a', href=True):
        if a['href'].startswith('mailto:'):
            email = a['href'][7:].split('?')[0]
            if email not in contacts["emails"]:
                contacts["emails"].append(email)
    
    # Telefon
    phone_pattern = re.compile(r'(?:(?:\+|00)[1-9]{1,3}[ -]?)?(?:\d{3}[ -]?\d{3}[ -]?\d{3}|\d{2}[ -]?\d{3}[ -]?\d{2}[ -]?\d{2}|\d{9}|\d{11})')
    for text in soup.find_all(text=True):
        contacts["phones"].extend(phone_pattern.findall(text))
    for a in soup.find_all('a', href=True):
        if a['href'].startswith('tel:'):
            phone = a['href'][4:]
            if phone not in contacts["phones"]:
                contacts["phones"].append(phone)
    
    # Linki kontaktowe
    contact_keywords = ['kontakt', 'contact', 'formularz', 'form', 'napisz', 'write', 'email us']
    for a in soup.find_all('a'):
        if a.text.lower() in contact_keywords or any(kw in a.get('href', '').lower() for kw in contact_keywords):
            link = a['href']
            if not link.startswith('http'):
                link = url.rstrip('/') + '/' + link.lstrip('/')
            if link not in contacts["contact_links"]:
                contacts["contact_links"].append(link)
    
    # Adresy
    address_pattern = re.compile(r'\b(?:ul\.|ulica|al\.|aleja|pl\.|plac)?\s*[A-Z][a-z]+\s*\d+[a-z]?(?:/[a-zA-Z0-9]+)?\s*,\s*\d{2}-\d{3}\s*[A-Z][a-z]+')
    for text in soup.find_all(text=True):
        contacts["addresses"].extend(address_pattern.findall(text))
    
    for key in contacts:
        contacts[key] = list(set(contacts[key]))
    
    logging.info(f"[simple_webfetch] Znalezione dane dla {url}: {contacts}")
    return contacts

def advanced_scraper(url: str) -> dict:
    logging.info(f"[advanced_scraper] Próba pobrania danych z: {url}")
    if url.lower().endswith('.pdf'):
        logging.info(f"[advanced_scraper] Pomijanie pliku PDF: {url}")
        return {}

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
            logging.error(f"[advanced_scraper] Błąd puppeteer dla {url}: {result.get('error', 'Puppeteer failed')}")
            return {"url": url, "error": result.get("error", "Puppeteer failed"), "success": False}

        html = result["content"]
        
        soup = BeautifulSoup(html, 'html.parser')
    
        contacts = {
            "emails": [],
            "phones": [],
            "contact_links": [],
            "addresses": []
        }
        
        # Ekstrakcja emaili
        email_pattern = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
        for text in soup.find_all(text=True):
            emails = email_pattern.findall(text)
            contacts["emails"].extend(emails)
        
        for a in soup.find_all('a', href=True):
            if a['href'].startswith('mailto:'):
                email = a['href'][7:].split('?')[0]  # Usuwamy parametry
                if email not in contacts["emails"]:
                    contacts["emails"].append(email)
        
        # Ekstrakcja numerów telefonów (przykładowe wzorce dla PL i międzynarodowe)
        phone_pattern = re.compile(r'(?:(?:\+|00)[1-9]{1,3}[ -]?)?(?:\d{3}[ -]?\d{3}[ -]?\d{3}|\d{2}[ -]?\d{3}[ -]?\d{2}[ -]?\d{2}|\d{9}|\d{11})')
        for text in soup.find_all(text=True):
            phones = phone_pattern.findall(text)
            contacts["phones"].extend(phones)
        
        for a in soup.find_all('a', href=True):
            if a['href'].startswith('tel:'):
                phone = a['href'][4:]
                if phone not in contacts["phones"]:
                    contacts["phones"].append(phone)
        
        # Linki do kontaktu
        contact_keywords = ['kontakt', 'contact', 'formularz', 'form', 'napisz', 'write', 'email us']
        for a in soup.find_all('a'):
            if a.text.lower() in contact_keywords or any(kw in a.get('href', '').lower() for kw in contact_keywords):
                link = a['href']
                if not link.startswith('http'):
                    link = url.rstrip('/') + '/' + link.lstrip('/')
                if link not in contacts["contact_links"]:
                    contacts["contact_links"].append(link)
        
        # Adresy fizyczne (proste wykrywanie ulic, miast, kodów pocztowych)
        address_pattern = re.compile(r'\b(?:ul\.|ulica|al\.|aleja|pl\.|plac)?\s*[A-Z][a-z]+\s*\d+[a-z]?(?:/[a-zA-Z0-9]+)?\s*,\s*\d{2}-\d{3}\s*[A-Z][a-z]+')
        for text in soup.find_all(text=True):
            addresses = address_pattern.findall(text)
            contacts["addresses"].extend(addresses)
        
        # Usuwanie duplikatów
        for key in contacts:
            contacts[key] = list(set(contacts[key]))

        logging.info(f"[advanced_scraper] Znalezione dane dla {url}: {contacts}")
        return contacts

    except Exception as e:
        logging.error(f"[advanced_scraper] Krytyczny błąd dla {url}: {e}")
        return {"url": url, "error": str(e), "success": False}
    finally:
        # Zamknij sesję
        requests.post(PUPPETEER_SERVICE_URL, json={
            "action": "closeSession",
            "params": {},
            "sessionId": session_id
        }).ok

# === CEIDG TOOLS ===
CEIDG_API_KEY = os.getenv("CEIDG_API_KEY")
CEIDG_SEARCH_URL = "https://dane.biznes.gov.pl/api/ceidg/v3/firmy"
CEIDG_DETAILS_URL = "https://dane.biznes.gov.pl/api/ceidg/v3/firma"

async def ceidg_search_firms(pkd_codes: List[str], city: str, province: str) -> List[dict]:
    if not CEIDG_API_KEY:
        return [{"error": "CEIDG_API_KEY is not configured."}]
    
    headers = {
        'Authorization': f'Bearer {CEIDG_API_KEY}',
        'Accept': 'application/json'
    }
    
    params = {
        "miasto": city,
        "wojewodztwo": province,
        "pkd": [pkd.replace(".", "") for pkd in pkd_codes],
        "status": "AKTYWNY",
        "limit": "25"
    }
    
    all_firms = []
    async with httpx.AsyncClient() as client:
        try:
            logging.info(f"[ceidg_search_firms] Wyszukiwanie firm z parametrami: {params}")
            response = await client.get(CEIDG_SEARCH_URL, params=params, headers=headers, timeout=30.0)
            response.raise_for_status()
            data = response.json()
            if data.get("firmy"):
                for firma in data["firmy"]:
                    all_firms.append({"id": firma.get("id"), "nazwa": firma.get("nazwa")})
            logging.info(f"[ceidg_search_firms] Znaleziono {len(all_firms)} firm.")
        except httpx.HTTPStatusError as e:
            logging.error(f"[ceidg_search_firms] Błąd API CEIDG: {e}")
            return [{"error": f"Błąd API CEIDG: {e}"}]
        except Exception as e:
            logging.error(f"[ceidg_search_firms] Nieoczekiwany błąd: {e}")
            return [{"error": f"Nieoczekiwany błąd: {e}"}]
            
    return all_firms

async def ceidg_get_firm_details(firm_ids: List[str]) -> List[dict]:
    if not CEIDG_API_KEY:
        return [{"error": "CEIDG_API_KEY is not configured."}]

    headers = {
        'Authorization': f'Bearer {CEIDG_API_KEY}',
        'Accept': 'application/json'
    }

    all_details = []
    async with httpx.AsyncClient() as client:
        for firm_id in firm_ids:
            try:
                logging.info(f"[ceidg_get_firm_details] Pobieranie szczegółów dla firmy: {firm_id}")
                response = await client.get(f"{CEIDG_DETAILS_URL}/{firm_id}", headers=headers, timeout=30.0)
                response.raise_for_status()
                data = response.json()
                if data.get("firma"):
                    all_details.extend(data["firma"])
                await asyncio.sleep(3.6) # Respect API rate limit
            except httpx.HTTPStatusError as e:
                logging.error(f"[ceidg_get_firm_details] Błąd API CEIDG dla ID {firm_id}: {e}")
                continue
            except Exception as e:
                logging.error(f"[ceidg_get_firm_details] Nieoczekiwany błąd dla ID {firm_id}: {e}")
                continue
    
    logging.info(f"[ceidg_get_firm_details] Pobrane szczegóły dla {len(all_details)} firm.")
    return all_details

# === NARZĘDZIA ADK ===
google_search_custom_tool = FunctionTool(func=perform_maximum_google_search)
simple_webfetch_tool = FunctionTool(func=simple_webfetch)
advanced_scraper_tool = FunctionTool(func=advanced_scraper)
ceidg_search_tool = FunctionTool(func=ceidg_search_firms)
ceidg_details_tool = FunctionTool(func=ceidg_get_firm_details)
