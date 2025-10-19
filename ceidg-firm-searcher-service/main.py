from fastapi import FastAPI, HTTPException
import os
import requests
from pydantic import BaseModel
from typing import List

# --- "NA SZTYWNO" WKLEJONY KLUCZ API DLA TESTU ---
CEIDG_API_KEY = "eyJraWQiOiJjZWlkZyIsImFsZyI6IkhTNTEyIn0.eyJnaXZlbl9uYW1lIjoiTUFHREFMRU5BIiwicGVzZWwiOiI4MDEwMDQwODA4NyIsImlhdCI6MTc1OTgxODg3NiwiZmFtaWx5X25hbWUiOiJNT1NLSUVXSUNaIiwiY2xpZW50X2lkIjoiVVNFUi04MDEwMDQwODA4Ny1NQUdEQUxFTkEtTU9TS0lFV0lDWiJ9.JHIDfIzwhnd8rAP8ST-xerWwMznHdyrpQB_GxmC7gpYLEG--QE9op3BALW125UR70LMsojH-YyQ1jleRcbC8xQ"

class SearchRequest(BaseModel):
    pkd_codes: List[str]
    city: str
    province: str
    radius: int = 0

app = FastAPI()

CEIDG_API_URL = "https://dane.biznes.gov.pl/api/ceidg/v3/firmy"
MAX_PAGES_TO_FETCH = 20

async def execute_ceidg_query_with_pagination(params: dict, headers: dict) -> List[dict]:
    all_firms = []
    req = requests.Request('GET', CEIDG_API_URL, params=params, headers=headers).prepare()
    next_url = req.url
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
            response = requests.get(next_url, headers=headers)
            if response.status_code == 401:
                raise HTTPException(status_code=401, detail="Authorization error with CEIDG API.")
            response.raise_for_status()
            # Sprawdzamy, czy odpowiedź nie jest pusta, zanim spróbujemy ją parsować jako JSON
            if not response.text:
                print(f"[CEIDG-SEARCHER] Received empty response from API. Halting pagination.")
                break
            data = response.json()
            if data.get("firmy"):
                for firma in data["firmy"]:
                    all_firms.append({"id": firma.get("id"), "nazwa": firma.get("nazwa")})
            next_url = data.get("links", {}).get("next")
        except requests.exceptions.JSONDecodeError:
            print(f"[CEIDG-SEARCHER] Failed to decode JSON from an empty or invalid response. Halting.")
            break
        except requests.exceptions.RequestException as e:
            print(f"[CEIDG-SEARCHER] Critical error during API communication: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    return all_firms

@app.post("/search")
async def search_firms(request: SearchRequest):
    if not CEIDG_API_KEY:
        raise HTTPException(status_code=500, detail="CEIDG_API_KEY is not configured.")
    headers = {'Authorization': f'Bearer {CEIDG_API_KEY}'}
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
