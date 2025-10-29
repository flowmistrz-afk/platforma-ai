from google.adk.agents import LlmAgent, Agent
from google.adk.tools import google_search

# Specjalista od wyszukiwania w internecie za pomocą wbudowanego narzędzia Google
web_search_agent = LlmAgent(
    name="WebSearchAgent",
    model="gemini-2.5-pro",
    description="Specjalista od wyszukiwania informacji w internecie. Użyj go, aby znaleźć listę linków i odpowiedzi na ogólne pytania.",
    instruction="""
        Twoim zadaniem jest przyjęcie zapytania od użytkownika i wykonanie go za pomocą narzędzia 'google_search'.
        Narzędzie to zwróci listę wyników. Przeanalizuj ją i zwróć 20-30 najbardziej obiecujących,
        organicznych wyników w formacie JSON jako tablica obiektów: [{"title": "...", "link": "..."}].
    """,
    tools=[google_search],
)

# Główny agent dla tej usługi, który jest po prostu naszym WebSearchAgent
root_agent = web_search_agent

print("Zbudowano agenta wyszukiwania Google.")
