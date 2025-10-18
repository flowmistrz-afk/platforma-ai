
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
import * as admin from 'firebase-admin';
import { DocumentReference } from 'firebase-admin/firestore';
import { vertex_ai } from './firebase-init';
import { SchemaType, FunctionDeclaration, Part } from '@google-cloud/vertexai';
import { defineString } from 'firebase-functions/params';

// Definiowanie parametryzowanej konfiguracji dla kluczy API
const searchApiKey = defineString("SEARCH_API_KEY");
const searchEngineId = defineString("SEARCH_ENGINE_CX");

// Funkcja do obsługi wyszukiwania (zmodernizowana)
async function execute_search_action(query: string, num_results: number = 10): Promise<any> {
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
        const items = result.items?.map((item: any) => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet,
            displayLink: item.displayLink
        })) || [];
        return { success: true, results: items };
    } catch (error) {
        const err = error as Error;
        return { success: false, error: `Nie udało się połączyć z API wyszukiwarki: ${err.message}` };
    }
}

// Logika Agenta Wyszukującego
export async function runSearchAgent(data: any, taskRef: DocumentReference) {
    const { query, słowa_kluczowe, lokalizacja } = data || {};
    const fullQuery = słowa_kluczowe ? `${słowa_kluczowe} ${lokalizacja}` : query;

    await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Agent Wyszukujący rozpoczyna pracę. Query: ${fullQuery}` }) });

    const searchTool: FunctionDeclaration = {
        name: "performSearch",
        description: "Wykonaj wyszukiwanie w search engine.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: { type: SchemaType.STRING, description: "Pełne zapytanie wyszukiwania." },
                num_results: { type: SchemaType.INTEGER, description: "Liczba wyników (domyślnie 10, max 10)." },
            },
            required: ["query"],
        },
    };

    const submitResultsTool: FunctionDeclaration = {
        name: "submit_search_results",
        description: "Użyj tej funkcji, aby zwrócić ostateczną listę zebranych linków i fragmentów.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                results: {
                    type: SchemaType.ARRAY,
                    description: "Tablica obiektów z wynikami wyszukiwania.",
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                            title: { type: SchemaType.STRING },
                            link: { type: SchemaType.STRING },
                            snippet: { type: SchemaType.STRING },
                        },
                        required: ["title", "link", "snippet"],
                    },
                },
            },
            required: ["results"],
        },
    };

    const generativeModel = vertex_ai.getGenerativeModel({
        model: "gemini-2.5-pro",
        tools: [{ functionDeclarations: [searchTool, submitResultsTool] }],
    });

    const chat = generativeModel.startChat();

    const prompt = `Jesteś prostym agentem AI. Twoim jedynym zadaniem jest wywołanie narzędzia 'performSearch' z zapytaniem "${fullQuery}", a następnie natychmiastowe wywołanie narzędzia 'submit_search_results' z otrzymanymi wynikami. Nie rób nic więcej.`;

    try {
        let result = await chat.sendMessage(prompt);

        for (let i = 0; i < 5; i++) { // Pętla bezpieczeństwa
            const functionCalls = result.response.candidates?.[0]?.content?.parts?.filter((part: Part): part is Part & { functionCall: any } => !!part.functionCall);

            if (!functionCalls || functionCalls.length === 0) {
                break;
            }

            const apiResponses = [];
            for (const call of functionCalls) {
                const { name: action, args: params = {} } = call.functionCall;

                if (action === "submit_search_results") {
                    const finalResults = (params as any).results || [];
                    await taskRef.update({
                        status: "search_completed",
                        search_results: finalResults,
                        logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Agent Wyszukujący zakończył pracę. Znaleziono ${finalResults.length} linków.` }),
                    });
                    return;
                } else if (action === "performSearch") {
                    await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Agent Wyszukujący wykonuje zapytanie: ${params.query}` }) });
                    const apiResponse = await execute_search_action(params.query, params.num_results || 10);
                    apiResponses.push({ functionResponse: { name: action, response: apiResponse } });
                }
            }
            if (apiResponses.length > 0) {
                result = await chat.sendMessage(apiResponses);
            }
        }
    } catch (error) {
        const err = error as Error;
        await taskRef.update({ status: "search_failed", error: err.message });
    }
}
