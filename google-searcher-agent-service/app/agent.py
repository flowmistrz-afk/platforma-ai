# google-searcher-agent-service/app/agent.py
from google.adk.agents import LlmAgent
# from google.adk.tools import google_search # <--- USUNIĘTY IMPORT
from vertexai.agent_engines import AdkApp
from .tools import simple_web_fetch # <--- POZOSTAWIAMY TEN IMPORT

# --- Definicja Głównego Agenta ---

llm_agent_instance = LlmAgent(
    name="google_searcher_agent",
    model="gemini-2.5-pro",
    instruction="""
        Jesteś pomocnym asystentem, który potrafi pobierać surową treść stron internetowych.
        - Użyj narzędzia `simple_web_fetch` aby pobrać surową treść HTML z podanego adresu URL.
    """,
    tools=[simple_web_fetch], # <--- TYLKO simple_web_fetch
)

# Opakowujemy LlmAgent w AdkApp i włączamy tracing
google_searcher_agent = AdkApp(agent=llm_agent_instance, enable_tracing=True)

print("Zbudowano agenta wyszukującego z narzędziem Simple Web Fetch.")
