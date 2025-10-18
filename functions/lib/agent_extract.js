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
exports.runExtractAgent = runExtractAgent;
/*
* =================================================================
* AGENT WYODRĘBNIAJĄCY DANE (EXTRACT AGENT)
* =================================================================
* Ten agent otrzymuje listę linków, odwiedza każdą stronę
* za pomocą Puppeteera i wyodrębnia z niej dane kontaktowe.
* =================================================================
*/
const admin = __importStar(require("firebase-admin"));
const firebase_init_1 = require("./firebase-init");
const vertexai_1 = require("@google-cloud/vertexai");
const uuid_1 = require("uuid");
const params_1 = require("firebase-functions/params");
const google_auth_library_1 = require("google-auth-library");
// Inicjalizacja klienta autoryzacji Google
const auth = new google_auth_library_1.GoogleAuth();
// Definiowanie parametryzowanej konfiguracji dla usługi Puppeteer
const puppeteerServiceUrl = (0, params_1.defineString)("PUPPETEER_SERVICE_URL");
// Funkcja do komunikacji z usługą Puppeteer (z uwierzytelnianiem service-to-service)
async function execute_puppeteer_action(sessionId, action, params) {
    const serviceUrl = puppeteerServiceUrl.value();
    if (!serviceUrl || serviceUrl.startsWith("PLACEHOLDER")) {
        console.error("Brak konfiguracji usługi Puppeteer (PUPPETEER_SERVICE_URL).");
        throw new Error("Brak konfiguracji usługi Puppeteer. Uzupełnij plik .env i wdróż funkcje ponownie.");
    }
    try {
        // Pobierz klienta z tokenem tożsamości dla usługi docelowej
        const client = await auth.getIdTokenClient(serviceUrl);
        // Pobierz nagłówki żądania, które zawierają token 'Authorization: Bearer ...'
        const headers = await client.getRequestHeaders();
        const response = await fetch(serviceUrl, {
            method: 'POST',
            headers: Object.assign(Object.assign({}, headers), { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ sessionId, action, params }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Błąd usługi: status ${response.status}, treść: ${errorText}`);
        }
        return await response.json();
    }
    catch (error) {
        const err = error;
        console.error(`Krytyczny błąd wywołania Puppeteer: ${err.message}`);
        return { success: false, error: `Nie udało się połączyć z usługą Puppeteer: ${err.message}` };
    }
}
// Logika Agenta Wyodrębniającego Dane (zmodernizowana z pętlą zewnętrzną)
async function runExtractAgent(data, taskRef) {
    var _a, _b, _c, _d;
    const { search_results } = data;
    const sessionId = (0, uuid_1.v4)();
    if (!search_results || search_results.length === 0) {
        await taskRef.update({ status: "extract_skipped", logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: "Brak linków do przetworzenia. Kończenie pracy." }) });
        return;
    }
    await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Agent Wyodrębniający rozpoczyna pracę. ID sesji Puppeteer: ${sessionId}. Liczba linków do przetworzenia: ${search_results.length}` }) });
    const browserTools = [
        { name: "goToURL", description: "Nawiguje do podanego adresu URL.", parameters: { type: vertexai_1.SchemaType.OBJECT, properties: { url: { type: vertexai_1.SchemaType.STRING } }, required: ["url"] } },
        { name: "lookAtPage", description: "Analizuje aktualny widok strony i zwraca listę interaktywnych elementów.", parameters: { type: vertexai_1.SchemaType.OBJECT, properties: {} } },
        { name: "scrapeContent", description: "Pobiera zawartość strony w celu znalezienia danych kontaktowych (email, telefon, adres).", parameters: { type: vertexai_1.SchemaType.OBJECT, properties: {} } },
        { name: "clickElement", description: "Klika w element, np. w przycisk 'Kontakt'.", parameters: { type: vertexai_1.SchemaType.OBJECT, properties: { selector: { type: vertexai_1.SchemaType.STRING } }, required: ["selector"] } },
    ];
    const companyReportTool = {
        name: "submit_company_data",
        description: "Użyj tej funkcji, aby zwrócić dane kontaktowe dla JEDNEJ znalezionej firmy.",
        parameters: {
            type: vertexai_1.SchemaType.OBJECT,
            properties: {
                companyName: { type: vertexai_1.SchemaType.STRING, description: "Nazwa znalezionej firmy." },
                sourceUrl: { type: vertexai_1.SchemaType.STRING, description: "Adres URL, na którym znaleziono dane." },
                phones: { type: vertexai_1.SchemaType.ARRAY, items: { type: vertexai_1.SchemaType.STRING }, description: "Tablica znalezionych numerów telefonów." },
                emails: { type: vertexai_1.SchemaType.ARRAY, items: { type: vertexai_1.SchemaType.STRING }, description: "Tablica znalezionych adresów e-mail." },
                addresses: { type: vertexai_1.SchemaType.ARRAY, items: { type: vertexai_1.SchemaType.STRING }, description: "Tablica znalezionych adresów fizycznych." },
                notes: { type: vertexai_1.SchemaType.STRING, description: "Dodatkowe notatki, np. 'Kontakt przez portal Oferteo'." },
            },
            required: ["companyName", "sourceUrl"],
        },
    };
    const generativeModel = firebase_init_1.vertex_ai.getGenerativeModel({
        model: "gemini-2.5-pro",
        tools: [{ functionDeclarations: [...browserTools, companyReportTool] }],
    });
    try {
        // --- NOWA GŁÓWNA PĘTLA PO LINKACH ---
        for (const searchResult of search_results) {
            const urlToProcess = searchResult.link;
            await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `--- Rozpoczynam analizę linku: ${urlToProcess} ---` }) });
            const chat = generativeModel.startChat();
            const prompt = `Jesteś agentem AI, którego zadaniem jest analiza JEDNEJ strony internetowej i zebranie z niej danych kontaktowych. Twoim celem jest strona: ${urlToProcess}.\n\n    TWOJE ZADANIE:\n    1. Użyj \`goToURL\`, aby odwiedzić tę stronę.\n    2. Użyj \`lookAtPage\` i \`scrapeContent\`, aby znaleźć dane kontaktowe: nazwę firmy, numery telefonów, adresy e-mail, adresy fizyczne.\n    3. Jeśli dane są ukryte za przyciskiem (np. \"Pokaż numer\", \"Kontakt\"), użyj \`clickElement\`, aby je odsłonić, a następnie ponownie użyj \`scrapeContent\`.\n    4. Gdy tylko zbierzesz komplet danych dla firmy z tej JEDNEJ strony, natychmiast wywołaj funkcję \`submit_company_data\`, aby zapisać te dane.\n\n    PAMIĘTAJ:\n    - Skupiasz się tylko na jednym linku. Po wywołaniu \`submit_company_data\` Twoja praca nad tym linkiem jest skończona.\n    - Jeśli strona to portal (np. Oferteo), spróbuj znaleźć nazwę firmy i zanotuj to w polu 'notes'.`;
            let result = await chat.sendMessage(prompt);
            // Wewnętrzna pętla konwersacji dla pojedynczego linku
            for (let i = 0; i < 8; i++) { // Pętla bezpieczeństwa (8 kroków na jeden link)
                const functionCalls = (_d = (_c = (_b = (_a = result.response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d.filter((part) => !!part.functionCall);
                if (!functionCalls || functionCalls.length === 0) {
                    break;
                }
                const apiResponses = [];
                let submittedData = false;
                for (const call of functionCalls) {
                    const { name: action, args: params = {} } = call.functionCall;
                    if (action === "submit_company_data") {
                        const companyData = params;
                        await taskRef.update({
                            results: admin.firestore.FieldValue.arrayUnion([companyData]),
                            logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Znaleziono i zapisano dane dla: ${companyData.companyName}` }),
                        });
                        submittedData = true;
                    }
                    else {
                        // Logowanie URL dla goToURL
                        if (action === "goToURL") {
                            await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Agent wchodzi na stronę: ${params.url}` }) });
                        }
                        else {
                            await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Agent wykonuje: ${action}` }) });
                        }
                        const apiResponse = await execute_puppeteer_action(sessionId, action, params);
                        if (action === "lookAtPage" && apiResponse.simplifiedDom) {
                            await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({
                                    timestamp: new Date(),
                                    message: `Agent "widzi" następującą uproszczoną strukturę strony:\n---\n${apiResponse.simplifiedDom}\n---`
                                }) });
                        }
                        apiResponses.push({ functionResponse: { name: action, response: apiResponse } });
                    }
                }
                if (submittedData)
                    break; // Przerwij wewnętrzną pętlę, jeśli dane zostały wysłane
                if (apiResponses.length > 0) {
                    result = await chat.sendMessage(apiResponses);
                }
            }
        }
        // --- LOGIKA KOŃCZENIA PRACY PO GŁÓWNEJ PĘTLI ---
        await taskRef.update({
            status: "completed",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Agent zakończył analizę wszystkich linków.` }),
        });
    }
    catch (error) {
        const err = error;
        await taskRef.update({ status: "extract_failed", error: err.message });
    }
    finally {
        await execute_puppeteer_action(sessionId, "closeSession", {});
    }
}
//# sourceMappingURL=agent_extract.js.map