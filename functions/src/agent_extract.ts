
/*
* =================================================================
* AGENT WYODRĘBNIAJĄCY DANE (EXTRACT AGENT)
* =================================================================
* Ten agent otrzymuje listę linków, odwiedza każdą stronę
* za pomocą Puppeteera i wyodrębnia z niej dane kontaktowe.
* =================================================================
*/
import * as admin from 'firebase-admin';
import { DocumentReference } from 'firebase-admin/firestore';
import { vertex_ai } from './firebase-init';
import { SchemaType, FunctionDeclaration, Part } from '@google-cloud/vertexai';
import { v4 as uuidv4 } from 'uuid';
import { defineString } from 'firebase-functions/params';
import { GoogleAuth } from 'google-auth-library';

// Inicjalizacja klienta autoryzacji Google
const auth = new GoogleAuth();

// Definiowanie parametryzowanej konfiguracji dla usługi Puppeteer
const puppeteerServiceUrl = defineString("PUPPETEER_SERVICE_URL");

// Funkcja do komunikacji z usługą Puppeteer (z uwierzytelnianiem service-to-service)
async function execute_puppeteer_action(sessionId: string, action: string, params: any): Promise<any> {
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
            headers: {
                ...headers, // Dodaj nagłówek autoryzacji
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId, action, params }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Błąd usługi: status ${response.status}, treść: ${errorText}`);
        }
        return await response.json();
    } catch (error) {
        const err = error as Error;
        console.error(`Krytyczny błąd wywołania Puppeteer: ${err.message}`);
        return { success: false, error: `Nie udało się połączyć z usługą Puppeteer: ${err.message}` };
    }
}


// Logika Agenta Wyodrębniającego Dane (zmodernizowana z pętlą zewnętrzną)
export async function runExtractAgent(data: any, taskRef: DocumentReference) {
    const { search_results } = data;
    const sessionId = uuidv4();

    if (!search_results || search_results.length === 0) {
        await taskRef.update({ status: "extract_skipped", logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: "Brak linków do przetworzenia. Kończenie pracy." }) });
        return;
    }

    await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Agent Wyodrębniający rozpoczyna pracę. ID sesji Puppeteer: ${sessionId}. Liczba linków do przetworzenia: ${search_results.length}` }) });

    const browserTools: FunctionDeclaration[] = [
        { name: "goToURL", description: "Nawiguje do podanego adresu URL.", parameters: { type: SchemaType.OBJECT, properties: { url: { type: SchemaType.STRING } }, required: ["url"] } },
        { name: "lookAtPage", description: "Analizuje aktualny widok strony i zwraca listę interaktywnych elementów.", parameters: { type: SchemaType.OBJECT, properties: {} } },
        { name: "scrapeContent", description: "Pobiera zawartość strony w celu znalezienia danych kontaktowych (email, telefon, adres).", parameters: { type: SchemaType.OBJECT, properties: {} } },
        { name: "clickElement", description: "Klika w element, np. w przycisk 'Kontakt'.", parameters: { type: SchemaType.OBJECT, properties: { selector: { type: SchemaType.STRING } }, required: ["selector"] } },
    ];

    const companyReportTool: FunctionDeclaration = {
        name: "submit_company_data",
        description: "Użyj tej funkcji, aby zwrócić dane kontaktowe dla JEDNEJ znalezionej firmy.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                companyName: { type: SchemaType.STRING, description: "Nazwa znalezionej firmy." },
                sourceUrl: { type: SchemaType.STRING, description: "Adres URL, na którym znaleziono dane." },
                phones: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Tablica znalezionych numerów telefonów." },
                emails: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Tablica znalezionych adresów e-mail." },
                addresses: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Tablica znalezionych adresów fizycznych." },
                notes: { type: SchemaType.STRING, description: "Dodatkowe notatki, np. 'Kontakt przez portal Oferteo'." },
            },
            required: ["companyName", "sourceUrl"],
        },
    };

    const generativeModel = vertex_ai.getGenerativeModel({
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
                const functionCalls = result.response.candidates?.[0]?.content?.parts?.filter((part: Part): part is Part & { functionCall: any } => !!part.functionCall);

                if (!functionCalls || functionCalls.length === 0) {
                    break;
                }

                const apiResponses = [];
                let submittedData = false;
                for (const call of functionCalls) {
                    const { name: action, args: params = {} } = call.functionCall;

                    if (action === "submit_company_data") {
                        const companyData = params as any;
                        await taskRef.update({
                            results: admin.firestore.FieldValue.arrayUnion([companyData]),
                            logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Znaleziono i zapisano dane dla: ${companyData.companyName}` }),
                        });
                        submittedData = true; 
                    } else {
                        // Logowanie URL dla goToURL
                        if (action === "goToURL") {
                            await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Agent wchodzi na stronę: ${params.url}` }) });
                        } else {
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

                if (submittedData) break; // Przerwij wewnętrzną pętlę, jeśli dane zostały wysłane

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

    } catch (error) {
        const err = error as Error;
        await taskRef.update({ status: "extract_failed", error: err.message });
    } finally {
        await execute_puppeteer_action(sessionId, "closeSession", {});
    }
}
