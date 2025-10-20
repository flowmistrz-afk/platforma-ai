from fastapi import FastAPI, HTTPException
import os
import httpx
from pydantic import BaseModel
from typing import List

# --- KLUCZ API BĘDZIE ODCZYTYWANY ZE ZMIENNEJ ŚRODOWISKOWEJ ---
CEIDG_API_KEY = os.getenv("CEIDG_API_KEY")

class SearchRequest(BaseModel):
    pkd_codes: List[str]
    city: str
    province: str
    radius: int = 0

app = FastAPI()

CEIDG_API_URL = "https://dane.biznes.gov.pl/api/ceidg/v3/firmy"
MAX_PAGES_TO_FETCH = 1

async def execute_ceidg_query_with_pagination(params: dict, headers: dict) -> List[dict]:
    all_firms = []
    
    async with httpx.AsyncClient() as client:
        initial_req = client.build_request('GET', CEIDG_API_URL, params=params)
        next_url = str(initial_req.url)
        
        print(f"[CEIDG-SEARCHER] Starting paginated fetch from: {next_url}")
        page_count = 0
        visited_urls = set()
        
        while next_url and page_count < MAX_PAGES_TO_FETCH:
            if next_url in visited_urls:
                print(f"[CEIDG-SEARCHER] Loop detected. Halting.")
                break
            visited_urls.add(next_url)
            page_count += 1
            
            try:
                response = await client.get(next_url, headers=headers, timeout=30.0)
                
                if response.status_code == 401 or response.status_code == 403:
                    print(f"[CEIDG-SEARCHER] Authorization error with CEIDG API (Status: {response.status_code}). Check your API Key.")
                    raise HTTPException(status_code=401, detail="Authorization error with CEIDG API.")
                response.raise_for_status()
                
                if not response.text:
                    print(f"[CEIDG-SEARCHER] Received empty response from API. Halting pagination.")
                    break
                
                data = response.json()
                if data.get("firmy"):
                    for firma in data["firmy"]:
                        all_firms.append({"id": firma.get("id"), "nazwa": firma.get("nazwa")})
                
                next_url = data.get("links", {}).get("next")

            except httpx.ReadTimeout:
                print(f"[CEIDG-SEARCHER] Request to CEIDG API timed out. Halting.")
                break
            except httpx.RequestError as e:
                print(f"[CEIDG-SEARCHER] Critical error during API communication: {e}")
                raise HTTPException(status_code=500, detail=str(e))
            except Exception as e:
                print(f"[CEIDG-SEARCHER] Failed to decode JSON or other processing error: {e}. Response text: {response.text}")
                break

    return all_firms

@app.post("/search")
async def search_firms(request: SearchRequest):
    if not CEIDG_API_KEY:
        raise HTTPException(status_code=500, detail="CEIDG_API_KEY is not configured on the server.")
    
    # --- POPRAWKA: Dodajemy nagłówek 'Accept' ---
    headers = {
        'Authorization': f'Bearer {CEIDG_API_KEY}',
        'Accept': 'application/json'
    }
    
    params = {
        "miasto": request.city,
        "wojewodztwo": request.province,
        "pkd": [pkd.replace(".", "") for pkd in request.pkd_codes],
        "status": "AKTYWNY",
        "limit": "25"
    }
    
    firm_summaries = await execute_ceidg_query_with_pagination(params, headers)
    return {"firms": firm_summaries}

@app.get("/")
def read_root():
    return {"message": "CEIDG Firm Searcher Service is running"}
