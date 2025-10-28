# google-searcher-agent-service/deploy_agent.py
import os
import asyncio
import vertexai
from vertexai import agent_engines

# Importujemy naszego agenta
from app.agent import google_searcher_agent

# --- Konfiguracja ---
PROJECT_ID = "automatyzacja-pesamu"
LOCATION = "europe-west1"
STAGING_BUCKET = "gs://automatyzacja-pesamu-adk-staging"
AGENT_DISPLAY_NAME = "google-searcher-agent-v16" # Nowa nazwa dla odróżnienia
PUPPETEER_SERVICE_URL = "https://puppeteer-executor-service-567539916654.europe-west1.run.app"

async def main():
    """Główna funkcja wdrażająca agenta."""
    
    # Inicjalizacja klienta Vertex AI
    vertexai.init(project=PROJECT_ID, location=LOCATION, staging_bucket=STAGING_BUCKET)
    
    print("--- Rozpoczynanie wdrożenia agenta ---")
    print(f"Projekt: {PROJECT_ID}")
    print(f"Lokalizacja: {LOCATION}")
    print(f"Bucket stagingowy: {STAGING_BUCKET}")
    print(f"Nazwa agenta: {AGENT_DISPLAY_NAME}")
    
    # Wdrażanie agenta
    remote_app = agent_engines.create(
        agent_engine=google_searcher_agent,
        display_name=AGENT_DISPLAY_NAME,
        description="Agent z narzędziem Simple Web Fetch.",
        requirements=[
            "google-cloud-aiplatform>=1.55.0",
            "google-generativeai>=0.7.0",
            "requests",
            "python-dotenv",
            "google-adk>=1.5.0"
        ],
        extra_packages=["app"],
        env_vars={
            "PUPPETEER_SERVICE_URL": PUPPETEER_SERVICE_URL
        }
    )
    
    print("\n--- Wdrożenie zakończone pomyślnie! ---")
    print(f"Nazwa zasobu agenta: {remote_app.resource_name}")
    
    # --- Testowanie wdrożonego agenta ---
    print("\n--- Rozpoczynanie testu wdrożonego agenta ---")
    
    try:
        async for event in remote_app.async_stream_query(
            user_id="test-user-web-fetch-only",
            message="Pobierz surową treść HTML ze strony https://www.google.com"
        ):
            print(event)

    except Exception as e:
        print(f"\nWystąpił błąd podczas testowania agenta: {e}")
        
    print("\n--- Test zakończony ---")

if __name__ == "__main__":
    asyncio.run(main())
