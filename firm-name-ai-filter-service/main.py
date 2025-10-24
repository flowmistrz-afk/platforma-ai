from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import vertexai
from vertexai.generative_models import GenerativeModel
import json
import os

# --- Konfiguracja ---
PROJECT_ID = "automatyzacja-pesamu"
LOCATION = "europe-west1"

# --- Inicjalizacja Vertex AI (natywna biblioteka) ---
# To jest poprawna i standardowa metoda dla tego typu serwisu.
vertexai.init(project=PROJECT_ID, location=LOCATION)

# --- Modele danych (Pydantic) ---
class Query(BaseModel):
    initialQuery: Optional[str] = None
    identifiedService: Optional[str] = None
    keywords: Optional[List[str]] = []
    pkdCodes: Optional[List[str]] = []

class FirmSummary(BaseModel):
    id: str
    nazwa: str

class FilterRequest(BaseModel):
    query: Query
    firmSummaries: List[FirmSummary]

# --- Inicjalizacja aplikacji FastAPI ---
app = FastAPI(
    title="Firm Name AI Filter Service",
    description="Mikroserwis do filtrowania nazw firm przy użyciu AI w celu oceny trafności."
)

@app.post("/filter", response_model=List[FirmSummary])
async def filter_firms_with_ai(request: FilterRequest):
    """
    Filtruje listę firm, używając modelu generatywnego AI (Vertex AI) do oceny, 
    które z nich najlepiej pasują do podanego zapytania.
    """
    if not request.firmSummaries:
        return []

    print(f"[AI-FILTER] Uruchamiam filtrację AI dla {len(request.firmSummaries)} firm.")

    # Poprawne tworzenie modelu przy użyciu natywnej biblioteki Vertex AI
    model = GenerativeModel("gemini-2.5-flash")
    
    company_names_jsonl = '\n'.join([summary.model_dump_json() for summary in request.firmSummaries])

    prompt = f"""Jesteś analitykiem biznesowym. Twoim zadaniem jest ocena, czy nazwa firmy wskazuje na jej związek z określoną branżą. Przeanalizuj poniższe zapytanie użytkownika i listę firm. Zwróć tylko te firmy, których nazwa jest adekwatna.

**KONTEKST ZAPYTANIA:**
- Oryginalne zapytanie: "{request.query.initialQuery or 'brak'}"
- Zidentyfikowana usługa: "{request.query.identifiedService or 'brak'}"
- Słowa kluczowe: [{(request.query.keywords or [])}]

**LISTA FIRM DO OCENY (format JSONL):**
{company_names_jsonl}

**ZADANIE:**
Twoim zadaniem jest wybranie firm z poniższej listy, które pasują do kontekstu zapytania.

**Kryteria Oceny:**
1.  **Trafność Nazwy:** Nazwa firmy powinna jak najściślej odpowiadać oryginalnemu zapytaniu lub liście słów kluczowych.
2.  **Odrzucanie:** Odrzuć firmy o nazwach generycznych, niepasujących lub wielobranżowych, jeśli nie wskazują jasno na szukaną specjalizację.

**Format Wyjściowy:**
- Zwróć **wyłącznie** listę firm w formacie JSONL, które pasują do kryteriów.
- Posortuj listę od **najlepiej pasującej** do najmniej pasującej.
- Nie dodawaj żadnych dodatkowych komentarzy ani formatowania.
- Jeśli żadna firma nie pasuje, zwróć pustą odpowiedź.
"""

    try:
        response = await model.generate_content_async(prompt)
        response_text = response.text

        if not response_text.strip():
            print("[AI-FILTER] Otrzymano pustą odpowiedź od AI. Zwracam pustą listę.")
            return []

        filtered_summaries: List[FirmSummary] = []
        for line in response_text.strip().split('\n'):
            try:
                data = json.loads(line)
                filtered_summaries.append(FirmSummary(**data))
            except json.JSONDecodeError:
                print(f"[AI-FILTER] Błąd parsowania linii JSON: {line}")
                continue # Pomiń uszkodzone linie
        
        print(f"[AI-FILTER] AI przefiltrowało listę. Pozostało {len(filtered_summaries)} trafnych firm.")
        return filtered_summaries

    except Exception as e:
        print(f"[AI-FILTER] Krytyczny błąd podczas filtracji AI: {e}")
        raise HTTPException(status_code=500, detail=f"Błąd podczas komunikacji z modelem AI: {e}")

@app.get("/")
def read_root():
    return {"message": "Firm Name AI Filter Service is running"}
