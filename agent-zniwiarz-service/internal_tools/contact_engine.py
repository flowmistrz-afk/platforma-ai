import httpx
from bs4 import BeautifulSoup
import re
import asyncio

# Regex do łapania maili
EMAIL_REGEX = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'

async def extract_contacts_from_url(url: str):
    """
    Wchodzi na stronę i szuka e-maila w treści oraz w linkach mailto:
    """
    # Fix: Czasami Google zwraca URL bez http
    target_url = url if url.startswith('http') else f'http://{url}'
    
    # Ignorujemy wielkie portale (szkoda czasu, i tak tam nie ma maila wprost)
    blacklist = ['olx.pl', 'allegro.pl', 'facebook.com', 'instagram.com', 'oferteo.pl', 'fixly.pl']
    if any(domain in target_url for domain in blacklist):
        return {"url": url, "email": None, "status": "SKIPPED_PORTAL"}

    found_emails = set()
    
    try:
        # Ustawiamy krótki timeout (5s), żeby nie czekać wiecznie na jedną stronę
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            response = await client.get(target_url)
            
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                text = soup.get_text()
                
                # 1. Szukanie regexem w tekście
                emails_text = re.findall(EMAIL_REGEX, text)
                found_emails.update(emails_text)
                
                # 2. Szukanie w linkach mailto:
                for a in soup.find_all('a', href=True):
                    if 'mailto:' in a['href']:
                        email = a['href'].replace('mailto:', '').split('?')[0]
                        found_emails.add(email)
                        
                # 3. (Opcjonalnie) Sprawdzenie podstrony /kontakt
                # ... (dla szybkości na razie pomijamy, przy 500 firmach to by trwało za długo)

    except Exception as e:
        return {"url": url, "email": None, "status": "ERROR"}

    # Filtrujemy śmieciowe maile (np. obrazki.png@2x)
    valid_emails = [e for e in found_emails if not e.endswith(('.png', '.jpg', '.jpeg', '.gif', '.svg'))]

    return {
        "url": url, 
        "email": valid_emails[0] if valid_emails else None, 
        "status": "FOUND" if valid_emails else "NO_DATA"
    }

async def batch_enrich_urls(urls: list):
    """
    Uruchamia scraping równolegle dla listy URLi
    """
    tasks = []
    # Ograniczamy współbieżność do 10-20 na raz, żeby nie zabić pamięci
    sem = asyncio.Semaphore(15) 

    async def sem_task(url):
        async with sem:
            return await extract_contacts_from_url(url)

    for url in urls:
        tasks.append(sem_task(url))
    
    results = await asyncio.gather(*tasks)
    return results