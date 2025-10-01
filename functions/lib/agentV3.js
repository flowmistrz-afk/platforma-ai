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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAgent3Logic = void 0;
const admin = __importStar(require("firebase-admin"));
const firebase_init_1 = require("./firebase-init");
const vertexai_1 = require("@google-cloud/vertexai");
// Nowa wersja funkcji, która komunikuje się z zewnętrzną usługą Puppeteer
async function execute_puppeteer_action(action, params) {
    // WAŻNE: Wstaw tutaj prawdziwy URL swojej usługi Cloud Run!
    const serviceUrl = 'https://puppeteer-executor-service-567539916654.europe-west1.run.app/execute';
    // WAŻNE: Wstaw tutaj swoje tajne hasło!
    const secret = 'TWOJE_SUPER_TAJNE_HASLO';
    console.log(`Calling Puppeteer service for action: ${action} with params:`, params);
    try {
        const response = await fetch(serviceUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Secret': secret,
            },
            body: JSON.stringify({ action, params }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Service call failed with status ${response.status}: ${errorText}`);
        }
        const result = await response.json();
        console.log("Received response from Puppeteer service:", result);
        return result;
    }
    catch (error) {
        const err = error;
        console.error(`Error calling Puppeteer service: ${err.message}`, err.stack);
        return { success: false, error: `Failed to connect to Puppeteer service: ${err.message}` };
    }
}
// Logika orkiestratora AI (runAgent3Logic)
async function runAgent3Logic(data, taskRef) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const { query } = data || {};
    await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: "Agent V3 (Puppeteer) rozpoczyna pracę..." }) });
    const browserTools = [
        { name: "lookAtPage", description: "Analizuje aktualny widok strony i zwraca listę interaktywnych elementów. Użyj tego ZAWSZE jako pierwszy krok na nowej stronie.", parameters: { type: vertexai_1.SchemaType.OBJECT, properties: {} } },
        { name: "goToURL", description: "Nawiguje do podanego adresu URL.", parameters: { type: vertexai_1.SchemaType.OBJECT, properties: { url: { type: vertexai_1.SchemaType.STRING } }, required: ["url"] } },
        { name: "typeText", description: "Wpisuje tekst w pole. Użyj selektora zwróconego przez narzędzie lookAtPage.", parameters: { type: vertexai_1.SchemaType.OBJECT, properties: { selector: { type: vertexai_1.SchemaType.STRING }, text: { type: vertexai_1.SchemaType.STRING } }, required: ["selector", "text"] } },
        { name: "clickElement", description: "Klika w element. Użyj selektora zwróconego przez narzędzie lookAtPage.", parameters: { type: vertexai_1.SchemaType.OBJECT, properties: { selector: { type: vertexai_1.SchemaType.STRING } }, required: ["selector"] } },
        { name: "scrapeContent", description: "Pobiera pełną zawartość HTML strony do szczegółowej analizy, gdy już wiesz, że jesteś na właściwej stronie.", parameters: { type: vertexai_1.SchemaType.OBJECT, properties: {} } },
    ];
    const finalReportTool = {
        name: "submit_final_report",
        description: "Użyj tej funkcji, aby zwrócić ostateczną, sformatowaną listę znalezionych firm po zakończeniu wyszukiwania.",
        parameters: {
            type: vertexai_1.SchemaType.OBJECT,
            properties: {
                companies: {
                    type: vertexai_1.SchemaType.ARRAY,
                    description: "Tablica obiektów reprezentujących znalezione firmy.",
                    items: {
                        type: vertexai_1.SchemaType.OBJECT,
                        properties: {
                            nazwa: { type: vertexai_1.SchemaType.STRING, description: "Pełna nazwa firmy." },
                            adres: { type: vertexai_1.SchemaType.STRING, description: "Adres firmy." },
                            telefon: { type: vertexai_1.SchemaType.STRING, description: "Numer telefonu (może być null)." },
                            website: { type: vertexai_1.SchemaType.STRING, description: "Adres strony internetowej (może być null)." },
                            ocena: { type: vertexai_1.SchemaType.NUMBER, description: "Ocena firmy (może być null)." },
                            liczba_opinii: { type: vertexai_1.SchemaType.NUMBER, description: "Liczba opinii (może być null)." },
                        },
                        required: ["nazwa", "adres"],
                    },
                },
            },
            required: ["companies"],
        },
    };
    const allTools = [...browserTools, finalReportTool];
    const generativeModelWithBrowserTools = firebase_init_1.vertex_ai.getGenerativeModel({
        model: "gemini-2.5-pro",
        tools: [{ functionDeclarations: allTools }],
    });
    const chat = generativeModelWithBrowserTools.startChat();
    const prompt = `Jesteś agentem AI, który steruje przeglądarką. Twoim zadaniem jest znalezienie informacji na temat: "${query}".
    
    Twój cykl pracy to "Spójrz -> Pomyśl -> Działaj":
    1.  **SPÓJRZ:** ZAWSZE zaczynaj od użycia narzędzia 'lookAtPage', aby zrozumieć, co jest na stronie.
    2.  **POMYŚL:** Przeanalizuj listę elementów zwróconą przez 'lookAtPage' i swój główny cel. Zdecyduj, jaki jest JEDEN, następny logiczny krok (np. kliknięcie przycisku "Szukaj" lub wpisanie tekstu w pole).
    3.  **DZIAŁAJ:** Wywołaj odpowiednie narzędzie ('clickElement' lub 'typeText') z selektorem, który otrzymałeś z narzędzia 'lookAtPage'.
    4.  Powtarzaj ten cykl, aż zrealizujesz zadanie.
    5.  Gdy zbierzesz wszystkie potrzebne informacje, wywołaj narzędzie 'submit_final_report'.
    
    Rozpocznij teraz. Jaki jest Twój pierwszy krok?`;
    try {
        let result = await chat.sendMessage(prompt);
        for (let i = 0; i < 15; i++) {
            const functionCalls = (_d = (_c = (_b = (_a = result.response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d.filter((part) => !!part.functionCall);
            if (!functionCalls || functionCalls.length === 0) {
                break;
            }
            const apiResponses = [];
            for (const call of functionCalls) {
                const { name: action, args: params } = call.functionCall;
                if (action === "submit_final_report") {
                    await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `AI zakończyło pracę i zwróciło ostateczny raport w formacie JSON.` }) });
                    const finalResults = params.companies || [];
                    await taskRef.update({
                        status: "completed",
                        completedAt: admin.firestore.FieldValue.serverTimestamp(),
                        results: finalResults,
                        logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Zakończono. Agent V3 (Puppeteer) znalazł ${finalResults.length} firm.` }),
                    });
                    return;
                }
                else {
                    await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `AI prosi o wykonanie: ${action}` }) });
                    const apiResponse = await execute_puppeteer_action(action, params);
                    apiResponses.push({ functionResponse: { name: action, response: apiResponse } });
                }
            }
            if (apiResponses.length > 0) {
                result = await chat.sendMessage(apiResponses);
            }
        }
        const finalText = ((_j = (_h = (_g = (_f = (_e = result.response.candidates) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.content) === null || _g === void 0 ? void 0 : _g.parts) === null || _h === void 0 ? void 0 : _h[0]) === null || _j === void 0 ? void 0 : _j.text) || "Agent zakończył pracę bez wywołania narzędzia raportującego.";
        await taskRef.update({
            status: "completed",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            results: [],
            summary: finalText,
            logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: "Zakończono. AI nie zwróciło sformatowanej listy." }),
        });
    }
    catch (error) {
        const err = error;
        console.error("Błąd w runAgent3Logic:", err);
        await taskRef.update({ status: "failed", error: err.message });
    }
}
exports.runAgent3Logic = runAgent3Logic;
//# sourceMappingURL=agentV3.js.map