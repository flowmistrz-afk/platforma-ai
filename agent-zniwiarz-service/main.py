from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from schemas import (
    HarvestRequest, HarvestResponse, LeadResult, 
    SmartRequest, SmartResponse, StrategyInfo,
    EnrichRequest, EnrichResult
)
import asyncio
import json
import httpx
from urllib.parse import urlparse

# Importy narzędzi
from internal_tools.google_engine import search_google_internal
from internal_tools.brain_engine import generate_strategy
# Importujemy funkcję przetwarzania pojedynczego URL
from internal_tools.contact_engine import process_single_url

app = FastAPI(title="Agent Żniwiarz Standalone (Streaming)")

# KONFIGURACJA CORS
origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- LOGIKA STRUMIENIOWANIA (Szukanie) ---
async def stream_harvest_logic(cities, keywords, pkd_codes=None):
    tasks = []
    
    # 1. Tworzenie zadań
    if cities and keywords:
        for city in cities:
            for keyword in keywords:
                query = f"{keyword} {city}"
                tasks.append(process_google(query, city))
            
    if not tasks:
        yield json.dumps({"type": "done"}) + "\n"
        return

    total = len(tasks)
    done = 0
    
    # ZBIÓR UNIKALNYCH DOMEN (DEDUPLIKACJA)
    seen_domains = set()

    for future in asyncio.as_completed(tasks):
        try:
            leads = await future
            done += 1
            
            if leads:
                unique_leads = []
                for lead in leads:
                    # Wyciągamy domenę (np. "painpol.com.pl")
                    if lead.url:
                        try:
                            domain = urlparse(lead.url).netloc.replace("www.", "")
                            if domain not in seen_domains:
                                seen_domains.add(domain)
                                unique_leads.append(lead)
                        except:
                            # Jeśli URL jest dziwny, dodajemy go (lepiej mieć niż zgubić)
                            unique_leads.append(lead)
                    else:
                        # Firmy bez URL też dodajemy (np. tylko telefon z map)
                        unique_leads.append(lead)

                if unique_leads:
                    chunk = {
                        "type": "leads_chunk",
                        "data": [l.dict() for l in unique_leads], # Tylko unikalne!
                        "progress": round(done/total*100)
                    }
                    yield json.dumps(chunk) + "\n"
            else:
                yield json.dumps({"type": "progress", "value": round(done/total*100)}) + "\n"
                
        except Exception as e:
            print(f"Błąd zadania: {e}")
            done += 1
    
    yield json.dumps({"type": "done"}) + "\n"

# --- LOGIKA STRUMIENIOWANIA (Detektyw/Enrich) ---
async def stream_enrich_logic(urls):
    sem = asyncio.Semaphore(10) # Max 10 równoległych analiz stron
    # Timeout 25s na stronę
    limits = httpx.Limits(max_keepalive_connections=5, max_connections=15)
    
    async with httpx.AsyncClient(limits=limits, verify=False, timeout=25.0) as client:
        
        async def sem_task(url):
            async with sem:
                return await process_single_url(client, url)

        tasks = [sem_task(url) for url in urls]
        total = len(tasks)
        completed = 0

        for future in asyncio.as_completed(tasks):
            try:
                result = await future
                completed += 1
                
                chunk = {
                    "type": "enrich_result",
                    "data": result,
                    "progress": round((completed / total) * 100)
                }
                yield json.dumps(chunk) + "\n"
                
            except Exception as e:
                print(f"Błąd Enrich: {e}")
                completed += 1

        yield json.dumps({"type": "done"}) + "\n"


# --- ENDPOINTY (Nazwy przywrócone do standardowych) ---

@app.post("/smart-harvest")
async def smart_harvest_endpoint(request: SmartRequest):
    async def event_generator():
        yield json.dumps({"type": "log", "message": "🧠 Mózg analizuje..."}) + "\n"
        
        # 1. Generowanie strategii
        strategy_data = await generate_strategy(request.prompt)
        strategy = StrategyInfo(**strategy_data)
        yield json.dumps({"type": "strategy", "data": strategy.dict()}) + "\n"
        
        yield json.dumps({"type": "log", "message": f"Szukam w: {', '.join(strategy.target_cities)}"}) + "\n"

        # 2. Uruchomienie szukania
        async for chunk in stream_harvest_logic(strategy.target_cities, strategy.keywords, strategy.pkd_codes):
            yield chunk
            
    return StreamingResponse(event_generator(), media_type="application/x-ndjson")

@app.post("/harvest")
async def harvest_endpoint(request: HarvestRequest):
    async def event_generator():
        yield json.dumps({"type": "log", "message": "Rozpoczynam wyszukiwanie ręczne..."}) + "\n"
        async for chunk in stream_harvest_logic(request.cities, request.keywords, request.pkd_codes):
            yield chunk
    return StreamingResponse(event_generator(), media_type="application/x-ndjson")

@app.post("/enrich")
async def enrich_endpoint(request: EnrichRequest):
    unique_urls = list(set(request.urls))
    return StreamingResponse(stream_enrich_logic(unique_urls), media_type="application/x-ndjson")


# --- POMOCNICZE ---
async def process_google(query, city):
    # Pobieramy max 20 wyników na zapytanie (2 strony Google)
    raw_data = await search_google_internal(query, target_count=20)
    leads = []
    for item in raw_data:
        leads.append(LeadResult(
            name=item.get('title') or 'Brak nazwy',
            url=item.get('url'),
            city=city,
            source="Google API",
            metadata={"desc": item.get('description') or ""},
            status="RAW"
        ))
    return leads