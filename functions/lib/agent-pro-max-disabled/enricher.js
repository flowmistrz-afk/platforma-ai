"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnricherAgentExecutor = exports.enricherAgentCard = void 0;
const types_1 = require("a2a/types");
const agents_1 = require("google/adk/agents");
// Krok 1: Definicja "Wizytówki" Agenta
const enricherSkill = new types_1.AgentSkill({
    id: 'enrich_query',
    name: 'Enrich User Query',
    description: 'Analizuje zapytanie użytkownika, aby wyodrębnić usługę, słowa kluczowe i kody PKD.',
    examples: [
        'Znajdź mi firmy budujące drogi w Małopolsce',
        'potrzebuję ekipy do asfaltowania parkingu w Krakowie',
    ],
});
exports.enricherAgentCard = new types_1.AgentCard({
    agentName: 'Query Enricher Agent',
    description: 'Agent, który wzbogaca zapytanie użytkownika o dodatkowe dane.',
    skills: [enricherSkill]
});
// Krok 2: Definicja "Serca" Agenta (Executor)
class EnricherAgentExecutor {
    constructor() {
        // Tutaj zdefiniujemy "Mózg" agenta (LlmAgent) z jego promptem i modelem
        this.agent = new agents_1.LlmAgent({
            model: 'gemini-2.5-pro', // Używamy nowego, potężnego modelu
            name: 'query_enricher_agent',
            description: 'Agent specjalizujący się w analizie i wzbogacaniu zapytań o usługi.',
            instruction: 'Twoim zadaniem jest przeanalizowanie zapytania użytkownika, zidentyfikowanie głównej usługi, a następnie dobranie do niej słów kluczowych i kodów PKD.',
        });
    }
    async execute(context, eventQueue) {
        // Tutaj znajdzie się główna logika agenta
        console.log("[EnricherAgent] Otrzymano nowe zadanie do wzbogacenia.");
        // TODO: Implementacja logiki wywołania LLM, parsowania odpowiedzi i zwrócenia wyniku
        return Promise.resolve();
    }
}
exports.EnricherAgentExecutor = EnricherAgentExecutor;
//# sourceMappingURL=enricher.js.map