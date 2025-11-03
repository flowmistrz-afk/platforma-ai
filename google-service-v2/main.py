
import os
import uvicorn
from google.adk.cli.fast_api import get_fast_api_app

# --- Konfiguracja ---
# Upewniamy się, że używamy Vertex AI
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"
# Wskazujemy katalog, w którym zdefiniowany jest nasz nowy agent
AGENTS_DIR = os.path.dirname(os.path.abspath(__file__))

# --- Tworzenie Aplikacji FastAPI ---
# Używamy wbudowanej funkcji z biblioteki ADK, aby stworzyć aplikację.
# Ta funkcja automatycznie tworzy wszystkie niezbędne punkty końcowe (/run, /history, itp.)
# oraz interfejs webowy do prowadzenia interaktywnej rozmowy z agentem.
app = get_fast_api_app(
    agents_dir=AGENTS_DIR,
    allow_origins=["*"],
    web=True,
)

# --- Uruchomienie ---
# Standardowy kod uruchamiający serwer FastAPI
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
