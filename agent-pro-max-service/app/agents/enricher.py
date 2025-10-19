from a2a.types import AgentCard, AgentSkill
from vertexai.preview.reasoning_engines.templates.a2a import create_agent_card
from google.adk.agents import LlmAgent
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.types import UnsupportedOperationError
from a2a.utils.errors import ServerError

# Definicja umiejętności dla agenta EnricherProMax
enricher_skill = AgentSkill(
    id='enrich_query',
    name='Enrich User Query',
    description='Analizuje zapytanie użytkownika, aby wyodrębnić usługę, słowa kluczowe i kody PKD.',
    tags=['Query Processing', 'NLP', 'Data Enrichment'],
    examples=[
        'Znajdź mi firmy budujące drogi w Małopolsce',
        'potrzebuję ekipy do asfaltowania parkingu w Krakowie',
    ],
)

# Stworzenie wizytówki agenta
agent_card = create_agent_card(
    agent_name='EnricherProMax',
    description='Agent, który wzbogaca zapytanie użytkownika o dodatkowe dane.',
    skills=[enricher_skill]
)

# Definicja "Mózgu" Agenta
enricher_llm_agent = LlmAgent(
    model='gemini-2.5-pro',
    name='enricher_pro_max_agent',
    description='Agent specjalizujący się w analizie i wzbogacaniu zapytań o usługi.',
    instruction='Twoim zadaniem jest przeanalizowanie zapytania użytkownika, zidentyfikowanie głównej usługi, a następnie dobranie do niej słów kluczowych i kodów PKD. Zwróć wynik w formacie JSON.',
)

from a2a.server.tasks import TaskUpdater
from a2a.types import TaskState, TextPart, UnsupportedOperationError
from a2a.utils import new_agent_text_message
from google.adk import Runner
from google.adk.artifacts import InMemoryArtifactService
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.sessions import InMemorySessionService
from google.genai import types

# ... (reszta importów i definicji bez zmian)

# Definicja "Serca" Agenta (Executor)
class EnricherAgentExecutor(AgentExecutor):
    """Executor, który używa LlmAgent do wzbogacania zapytania."""

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
        self, context: RequestContext, event_queue: EventQueue
    ) -> None:
        """Główna logika wykonawcza agenta."""
        self._init_adk()

        if not context.message:
            return

        user_id = context.message.metadata.get('user_id') if context.message and context.message.metadata else 'a2a_user'

        updater = TaskUpdater(event_queue, context.task_id, context.context_id)
        if not context.current_task:
            await updater.submit()
        await updater.start_work()

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
                    # Zwracamy wynik jako artefakt w formacie JSON
                    await updater.add_artifact(
                        [TextPart(text=response_text)],
                        name='enriched_query_result',
                    )
                    await updater.complete()
                    return

            await updater.update_status(
                TaskState.failed,
                message=new_agent_text_message('Agent nie wygenerował odpowiedzi tekstowej.'),
                final=True
            )

        except Exception as e:
            import traceback
            print("!!!!! ENCOUNTERED AN EXCEPTION !!!!!")
            traceback.print_exc()
            print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
            await updater.update_status(
                TaskState.failed,
                message=new_agent_text_message(f"Wystąpił błąd: {str(e)}"),
                final=True,
            )

    async def cancel(self, context: RequestContext, event_queue: EventQueue):
        raise ServerError(error=UnsupportedOperationError())