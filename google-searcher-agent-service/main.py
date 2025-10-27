# google-searcher-agent-service/main.py

# Importujemy naszego "Mózga-Menedżera" z pliku, w którym go zbudowaliśmy
from app.team_builder import google_searcher_manager

def create_agent():
  """
  Główna funkcja wywoływana przez Vertex AI Agent Engine.
  Jej zadaniem jest zwrócenie w pełni skonfigurowanego agenta.
  """
  print("Vertex AI Agent Engine wywołał funkcję create_agent().")
  return google_searcher_manager

