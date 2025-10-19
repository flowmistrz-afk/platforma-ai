
import asyncio
from typing import Any, Dict, List, Optional, Union

# Założenie: Te importy pochodzą z biblioteki ADK lub są zdefiniowane w projekcie.
# Dostosujemy je, jeśli rzeczywiste nazwy lub lokalizacje są inne.
# Na potrzeby implementacji zakładamy istnienie tych klas i dekoratorów.
class SubAgent:
    def __init__(self, tools: List[Any]):
        self.tools = tools
    async def run(self, input_data: Dict[str, Any], session: Any) -> Any:
        raise NotImplementedError

class WorkflowAgent:
    def __init__(self, sub_agents: Dict[str, SubAgent]):
        self.sub_agents = sub_agents
    async def invoke_agent(self, agent_name: str, input_data: Dict[str, Any], await_completion: bool = False) -> Any:
        agent = self.sub_agents.get(agent_name)
        if agent:
            # W rzeczywistej implementacji ADK, to wywołanie byłoby bardziej złożone.
            # Tutaj symulujemy asynchroniczne uruchomienie.
            print(f"BrainAgent: Wywołuję agenta -> {agent_name}")
            return await agent.run(input_data, session=None)
        raise ValueError(f"Nie znaleziono agenta: {agent_name}")
    async def run_steps(self, input_data: Dict[str, Any], session: Any) -> Any:
        raise NotImplementedError

def tool(func):
    return func

class Status:
    SUCCEEDED = "succeeded"
    FAILED = "failed"

class Payload:
    def __init__(self, status: str, data: Any):
        self.status = status
        self.data = data

# --- Definicje Narzędzi ---

@tool
async def find_pkd_and_keywords_tool(query: str) -> Dict[str, Any]:
    """
    Mock narzędzia, które używa LLM do znalezienia kodów PKD i słów kluczowych.
    """
    print(f"Narzędzie find_pkd_and_keywords_tool: Otrzymano zapytanie '{query}'")
    if "kostki brukowej" in query:
        return {
            "pkdSection": "F",
            "pkdCodes": ["43.99.Z", "42.99.Z"],
            "keywords": ["brukarstwo", "układanie kostki", "nawierzchnie brukowe"]
        }
    return {
        "pkdSection": "",
        "pkdCodes": [],
        "keywords": []
    }

@tool
async def digu_list_companies_tool(params: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Mock narzędzia do wywoływania API Digu (CEIDG) w celu pobrania listy firm.
    """
    print(f"Narzędzie digu_list_companies_tool: Otrzymano parametry: {params}")
    # Zwracamy przykładowe dane, ignorując na razie parametry
    return [
        {"id": "1", "name": "BUD-BRUK Usługi Brukarskie Jan Kowalski"},
        {"id": "2", "name": "SuperBruk Sp. z o.o."},
        {"id": "3", "name": "Jan-Kop Wykopy i Niwelacja terenu"},
    ]

@tool
async def digu_get_details_tool(company_id: str) -> Dict[str, Any]:
    """
    Mock narzędzia do pobierania szczegółów firmy z Digu (CEIDG).
    """
    print(f"Narzędzie digu_get_details_tool: Pobieram szczegóły dla firmy o ID: {company_id}")
    details = {
        "1": {"id": "1", "name": "BUD-BRUK Usługi Brukarskie Jan Kowalski", "address": "Warszawa", "phone": "111-222-333", "email": None},
        "2": {"id": "2", "name": "SuperBruk Sp. z o.o.", "address": "Kraków", "phone": None, "email": "kontakt@superbruk.pl"},
        "3": {"id": "3", "name": "Jan-Kop Wykopy i Niwelacja terenu", "address": "Gdańsk", "phone": None, "email": None},
    }
    return details.get(company_id, {})

# --- Import istniejącego agenta Enricher ---
# Zakładamy, że możemy zaimportować i użyć istniejącego agenta w ten sposób.
# To jest uproszczenie na potrzeby tej implementacji.
from app.agents.enricher import EnricherAgentExecutor as DoszukiwanieKontaktowAgent

# --- Definicje Nowych Sub-Agentów ---

class PKDEnricherAgent(SubAgent):
    def __init__(self):
        super().__init__(tools=[find_pkd_and_keywords_tool])
    async def run(self, input_data: Dict[str, Any], session: Any) -> Payload:
        query = input_data.get("query", "")
        enriched_data = await self.tools[0](query)
        return Payload(status=Status.SUCCEEDED, data=enriched_data)

class ListCompaniesAgent(SubAgent):
    def __init__(self):
        super().__init__(tools=[digu_list_companies_tool])
    async def run(self, input_data: Dict[str, Any], session: Any) -> Payload:
        companies = await self.tools[0](input_data)
        return Payload(status=Status.SUCCEEDED, data=companies)

class FiltrujAgent(SubAgent):
    def __init__(self):
        super().__init__(tools=[])
    async def run(self, input_data: Dict[str, Any], session: Any) -> Payload:
        company_list = input_data.get("company_list", [])
        query = input_data.get("query", "").lower()
        if not query:
            return Payload(status=Status.SUCCEEDED, data=company_list)
        
        filtered_list = [comp for comp in company_list if query in comp.get("name", "").lower()]
        return Payload(status=Status.SUCCEEDED, data=filtered_list)

class GetCompanyDetailsAgent(SubAgent):
    def __init__(self):
        super().__init__(tools=[digu_get_details_tool])
    async def run(self, input_data: Dict[str, Any], session: Any) -> Payload:
        company_list = input_data.get("company_list", [])
        detailed_companies = []
        for company in company_list:
            details = await self.tools[0](company["id"])
            detailed_companies.append(details)
        return Payload(status=Status.SUCCEEDED, data=detailed_companies)

# --- Główny Agent-Orkiestrator ---

class BrainAgent(WorkflowAgent):
    def __init__(self):
        super().__init__(
            sub_agents={
                "PKDEnricherAgent": PKDEnricherAgent(),
                "ListCompaniesAgent": ListCompaniesAgent(),
                "FiltrujAgent": FiltrujAgent(),
                "GetCompanyDetailsAgent": GetCompanyDetailsAgent(),
                "DoszukiwanieKontaktowAgent": DoszukiwanieKontaktowAgent(), # Użycie istniejącego agenta
            }
        )

    async def run_steps(self, input_data: Dict[str, Any], session: Any) -> Payload:
        print("BrainAgent: Rozpoczynam przetwarzanie zlecenia.")
        search_params = input_data.get("initial_query", {})
        actions = input_data.get("actions", {})

        # KROK 1: (WARUNKOWY) Wzbogacenie zapytania
        if not search_params.get("pkdCodes") and search_params.get("query"):
            print("BrainAgent: KROK 1 -> Brak PKD, uruchamiam PKDEnricherAgent.")
            pkd_payload = await self.invoke_agent("PKDEnricherAgent", {"query": search_params["query"]}, await_completion=True)
            if pkd_payload.status != Status.SUCCEEDED:
                return Payload(status=Status.FAILED, data={"error": "Nie udało się ustalić kodów PKD."})
            
            search_params.update(pkd_payload.data)
            print(f"BrainAgent: KROK 1 -> Parametry wzbogacone: {search_params}")

        # KROK 2: Pobranie listy firm
        print("BrainAgent: KROK 2 -> Uruchamiam ListCompaniesAgent.")
        list_payload = await self.invoke_agent("ListCompaniesAgent", search_params, await_completion=True)
        if list_payload.status != Status.SUCCEEDED:
            return list_payload
        
        company_list = list_payload.data
        print(f"BrainAgent: KROK 2 -> Pobrano {len(company_list)} firm.")

        # KROK 3: (WARUNKOWY) Filtrowanie listy
        if actions.get("filter_by_name"):
            print("BrainAgent: KROK 3 -> Wykryto akcję filtrowania, uruchamiam FiltrujAgent.")
            filter_payload = await self.invoke_agent("FiltrujAgent", {"company_list": company_list, "query": search_params.get("query")}, await_completion=True)
            if filter_payload.status != Status.SUCCEEDED:
                return filter_payload
            company_list = filter_payload.data
            print(f"BrainAgent: KROK 3 -> Po filtrowaniu zostało {len(company_list)} firm.")

        # KROK 4: Pobranie szczegółów firm
        print("BrainAgent: KROK 4 -> Uruchamiam GetCompanyDetailsAgent.")
        details_payload = await self.invoke_agent("GetCompanyDetailsAgent", {"company_list": company_list}, await_completion=True)
        if details_payload.status != Status.SUCCEEDED:
            return details_payload
        
        detailed_company_list = details_payload.data
        print("BrainAgent: KROK 4 -> Pobrano szczegóły firm.")

        # KROK 5: (WARUNKOWY) Wzbogacanie o kontakty
        if actions.get("enrich_contacts"):
            print("BrainAgent: KROK 5 -> Wykryto akcję wzbogacania, uruchamiam DoszukiwanieKontaktowAgent.")
            companies_to_enrich = [comp for comp in detailed_company_list if not comp.get("email") and not comp.get("phone")]
            
            if companies_to_enrich:
                print(f"BrainAgent: KROK 5 -> Znaleziono {len(companies_to_enrich)} firm do wzbogacenia.")
                enrich_payload = await self.invoke_agent("DoszukiwanieKontaktowAgent", {"companies": companies_to_enrich}, await_completion=True)
                
                if enrich_payload.status == Status.SUCCEEDED:
                    enriched_data_map = {item["id"]: item for item in enrich_payload.data}
                    # Scalanie wyników
                    for i, original_comp in enumerate(detailed_company_list):
                        if original_comp["id"] in enriched_data_map:
                            detailed_company_list[i] = enriched_data_map[original_comp["id"]]
                    print("BrainAgent: KROK 5 -> Wzbogacanie zakończone.")
                else:
                    print("BrainAgent: KROK 5 -> Wzbogacanie nie powiodło się, kontynuuję z częściowymi danymi.")

        # KROK 6: Zakończenie
        print("BrainAgent: Zakończono pomyślnie cały proces.")
        return Payload(status=Status.SUCCEEDED, data=detailed_company_list)

