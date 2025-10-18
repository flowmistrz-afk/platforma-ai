"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSearchAgent = runSearchAgent;
/*
* =================================================================
* AGENT WYSZUKUJĄCY (SEARCH AGENT)
* =================================================================
* Ten agent jest odpowiedzialny wyłącznie za przeprowadzanie
* wyszukiwań w Google przy użyciu narzędzia `performSearch`.
* Jego zadaniem jest zebranie jak najszerszej listy linków
* do dalszej analizy.
* =================================================================
*/
const admin = __importStar(require("firebase-admin"));
const firebase_init_1 = require("./firebase-init");
const vertexai_1 = require("@google-cloud/vertexai");
const params_1 = require("firebase-functions/params");
// Definiowanie parametryzowanej konfiguracji dla kluczy API
const searchApiKey = (0, params_1.defineString)("SEARCH_API_KEY");
const searchEngineId = (0, params_1.defineString)("SEARCH_ENGINE_CX");
// Funkcja do obsługi wyszukiwania (zmodernizowana)
async function execute_search_action(query, num_results = 10) {
    var _a;
    const apiKey = searchApiKey.value();
    const cx = searchEngineId.value();
    if (!apiKey || !cx || cx.startsWith("PLACEHOLDER")) {
        console.error("Brak konfiguracji wyszukiwarki (SEARCH_API_KEY lub SEARCH_ENGINE_CX nie są ustawione poprawnie).");
        return { success: false, error: "Brak konfiguracji wyszukiwarki. Uzupełnij plik .env i wdróż funkcje ponownie." };
    }
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=${num_results}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `Błąd API wyszukiwarki: status ${response.status}, treść: ${errorText}` };
        }
        const result = await response.json();
        const items = ((_a = result.items) === null || _a === void 0 ? void 0 : _a.map((item) => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet,
            displayLink: item.displayLink
        }))) || [];
        return { success: true, results: items };
    }
    catch (error) {
        const err = error;
        return { success: false, error: `Nie udało się połączyć z API wyszukiwarki: ${err.message}` };
    }
}
// Logika Agenta Wyszukującego
async function runSearchAgent(data, taskRef) {
    var _a, _b, _c, _d;
    const { query, słowa_kluczowe, lokalizacja } = data || {};
    const fullQuery = słowa_kluczowe ? `${słowa_kluczowe} ${lokalizacja}` : query;
    await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Agent Wyszukujący rozpoczyna pracę. Query: ${fullQuery}` }) });
    const searchTool = {
        name: "performSearch",
        description: "Wykonaj wyszukiwanie w search engine.",
        parameters: {
            type: vertexai_1.SchemaType.OBJECT,
            properties: {
                query: { type: vertexai_1.SchemaType.STRING, description: "Pełne zapytanie wyszukiwania." },
                num_results: { type: vertexai_1.SchemaType.INTEGER, description: "Liczba wyników (domyślnie 10, max 10)." },
            },
            required: ["query"],
        },
    };
    const submitResultsTool = {
        name: "submit_search_results",
        description: "Użyj tej funkcji, aby zwrócić ostateczną listę zebranych linków i fragmentów.",
        parameters: {
            type: vertexai_1.SchemaType.OBJECT,
            properties: {
                results: {
                    type: vertexai_1.SchemaType.ARRAY,
                    description: "Tablica obiektów z wynikami wyszukiwania.",
                    items: {
                        type: vertexai_1.SchemaType.OBJECT,
                        properties: {
                            title: { type: vertexai_1.SchemaType.STRING },
                            link: { type: vertexai_1.SchemaType.STRING },
                            snippet: { type: vertexai_1.SchemaType.STRING },
                        },
                        required: ["title", "link", "snippet"],
                    },
                },
            },
            required: ["results"],
        },
    };
    const generativeModel = firebase_init_1.vertex_ai.getGenerativeModel({
        model: "gemini-2.5-pro",
        tools: [{ functionDeclarations: [searchTool, submitResultsTool] }],
    });
    const chat = generativeModel.startChat();
    const prompt = `Jesteś prostym agentem AI. Twoim jedynym zadaniem jest wywołanie narzędzia 'performSearch' z zapytaniem "${fullQuery}", a następnie natychmiastowe wywołanie narzędzia 'submit_search_results' z otrzymanymi wynikami. Nie rób nic więcej.`;
    try {
        let result = await chat.sendMessage(prompt);
        for (let i = 0; i < 5; i++) { // Pętla bezpieczeństwa
            const functionCalls = (_d = (_c = (_b = (_a = result.response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d.filter((part) => !!part.functionCall);
            if (!functionCalls || functionCalls.length === 0) {
                break;
            }
            const apiResponses = [];
            for (const call of functionCalls) {
                const { name: action, args: params = {} } = call.functionCall;
                if (action === "submit_search_results") {
                    const finalResults = params.results || [];
                    await taskRef.update({
                        status: "search_completed",
                        search_results: finalResults,
                        logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Agent Wyszukujący zakończył pracę. Znaleziono ${finalResults.length} linków.` }),
                    });
                    return;
                }
                else if (action === "performSearch") {
                    await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Agent Wyszukujący wykonuje zapytanie: ${params.query}` }) });
                    const apiResponse = await execute_search_action(params.query, params.num_results || 10);
                    apiResponses.push({ functionResponse: { name: action, response: apiResponse } });
                }
            }
            if (apiResponses.length > 0) {
                result = await chat.sendMessage(apiResponses);
            }
        }
    }
    catch (error) {
        const err = error;
        await taskRef.update({ status: "search_failed", error: err.message });
    }
}
//# sourceMappingURL=agent_search.js.map