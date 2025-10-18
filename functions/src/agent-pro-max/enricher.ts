import { AgentCard, AgentSkill } from "a2a/types";
import { AgentExecutor, RequestContext } from "a2a/server/agent_execution";
import { EventQueue } from "a2a/server/events";
import { LlmAgent } from "google/adk/agents";

// Krok 1: Definicja "Wizytówki" Agenta

const enricherSkill = new AgentSkill({
    id: 'enrich_query',
    name: 'Enrich User Query',
    description: 'Analizuje zapytanie użytkownika, aby wyodrębnić usługę, słowa kluczowe i kody PKD.',
    examples: [
        'Znajdź mi firmy budujące drogi w Małopolsce',
        'potrzebuję ekipy do asfaltowania parkingu w Krakowie',
    ],
});

export const enricherAgentCard = new AgentCard({
    agentName: 'Query Enricher Agent',
    description: 'Agent, który wzbogaca zapytanie użytkownika o dodatkowe dane.',
    skills: [enricherSkill]
});

// Krok 2: Definicja "Serca" Agenta (Executor)

export class EnricherAgentExecutor implements AgentExecutor {
    private agent: LlmAgent;

    constructor() {
        // Tutaj zdefiniujemy "Mózg" agenta (LlmAgent) z jego promptem i modelem
        this.agent = new LlmAgent({
            model: 'gemini-2.5-pro', // Używamy nowego, potężnego modelu
            name: 'query_enricher_agent',
            description: 'Agent specjalizujący się w analizie i wzbogacaniu zapytań o usługi.',
            instruction: 'Twoim zadaniem jest przeanalizowanie zapytania użytkownika, zidentyfikowanie głównej usługi, a następnie dobranie do niej słów kluczowych i kodów PKD.',
        });
    }

    async execute(context: RequestContext, eventQueue: EventQueue): Promise<void> {
        // Tutaj znajdzie się główna logika agenta
        console.log("[EnricherAgent] Otrzymano nowe zadanie do wzbogacenia.");
        // TODO: Implementacja logiki wywołania LLM, parsowania odpowiedzi i zwrócenia wyniku
        return Promise.resolve();
    }
}
