import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig
import json
import os

# Inicjalizacja Vertex AI
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT")
LOCATION = "europe-west1"

try:
    vertexai.init(project=PROJECT_ID, location=LOCATION)
    # Używamy modelu Pro dla lepszego myślenia, lub Flash dla szybkości
    model = GenerativeModel("gemini-2.5-pro")
except Exception as e:
    print(f"WARN: Vertex AI init failed: {e}")
    model = None

async def generate_strategy(user_text: str):
    """
    Zamienia tekst użytkownika na parametry wyszukiwania (JSON).
    """
    if not model:
        # Fallback jeśli nie ma AI (np. testy lokalne bez kredencjałów)
        return {
            "reasoning": "Tryb awaryjny (brak AI)",
            "target_cities": ["Polska"],
            "keywords": [user_text],
            "pkd_codes": []
        }

    system_instruction = """
    Jesteś analitykiem budowlanym. Twoim celem jest skonfigurowanie robota wyszukującego firmy.
    
    ZADANIE:
    Przeanalizuj wpis użytkownika i wygeneruj parametry wyszukiwania.
    
    ZASADY:
    1. Jeśli metraż duży (>500m2) lub obiekt przemysłowy -> Dodaj pobliskie duże miasta (promień 50km).
    2. Zamień język potoczny na słowa kluczowe (np. "robienie podłogi" -> "posadzki, wylewki").
    3. Zwróć JSON.
    
    Schema JSON:
    {
        "reasoning": "string",
        "target_cities": ["string"],
        "keywords": ["string"],
        "pkd_codes": ["string"]
    }
    """

    prompt = f"ZLECENIE: {user_text}"

    try:
        response = await model.generate_content_async(
            [system_instruction, prompt],
            generation_config=GenerationConfig(response_mime_type="application/json")
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"Gemini Error: {e}")
        return {
            "reasoning": f"Błąd AI: {e}",
            "target_cities": [],
            "keywords": [user_text],
            "pkd_codes": []
        }