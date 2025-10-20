from fastapi import FastAPI, HTTPException
import os
import httpx
from pydantic import BaseModel
from typing import List, Optional
import asyncio

# --- KLUCZ API BĘDZIE ODCZYTYWANY ZE ZMIENNEJ ŚRODOWISKOWEJ ---
CEIDG_API_KEY = os.getenv("CEIDG_API_KEY")

# --- MODELE DANYCH ---
class DetailsRequest(BaseModel):
    firm_ids: List[str]

class ContactDetails(BaseModel):
    emails: List[str]
    phones: List[str]
    address: Optional[str]

class ScrapedData(BaseModel):
    companyName: str
    description: str
    sourceUrl: str
    sourceType: str
    contactDetails: ContactDetails
    pkdGlowny: Optional[str]
    pkdCodes: List[str]

app = FastAPI()
CEIDG_API_URL = "https://dane.biznes.gov.pl/api/ceidg/v3/firma"

async def get_single_firm_details(firm_id: str, headers: dict, client: httpx.AsyncClient) -> Optional[ScrapedData]:
    url = f"{CEIDG_API_URL}/{firm_id}"
    try:
        response = await client.get(url, headers=headers, timeout=30.0)
        if response.status_code == 404:
            print(f"[CEIDG-DETAILS] Firma o ID {firm_id} nie znaleziona (404).")
            return None
        if response.status_code == 401 or response.status_code == 403:
            print(f"[CEIDG-DETAILS] Błąd autoryzacji z API CEIDG dla ID {firm_id}. Sprawdź klucz API.")
            return None # Nie rzucamy błędu, tylko pomijamy firmę
        response.raise_for_status()
        data = response.json()
        details = data.get("firma", [None])[0]
        if not details:
            return None
        
        addr = details.get("adresDzialalnosci", {})
        address_parts = [addr.get("ulica"), addr.get("budynek"), addr.get("lokal")]
        full_address = " ".join(filter(None, address_parts))
        if addr.get("kod") and addr.get("miasto"):
            full_address += f", {addr.get('kod')} {addr.get('miasto')}"
        
        contact_details = {
            "emails": [details["email"]] if details.get("email") else [],
            "phones": [details["telefon"]] if details.get("telefon") else [],
            "address": full_address.strip(", ")
        }
        
        scraped_data = {
            "companyName": details.get("nazwa", ""),
            "description": "Firma znaleziona w CEIDG.",
            "sourceUrl": details.get("link") or f"https://prod.ceidg.gov.pl/ceidg/ceidg.public.ui/search/details.aspx?Id={firm_id}",
            "sourceType": "registry_ceidg",
            "contactDetails": contact_details,
            "pkdGlowny": details.get("pkdGlowny", {}).get("kod"),
            "pkdCodes": [p.get("kod") for p in details.get("pkd", []) if p.get("kod")]
        }
        return ScrapedData(**scraped_data)
    except httpx.RequestError as e:
        print(f"[CEIDG-DETAILS] Błąd podczas pobierania szczegółów dla {firm_id}: {e}")
        return None
    except Exception as e:
        print(f"[CEIDG-DETAILS] Błąd przetwarzania danych dla {firm_id}: {e}")
        return None

@app.post("/details", response_model=List[ScrapedData])
async def get_firms_details(request: DetailsRequest):
    if not CEIDG_API_KEY:
        raise HTTPException(status_code=500, detail="CEIDG_API_KEY is not configured on the server.")
    
    # --- POPRAWKA: Dodajemy nagłówek 'Accept' ---
    headers = {
        'Authorization': f'Bearer {CEIDG_API_KEY}',
        'Accept': 'application/json'
    }
    
    async with httpx.AsyncClient() as client:
        tasks = [get_single_firm_details(firm_id, headers, client) for firm_id in request.firm_ids]
        results = await asyncio.gather(*tasks)
    
    processed_firms = [details for details in results if details is not None]
    return processed_firms

@app.get("/")
def read_root():
    return {"message": "CEIDG Details Fetcher Service is running"}
