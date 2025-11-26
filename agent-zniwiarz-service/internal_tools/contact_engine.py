import httpx
from bs4 import BeautifulSoup
import asyncio
import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig
import json
import os
import re
from urllib.parse import urlparse, urljoin

PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT")
LOCATION = "europe-west1"

try:
    vertexai.init(project=PROJECT_ID, location=LOCATION)
    ai_model = GenerativeModel("gemini-2.5-flash")
except Exception as e:
    print(f"WARN: Nie udało się uruchomić Vertex AI: {e}")
    ai_model = None

EMAIL_REGEX = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'

async def fetch_clean_text(client, url: str):
    try:
        # Timeout 15s
        response = await client.get(url, follow_redirects=True, timeout=15.0)
        if response.status_code != 200:
            return None, None
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Usuwamy śmieci
        for script in soup(["script", "style", "nav", "svg", "noscript"]):
            script.extract()
            
        text = soup.get_text(separator=' ', strip=True)
        return text[:20000], soup # Zwracamy też obiekt soup do szukania linków
    except Exception:
        return None, None

async def analyze_page_with_flash(text: str, url: str):
    if not ai_model: return None
    
    prompt = f"""
    Przeanalizuj tekst ze strony firmy budowlanej ({url}).
    Wyciągnij dane w płaskim JSON.
    
    JSON Schema:
    {{
        "email": "string or null",
        "phone": "string or null",
        "address": "string or null (ulica, miasto)",
        "description": "string or null (max 1 zdanie, czym się zajmują)",
        "projects": ["string"] (lista 3 realizacji/klientów)
    }}
    
    TREŚĆ: {text}
    """
    try:
        response = await ai_model.generate_content_async(
            prompt,
            generation_config=GenerationConfig(response_mime_type="application/json")
        )
        return json.loads(response.text)
    except:
        return None

async def process_single_url(client, url: str):
    target_url = url if url.startswith('http') else f'http://{url}'
    
    result = {
        "url": url,
        "email": None,
        "phone": None,
        "address": None,
        "description": None,
        "projects": [],
        "status": "FAILED"
    }

    # 1. Pobieramy stronę pierwotną
    page_text, soup = await fetch_clean_text(client, target_url)
    if not page_text:
        return result

    # 2. Analiza AI strony pierwotnej
    ai_data = await analyze_page_with_flash(page_text, target_url)
    
    if ai_data:
        _merge_ai_data(result, ai_data)

    # 3. STRATEGIA RATUNKOWA: Jeśli brak maila, szukamy podstrony "Kontakt"
    if not result["email"] and soup:
        contact_link = None
        # Szukamy linku, który ma w nazwie lub hrefie "kontakt"
        for a in soup.find_all('a', href=True):
            href = a['href'].lower()
            text = a.get_text().lower()
            if 'kontakt' in href or 'contact' in href or 'kontakt' in text:
                # Budujemy pełny URL
                contact_link = urljoin(target_url, a['href'])
                break
        
        # Jeśli nie znaleźliśmy w linkach, próbujemy "na ślepo" standardowy URL
        if not contact_link:
             parsed = urlparse(target_url)
             base_domain = f"{parsed.scheme}://{parsed.netloc}"
             contact_link = f"{base_domain}/kontakt"

        if contact_link and contact_link != target_url:
            # Pobieramy stronę kontaktową
            contact_text, _ = await fetch_clean_text(client, contact_link)
            if contact_text:
                # Szybki regex na stronie kontaktowej (szkoda tokenów na drugie AI)
                emails = re.findall(EMAIL_REGEX, contact_text)
                if emails:
                    result["email"] = emails[0]
                    result["status"] = "FOUND_ON_CONTACT_PAGE"
                
                # Jeśli nadal brak, ewentualnie można tu puścić AI drugi raz, ale to kosztuje czas.
                # Zostańmy przy regexie na podstronie kontaktowej dla szybkości.

    # 4. Ostateczny Fallback Regex na stronie głównej
    if not result["email"]:
        emails = re.findall(EMAIL_REGEX, page_text)
        if emails:
            result["email"] = emails[0]
            if result["status"] == "FAILED": result["status"] = "REGEX_ONLY"

    return result

def _merge_ai_data(result, ai_data):
    """Pomocnicza funkcja do czyszczenia i scalania danych AI"""
    # Adres
    raw_addr = ai_data.get("address")
    if isinstance(raw_addr, dict):
        result["address"] = ", ".join([str(v) for v in raw_addr.values() if v])
    elif raw_addr:
        result["address"] = str(raw_addr)

    # Telefon
    if ai_data.get("phone"):
        val = ai_data["phone"]
        result["phone"] = ", ".join(map(str, val)) if isinstance(val, list) else str(val)

    # Opis
    if ai_data.get("description"):
        result["description"] = str(ai_data["description"])

    # Projekty
    raw_projects = ai_data.get("projects")
    if isinstance(raw_projects, list):
        clean = []
        for p in raw_projects:
            if p: 
                clean.append(" ".join([str(v) for v in p.values() if v]) if isinstance(p, dict) else str(p))
        result["projects"] = clean
    elif isinstance(raw_projects, str):
        result["projects"] = [raw_projects]

    # Email
    raw_email = ai_data.get("email")
    if raw_email and isinstance(raw_email, str) and "@" in raw_email:
        result["email"] = raw_email
        result["status"] = "FOUND_AI"
    else:
        result["status"] = "AI_EXTRACTED" # Mamy opis, ale brak maila