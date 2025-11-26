from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import List # Dodane dla typowania listy wyników
from schemas import (
    HarvestRequest, HarvestResponse, LeadResult, 
    SmartRequest, SmartResponse, StrategyInfo,
    EnrichRequest, EnrichResult # <-- Dodano nowe schematy
)
import asyncio

# Importujemy nasze narzędzia wewnętrzne (Silniki)
from internal_tools.google_engine import search_google_internal
# from internal_tools.ceidg_engine import search_ceidg_internal
from internal_tools.brain_engine import generate_strategy
from internal_tools.contact_engine import batch_enrich_urls # <-- Dodano silnik kontaktowy

app = FastAPI(title="Agent Żniwiarz Standalone (All-in-One)")

# --- KONFIGURACJA CORS ---
origins = [
    "*"  # Pozwalamy na dostęp z każdego źródła (Frontend)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- WSPÓLNA LOGIKA WYKONAWCZA (CORE) ---
async def execute_harvest_logic(cities, keywords, pkd_codes=None):
    """
    Ta funkcja wykonuje brudną robotę (szukanie). 
    Jest używana zarówno przez tryb ręczny, jak i inteligentny.
    """
    tasks = []
    
    # 1. Zadania dla Google
    # Sprawdzamy czy mamy dane wejściowe, żeby nie robić pustych przebiegów
    if cities and keywords:
        for city in cities:
            for keyword in keywords:
                query = f"{keyword} {city}"
                tasks.append(process_google(query, city))
            
    # 2. Zadania dla CEIDG (jeśli podano kody)
    # if pkd_codes and cities:
    #     for city in cities:
    #         for pkd in pkd_codes:
    #             tasks.append(process_ceidg(pkd, city))
    
    # Jeśli nie ma żadnych zadań, zwracamy pustą listę
    if not tasks:
        return []

    # 3. Odpalamy wszystko naraz (Równolegle)
    results_nested = await asyncio.gather(*tasks)
    
    # 4. Spłaszczamy listę list (List[List[Lead]] -> List[Lead])
    flat_leads = [item for sublist in results_nested for item in sublist]
    
    return flat_leads

# --- ENDPOINT 1: MANUALNY (Stary formularz) ---
@app.post("/harvest", response_model=HarvestResponse)
async def harvest_endpoint(request: HarvestRequest):
    leads = await execute_harvest_logic(
        cities=request.cities, 
        keywords=request.keywords, 
        pkd_codes=request.pkd_codes
    )
    return HarvestResponse(total=len(leads), leads=leads)

# --- ENDPOINT 2: INTELIGENTNY (Nowy "Mózg") ---
@app.post("/smart-harvest", response_model=SmartResponse)
async def smart_harvest_endpoint(request: SmartRequest):
    # 1. Generowanie strategii przez AI (Gemini)
    # To wywołuje funkcję z pliku internal_tools/brain_engine.py
    strategy_data = await generate_strategy(request.prompt)
    
    # Konwersja słownika na obiekt Pydantic
    strategy = StrategyInfo(**strategy_data)
    
    # 2. Wykonanie strategii (Używamy tej samej logiki co wyżej)
    leads = await execute_harvest_logic(
        cities=strategy.target_cities, 
        keywords=strategy.keywords, 
        pkd_codes=strategy.pkd_codes
    )
    
    # 3. Zwrócenie wyniku (Strategia + Znalezione firmy)
    return SmartResponse(
        strategy=strategy,
        harvest_result=HarvestResponse(total=len(leads), leads=leads)
    )

# --- ENDPOINT 3: DETEKTYW (Pobieranie E-maili) ---
@app.post("/enrich", response_model=List[EnrichResult])
async def enrich_endpoint(request: EnrichRequest):
    """
    Przyjmuje listę URLi, wchodzi na każdy i szuka maila.
    """
    # Unikalne URLe (żeby nie skrapować tego samego 2 razy)
    unique_urls = list(set(request.urls))
    
    # Wywołanie funkcji z contact_engine.py
    results = await batch_enrich_urls(unique_urls)
    
    # Mapowanie na model Pydantic
    return [EnrichResult(**r) for r in results]


# --- FUNKCJE POMOCNICZE (Mappers) ---

async def process_google(query, city):
    # Wywołuje silnik Google z paginacją (pobiera do 30 wyników na zapytanie)
    raw_data = await search_google_internal(query, target_count=30)
    
    leads = []
    for item in raw_data:
        leads.append(LeadResult(
            name=item.get('title', 'Brak nazwy'),
            url=item.get('url'),
            city=city,
            source="Google API",
            metadata={"desc": item.get('description', '')},
            status="RAW" # Domyślny status
        ))
    return leads

async def process_ceidg(pkd, city):
    # Wywołuje silnik CEIDG (obecnie zwraca pustą listę, póki nie dodasz klucza)
    # raw_data = await search_ceidg_internal(pkd, city)
    # Tu byłaby konwersja danych z CEIDG na LeadResult
    return []