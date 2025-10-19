from fastapi import FastAPI, HTTPException
import os
import requests
from pydantic import BaseModel
from typing import List, Optional
import time

# --- "NA SZTYWNO" WKLEJONY KLUCZ API DLA TESTU ---
CEIDG_API_KEY = "eyJraWQiOiJjZWlkZyIsImFsZyI6IkhTNTEyIn0.eyJnaXZlbl9uYW1lIjoiTUFHREFMRU5BIiwicGVzZWwiOiI4MDEwMDQwODA4NyIsImlhdCI6MTc1OTgxODg3NiwiZmFtaWx5X25hbWUiOiJNT1NLSUVXSUNaIiwiY2xpZW50X2lkIjoiVVNFUi04MDEwMDQwODA4Ny1NQUdEQUxFTkEtTU9TS0lFV0lDWiJ9.JHIDfIzwhnd8rAP8ST-xerWwMznHdyrpQB_GxmC7gpYLEG--QE9op3BALW125UR70LMsojH-YyQ1jleRcbC8xQ"

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

async def get_single_firm_details(firm_id: str, headers: dict) -> Optional[ScrapedData]:
    url = f"{CEIDG_API_URL}/{firm_id}"
    try:
        response = requests.get(url, headers=headers)
        if response.status_code == 404:
            print(f"[CEIDG-DETAILS] Firma o ID {firm_id} nie znaleziona (404).")
            return None
        response.raise_for_status()
        data = response.json()
        details = data.get("firma", [None])[0]
        if not details:
            return None
        
        # Budowanie adresu z uwzględnieniem brakujących pól
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
    except requests.exceptions.RequestException as e:
        print(f"[CEIDG-DETAILS] Błąd podczas pobierania szczegółów dla {firm_id}: {e}")
        return None

@app.post("/details", response_model=List[ScrapedData])
async def get_firms_details(request: DetailsRequest):
    if not CEIDG_API_KEY:
        raise HTTPException(status_code=500, detail="CEIDG_API_KEY is not configured.")
    headers = {'Authorization': f'Bearer {CEIDG_API_KEY}'}
    processed_firms = []
    for firm_id in request.firm_ids:
        details = await get_single_firm_details(firm_id, headers)
        if details:
            processed_firms.append(details)
        # --- KLUCZOWA ZMIANA: Dodajemy opóźnienie ---
        time.sleep(0.1)  # Czekaj 100ms między zapytaniami
    return processed_firms

@app.get("/")
def read_root():
    return {"message": "CEIDG Details Fetcher Service is running"}
