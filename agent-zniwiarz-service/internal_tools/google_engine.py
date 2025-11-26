import httpx
import os
import asyncio

API_KEY = os.getenv("SEARCH_API_KEY", "AIzaSyB-JBDEV1SFG3qvZegHDreTwZZtF7JNn3k")
CX_ID = os.getenv("SEARCH_CX", "c629e5216f12d4698")
BASE_URL = "https://www.googleapis.com/customsearch/v1"

async def search_google_internal(query: str, target_count: int = 50):
    """
    Pobiera wyniki z Google stosując paginację (start=1, start=11, itd.),
    aby ominąć limit 10 wyników.
    """
    all_results = []
    start_index = 1  # Google zaczyna liczyć od 1
    
    # Pętla pobierająca kolejne strony
    while len(all_results) < target_count:
        
        # Ile jeszcze brakuje do celu?
        remaining = target_count - len(all_results)
        # Google pozwala pobrać max 10 na raz
        num_to_fetch = min(remaining, 10)
        
        params = {
            "key": API_KEY,
            "cx": CX_ID,
            "q": query,
            "num": num_to_fetch,
            "start": start_index, # KLUCZOWE: Przesunięcie wyników
            "gl": "pl",
            "hl": "pl"
        }

        try:
            print(f"DEBUG: Pobieram Google batch start={start_index} dla '{query}'...")
            
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(BASE_URL, params=params)
                
                if response.status_code == 200:
                    data = response.json()
                    items = data.get("items", [])
                    
                    if not items:
                        print("Google nie zwróciło więcej wyników. Koniec pętli.")
                        break
                        
                    for item in items:
                        all_results.append({
                            "title": item.get("title"),
                            "url": item.get("link"),
                            "description": item.get("snippet"),
                            "source": "Google API"
                        })
                    
                    # Przesuwamy indeks o 10 do przodu na następną pętlę
                    start_index += 10
                    
                    # Google API ma limit zapytań na sekundę (QPS). 
                    # Robimy małą przerwę, żeby nie dostać błędu 429.
                    await asyncio.sleep(0.5) 
                    
                else:
                    print(f"Błąd API Google {response.status_code}: {response.text}")
                    break

        except Exception as e:
            print(f"Błąd połączenia w pętli: {e}")
            break

    print(f"DEBUG: Łącznie pobrano {len(all_results)} wyników dla '{query}'")
    return all_results