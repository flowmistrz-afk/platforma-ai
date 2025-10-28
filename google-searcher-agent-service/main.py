# google-searcher-agent-service/main.py

# Importujemy naszego nowego, zunifikowanego agenta
from app.agent import google_searcher_agent

def create_agent():
  """
  Główna funkcja wywoływana przez Vertex AI Agent Engine.
  Jej zadaniem jest zwrócenie w pełni skonfigurowanego agenta.
  """
  print("Vertex AI Agent Engine wywołał funkcję create_agent() i zwraca nowego agenta.")
  return google_searcher_agent

if __name__ == "__main__":
    agent = create_agent()
    print("Agent created successfully!")
    print(f"Agent Name: {agent.name}")
    print(f"Agent Model: {agent.model}")
    print(f"Number of tools: {len(agent.tools)}")
