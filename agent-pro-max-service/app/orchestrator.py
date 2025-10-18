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

# 1. Definicja Umiejętności
orchestrator_skill = AgentSkill(
    id='create_execution_plan',
    name='Create Execution Plan',
    description='Analyzes the user\'s request and available tools to create an optimal execution pipeline.',
    tags=['Orchestration', 'Planning', 'Pipeline'],
    examples=[
        'User wants to find companies in CEIDG and then enrich their contact information.',
        'User wants to search Google for construction companies and then filter them by location.',
    ],
)

# 2. Wizytówka Agenta
agent_card = create_agent_card(
    agent_name='Orchestrator',
    description='The "Brain" agent that plans and orchestrates tasks across other specialized agents.',
    skills=[orchestrator_skill]
)

# 3. "Mózg" Agenta (LLM)
orchestrator_llm_agent = LlmAgent(
    model='gemini-1.5-pro',
    name='orchestrator_agent',
    description='A master agent that creates execution plans for other agents.',
    instruction='''You are a system orchestrator. Your role is to act as a "Brain".
You will receive a user request in natural language and a list of available tools (other agents with their descriptions).
Your task is to create an optimal execution plan to fulfill the request.
The plan should be a JSON object representing a sequence of steps.
Each step should specify the agent to call and the input to provide.
For now, just generate the plan. Do not execute it.

Example Input:
User Request: "Find construction companies in Warsaw on Google, then find their contact details."
Available Tools:
- "google_searcher": "Searches Google for a given query."
- "contact_enricher": "Finds contact details for a given company name."

Example Output (the plan):
```json
{
  "plan": [
    {
      "step": 1,
      "agent": "google_searcher",
      "input": "construction companies in Warsaw"
    },
    {
      "step": 2,
      "agent": "contact_enricher",
      "input": "output from step 1"
    }
  ]
}
```
''',
)

# 4. "Serce" Agenta (Executor)
class OrchestratorAgentExecutor(AgentExecutor):
    """Executor that uses the LlmAgent to create an execution plan."""

    def __init__(self, agent: LlmAgent):
        self.agent = agent
        self.runner = None

    def _init_adk(self):
        if not self.runner:
            self.runner = Runner(
                app_name=self.agent.name,
                agent=self.agent,
                artifact_service=InMemoryArtifactService(),
                session_service=InMemorySessionService(),
                memory_service=InMemoryMemoryService(),
            )

    async def execute(
        self,
        context: RequestContext,
        event_queue: EventQueue
    ) -> None:
        """Main execution logic: generate the plan."""
        self._init_adk()

        if not context.message:
            return

        user_id = context.message.metadata.get('user_id') if context.message and context.message.metadata else 'a2a_user'
        updater = TaskUpdater(event_queue, context.task_id, context.context_id)
        if not context.current_task:
            await updater.submit()
        await updater.start_work()

        # For now, the user input is the main query.
        # Later, we will also pass the list of available tools.
        query = context.get_user_input()
        content = types.Content(role='user', parts=[types.Part(text=query)])

        try:
            session = await self.runner.session_service.get_session(
                app_name=self.runner.app_name,
                user_id=user_id,
                session_id=context.context_id,
            ) or await self.runner.session_service.create_session(
                app_name=self.runner.app_name,
                user_id=user_id,
                session_id=context.context_id,
            )

            final_event = None
            async for event in self.runner.run_async(
                session_id=session.id,
                user_id=user_id,
                new_message=content
            ):
                if event.is_final_response():
                    final_event = event

            if final_event and final_event.content and final_event.content.parts:
                response_text = "".join(
                    part.text for part in final_event.content.parts if hasattr(part, 'text') and part.text
                )
                if response_text:
                    # Return the generated plan as a JSON artifact
                    await updater.add_artifact(
                        [TextPart(text=response_text)],
                        name='execution_plan',
                    )
                    await updater.complete()
                    return

            await updater.update_status(
                TaskState.failed,
                message=new_agent_text_message('Agent failed to generate a plan.'),
                final=True
            )

        except Exception as e:
            await updater.update_status(
                TaskState.failed,
                message=new_agent_text_message(f"An error occurred: {str(e)}"),
                final=True,
            )

    async def cancel(self, context: RequestContext, event_queue: EventQueue):
        raise ServerError(error=UnsupportedOperationError())