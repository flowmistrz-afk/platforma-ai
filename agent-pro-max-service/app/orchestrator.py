# Importy
from typing import List
import os
import requests
import json
import traceback

from a2a.types import AgentSkill
from vertexai.preview.reasoning_engines.templates.a2a import create_agent_card
from google.adk.agents import LlmAgent
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.types import UnsupportedOperationError, TaskState, TextPart
from a2a.utils.errors import ServerError
from a2a.server.tasks import TaskUpdater
from a2a.utils import new_agent_text_message
from google.adk import Runner
from google.adk.artifacts import InMemoryArtifactService
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.sessions import InMemorySessionService
from google.genai import types

# Adresy URL Mikroserwisów
CEIDG_SEARCHER_URL = "https://ceidg-firm-searcher-service-567539916654.europe-west1.run.app"
CEIDG_DETAILS_URL = "https://ceidg-details-fetcher-service-567539916654.europe-west1.run.app"

# Definicje Umiejętności
ceidg_searcher_skill = AgentSkill(id='ceidg_firm_searcher', name='CEIDG Firm Searcher', description='Use this tool to find a list of companies in CEIDG. Input: {"pkd_codes": list, "city": string, "province": string}. Output: A list of firms with "id" and "nazwa".', tags=['CEIDG', 'Search'])
ceidg_details_fetcher_skill = AgentSkill(id='ceidg_details_fetcher', name='CEIDG Details Fetcher', description='Use this tool to get full contact details for companies. Input: {"firm_ids": list}. Output: A list of firms with full data.', tags=['CEIDG', 'Details'])

agent_card = create_agent_card(
    agent_name='Orchestrator',
    description='The "Brain" agent that plans and orchestrates tasks across other specialized agents.',
    skills=[ceidg_searcher_skill, ceidg_details_fetcher_skill]
)

# Definicja Agenta
orchestrator_llm_agent = LlmAgent(
    model='gemini-2.5-pro',
    name='orchestrator_agent',
    description='A master agent that creates execution plans for other agents.',
    instruction='''You are a system orchestrator. Based on the user's request and the available tools, create a logical, step-by-step execution plan in JSON format.

**CRITICAL RULES:**
1. For location parameters like "city", you MUST use Polish names (e.g., "Warszawa").
2. The value for the "province" parameter MUST be in lowercase Polish (e.g., "mazowieckie").

**Example User Request:** "Znajdź firmy budowlane z PKD 41.10.Z w Warszawie i pobierz ich dane kontaktowe."

**Available Tools:**
- "ceidg_firm_searcher": "Searches CEIDG."
- "ceidg_details_fetcher": "Fetches details."

**Correct Output (the plan):**
```json
{
  "plan": [
    {
      "step": 1,
      "agent": "ceidg_firm_searcher",
      "input": {
        "pkd_codes": ["41.10.Z"],
        "city": "Warszawa",
        "province": "mazowieckie"
      }
    },
    {
      "step": 2,
      "agent": "ceidg_details_fetcher",
      "input": {
        "firm_ids": "output from step 1"
      }
    }
  ]
}
```
'''
)

# Executor Agenta
class OrchestratorAgentExecutor(AgentExecutor):
    def __init__(self, agent: LlmAgent):
        self.agent = agent
        self.runner = None
        self.tool_urls = {
            "ceidg_firm_searcher": f"{CEIDG_SEARCHER_URL}/search",
            "ceidg_details_fetcher": f"{CEIDG_DETAILS_URL}/details",
        }

    def _init_adk(self):
        if not self.runner:
            self.runner = Runner(app_name=self.agent.name, agent=self.agent, artifact_service=InMemoryArtifactService(), session_service=InMemorySessionService(), memory_service=InMemoryMemoryService())

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        self._init_adk()
        if not context.message: return
        user_id = 'user'
        updater = TaskUpdater(event_queue, context.task_id, context.context_id)
        if not context.current_task: await updater.submit()
        await updater.start_work()
        
        query = context.get_user_input()
        
        tools_list = [ceidg_searcher_skill.model_dump_json(), ceidg_details_fetcher_skill.model_dump_json()]
        tools_prompt = f"Available Tools:\n{json.dumps(tools_list, indent=2)}"
        
        full_query = f"User Request: \"{query}\"\n\n{tools_prompt}"
        content = types.Content(role='user', parts=[types.Part(text=full_query)])
        
        try:
            session = await self.runner.session_service.create_session(app_name=self.runner.app_name, user_id=user_id)
            plan_text = ""
            async for event in self.runner.run_async(session_id=session.id, user_id=user_id, new_message=content):
                if event.content and event.content.parts:
                    plan_text += "".join(part.text for part in event.content.parts if hasattr(part, 'text'))
            
            if not plan_text:
                raise Exception("Agent failed to generate a plan.")

            plan_json_str = plan_text.replace("```json", "").replace("```", "").strip()
            plan_json = json.loads(plan_json_str)
            await updater.add_artifact([TextPart(text=f"Plan generated: {plan_json}")], name='execution_plan')

            step_outputs = {}
            for step in plan_json.get("plan", []):
                agent_name = step.get("agent")
                agent_input = step.get("input")
                
                if not (agent_name and agent_input): continue
                
                for key, value in agent_input.items():
                    if isinstance(value, str) and "output from step" in value:
                        previous_step_num = int(value.split(" ")[-1])
                        previous_output = step_outputs.get(previous_step_num)
                        if agent_name == 'ceidg_details_fetcher' and key == 'firm_ids':
                             agent_input[key] = [firm.get('id') for firm in previous_output.get('firms', [])]
                        else:
                            agent_input[key] = previous_output
                
                await updater.add_artifact([TextPart(text=f"Executing Step {step['step']}: Calling {agent_name}")], name=f"step_{step['step']}_status")
                
                agent_url = self.tool_urls.get(agent_name)
                if agent_url:
                    response = requests.post(agent_url, json=agent_input, timeout=600)
                    response.raise_for_status()
                    step_result = response.json()
                    step_outputs[step['step']] = step_result
                    await updater.add_artifact([TextPart(text=json.dumps(step_result, indent=2))], name=f"step_{step['step']}_result")
                else:
                    raise Exception(f"Tool '{agent_name}' not found.")
            
            await updater.complete()
        except Exception as e:
            print("--- DETAILED ERROR TRACEBACK ---")
            traceback.print_exc()
            print("---------------------------------")
            await updater.update_status(TaskState.failed, message=new_agent_text_message(f"An error occurred: {str(e)}"), final=True)

    async def cancel(self, context: RequestContext, event_queue: EventQueue):
        raise ServerError(error=UnsupportedOperationError())
