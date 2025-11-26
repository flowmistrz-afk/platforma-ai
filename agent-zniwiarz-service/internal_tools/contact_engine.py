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
    ai_model = GenerativeModel("gemini-2.5")
except Exception as e:
    print(f"WARN: Vertex AI init failed: {e}")
    ai_model = None

EMAIL_REGEX = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'

# HEADERS (Udajemy Chrome)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1"
}

# Czarne listy
IGNORE_DOMAINS = [
    'linkedin.com', 'facebook.com', 'instagram.com', 'twitter.com', 'youtube.com',
    'olx.pl', 'allegro.pl', 'sprzedajemy.pl', 'oferteo.pl', 'fixly.pl',
    'panoramafirm.pl', 'pkt.pl', 'aleo.com', 'biznes.gov.pl', 'ceidg.gov.pl',
    'owg.pl', 'krs-online.com.pl', 'rejestr.io', 'cylex-polska.pl',
    'baza-firm.com.pl', 'firmy.net', 'zumi.pl', 'gowork.pl', 'muratordom.pl',
    'google.com', 'google.pl'
]

async def fetch_clean_text(client, url: str):
    try:
        # HTTP/2 pomaga ominąć blokady (np. na deco-posadzki)
        response = await client.get(url, follow_redirects=True, timeout=25.0)
        
        # 403/404 to błąd, ale 406/418 też mogą się zdarzyć przy blokadzie
        if response.status_code not in [200, 201]:
            return None, None
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # POPRAWKA: Nie usuwamy NAV ani FOOTER, bo tam są kontakty!
        for script in soup(["script", "style", "svg", "noscript", "iframe"]):
            script.extract()
            
        text = soup.get_text(separator=' ', strip=True)
        return text[:25000], soup
    except Exception as e:
        # print(f"Fetch error {url}: {e}")
        return None, None

async def analyze_page_with_flash(text: str, url: str):
    if not ai_model: return None
    
    prompt = f"""
    Przeanalizuj stronę firmy budowlanej: {url}
    
    ZADANIE:
    1. Opisz firmę (1 zdanie).
    2. Wypisz 3 realizacje.
    3. Znajdź e-maile i telefony (szukaj w sekcjach kontakt, stopka, o nas).
    
    Zwróć JSON:
    {{
        "email": "string or null",
        "phone": "string or null",
        "address": "string or null",
        "description": "string or null",
        "projects": ["string"],
        "contacts_list": [
            {{"name": "string", "role": "string", "email": "string", "phone": "string"}}
        ]
    }}
    
    TREŚĆ: {text}
    """
    try:
        response = await ai_model.generate_content_async(
            prompt,
            generation_config=GenerationConfig(response_mime_type="application/json")
        )
        return json.loads(response.text)
    except: return None

async def process_single_url(client, url: str):
    for domain in IGNORE_DOMAINS:
        if domain in url.lower():
            return {"url": url, "status": "SKIPPED_PORTAL"}

    target_url = url if url.startswith('http') else f'http://{url}'
    
    result = {
        "url": url,
        "email": None,
        "phone": None,
        "address": None,
        "description": None,
        "projects": [],
        "contacts_list": [],
        "status": "FAILED"
    }

    # 1. Strona główna
    page_text, soup = await fetch_clean_text(client, target_url)
    
    if not page_text:
        # Jeśli HTTPS nie działa, spróbuj HTTP (dla starych stron)
        if "https" in target_url:
            target_url = target_url.replace("https", "http")
            page_text, soup = await fetch_clean_text(client, target_url)
    
    if not page_text:
        return result

    # 2. Analiza AI strony głównej
    ai_data = await analyze_page_with_flash(page_text, target_url)
    if ai_data: _merge_ai_data(result, ai_data)

    # 3. DEEP SCAN (Jeśli brak maila)
    if not result["email"] and not result.get("contacts_list"):
        
        urls_to_check = []
        
        # A. Szukanie w linkach (teraz widzi nav i footer!)
        if soup:
            for a in soup.find_all('a', href=True):
                href = a['href'].lower()
                text = a.get_text().lower()
                
                # Szukamy słów kluczowych
                keywords = ['kontakt', 'contact', 'o-nas', 'o firmie', 'biuro']
                if any(k in href or k in text for k in keywords):
                    try:
                        full_link = urljoin(target_url, a['href'])
                        if full_link != target_url and full_link.startswith('http'):
                            urls_to_check.append(full_link)
                    except: pass
        
        # B. Standardowe ścieżki (fallback)
        parsed = urlparse(target_url)
        base = f"{parsed.scheme}://{parsed.netloc}"
        defaults = [f"{base}/kontakt", f"{base}/contact", f"{base}/pl/kontakt"]
        for d in defaults:
            if d not in urls_to_check: urls_to_check.append(d)

        # Sprawdzamy unikalne, max 2
        seen = set()
        final_urls = []
        for u in urls_to_check:
            if u not in seen:
                final_urls.append(u)
                seen.add(u)

        for contact_url in final_urls[:2]:
            c_text, _ = await fetch_clean_text(client, contact_url)
            if c_text:
                # Używamy regexa na stronie kontaktowej
                emails = re.findall(EMAIL_REGEX, c_text)
                if emails:
                    valid = [e for e in emails if not e.endswith(('.png', '.jpg'))]
                    if valid:
                        result["email"] = valid[0]
                        result["status"] = "FOUND_ON_SUBPAGE"
                        break # Mamy to!

    # 4. Fallback Regex Główny
    if not result["email"] and not result["contacts_list"]:
        emails = re.findall(EMAIL_REGEX, page_text)
        if emails:
            result["email"] = emails[0]
            result["status"] = "REGEX_ONLY"

    return result

def _merge_ai_data(result, ai_data):
    # (Ta funkcja bez zmian - wklej ją z poprzedniej wersji)
    if ai_data.get("address"): result["address"] = str(ai_data["address"])
    if ai_data.get("description"): result["description"] = str(ai_data["description"])
    if ai_data.get("phone"):
        val = ai_data["phone"]
        result["phone"] = ", ".join(map(str, val)) if isinstance(val, list) else str(val)
    
    raw_pro = ai_data.get("projects")
    if isinstance(raw_pro, list): 
        result["projects"] = [str(p) for p in raw_pro if p]
    elif isinstance(raw_pro, str):
        result["projects"] = [raw_pro]
    
    raw_contacts = ai_data.get("contacts_list")
    if isinstance(raw_contacts, list):
        result["contacts_list"] = raw_contacts
        if not result["email"]:
            for c in raw_contacts:
                if c.get("email"):
                    result["email"] = c["email"]
                    break

    if ai_data.get("email") and isinstance(ai_data["email"], str) and "@" in ai_data["email"]:
        result["email"] = ai_data["email"]
        result["status"] = "FOUND_AI"
    elif not result.get("status") == "FOUND_ON_SUBPAGE":
        result["status"] = "AI_EXTRACTED"

async def batch_enrich_urls(urls: list):
    # HTTP2=True !
    async with httpx.AsyncClient(verify=False, headers=HEADERS, http2=True, timeout=30.0) as client:
        tasks = []
        sem = asyncio.Semaphore(8) # Lekko zmniejszamy, żeby nie zatykać

        async def sem_task(url):
            async with sem:
                return await process_single_url(client, url)

        for url in urls:
            tasks.append(sem_task(url))
        
        results = await asyncio.gather(*tasks)
        return results