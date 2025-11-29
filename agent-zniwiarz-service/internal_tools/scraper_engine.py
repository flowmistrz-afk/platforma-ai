import httpx
import os
import uuid
import asyncio

# Adres Twojego serwisu z Chrome (z poprzednich logów)
PUPPETEER_SERVICE_URL = "https://puppeteer-executor-service-567539916654.europe-west1.run.app/execute"

async def fetch_via_puppeteer(url: str):
    """
    Wysyła żądanie do Puppeteer Service, aby pobrał treść strony renderingiem Chrome.
    """
    session_id = f"manual-{uuid.uuid4()}"
    
    try:
        async with httpx.AsyncClient(timeout=70.0) as client:
            # 1. Wejdź na stronę
            print(f"🛡️ SuperScraper: Wchodzę na {url}")
            resp = await client.post(PUPPETEER_SERVICE_URL, json={
                "action": "goToURL",
                "sessionId": session_id,
                "params": {"url": url}
            })
            
            if resp.status_code != 200:
                print(f"Puppeteer Nav Error: {resp.text}")
                return None

            # 2. Pobierz treść (HTML)
            resp_content = await client.post(PUPPETEER_SERVICE_URL, json={
                "action": "scrapeContent",
                "sessionId": session_id,
                "params": {}
            })
            
            # 3. Zamknij sesję (Clean up) - w tle
            asyncio.create_task(client.post(PUPPETEER_SERVICE_URL, json={
                "action": "closeSession",
                "sessionId": session_id,
                "params": {}
            }))

            content = resp_content.json().get("content", "")
            return content

    except Exception as e:
        print(f"SuperScraper Critical Error: {e}")
        return None