# google-searcher-agent-service/main.py
import os
import uvicorn
from google.adk.cli.fast_api import get_fast_api_app

# --- Konfiguracja dla Vertex AI ---
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"

# --- Pobranie ścieżki do naszych agentów ---
AGENTS_DIR = os.path.dirname(os.path.abspath(__file__))

# --- Użycie wbudowanego generatora aplikacji ADK ---
# Poprawiono nazwę parametru z 'session_service_uri' na 'session_db_url'
app = get_fast_api_app(
    agents_dir=AGENTS_DIR,
    session_db_url="sqlite:///:memory:", 
    allow_origins=["*"],
    web=True,
)

# Standardowy kod do uruchomienia serwera, kompatybilny z Cloud Run
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
