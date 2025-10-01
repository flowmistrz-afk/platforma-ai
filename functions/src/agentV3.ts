import * as admin from 'firebase-admin';
import { DocumentReference } from 'firebase-admin/firestore';
import { vertex_ai } from './firebase-init';
import { SchemaType, FunctionDeclaration, Part } from '@google-cloud/vertexai';

// Nowa wersja funkcji, która komunikuje się z zewnętrzną usługą Puppeteer
async function execute_puppeteer_action(action: string, params: any): Promise<any> {
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

    } catch (error) {
        const err = error as Error;
        console.error(`Error calling Puppeteer service: ${err.message}`, err.stack);
        return { success: false, error: `Failed to connect to Puppeteer service: ${err.message}` };
    }
}

// Logika orkiestratora AI (runAgent3Logic)
export async function runAgent3Logic(data: any, taskRef: DocumentReference) {
    const { query } = data || {};

    await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: "Agent V3 (Puppeteer) rozpoczyna pracę..." }) });

    const browserTools: FunctionDeclaration[] = [
        { name: "lookAtPage", description: "Analizuje aktualny widok strony i zwraca listę interaktywnych elementów. Użyj tego ZAWSZE jako pierwszy krok na nowej stronie.", parameters: { type: SchemaType.OBJECT, properties: {} } },
        { name: "goToURL", description: "Nawiguje do podanego adresu URL.", parameters: { type: SchemaType.OBJECT, properties: { url: { type: SchemaType.STRING } }, required: ["url"] } },
        { name: "typeText", description: "Wpisuje tekst w pole. Użyj selektora zwróconego przez narzędzie lookAtPage.", parameters: { type: SchemaType.OBJECT, properties: { selector: { type: SchemaType.STRING }, text: { type: SchemaType.STRING } }, required: ["selector", "text"] } },
        { name: "clickElement", description: "Klika w element. Użyj selektora zwróconego przez narzędzie lookAtPage.", parameters: { type: SchemaType.OBJECT, properties: { selector: { type: SchemaType.STRING } }, required: ["selector"] } },
        { name: "scrapeContent", description: "Pobiera pełną zawartość HTML strony do szczegółowej analizy, gdy już wiesz, że jesteś na właściwej stronie.", parameters: { type: SchemaType.OBJECT, properties: {} } },
    ];

    const finalReportTool: FunctionDeclaration = {
        name: "submit_final_report",
        description: "Użyj tej funkcji, aby zwrócić ostateczną, sformatowaną listę znalezionych firm po zakończeniu wyszukiwania.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                companies: {
                    type: SchemaType.ARRAY,
                    description: "Tablica obiektów reprezentujących znalezione firmy.",
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                            nazwa: { type: SchemaType.STRING, description: "Pełna nazwa firmy." },
                            adres: { type: SchemaType.STRING, description: "Adres firmy." },
                            telefon: { type: SchemaType.STRING, description: "Numer telefonu (może być null)." },
                            website: { type: SchemaType.STRING, description: "Adres strony internetowej (może być null)." },
                            ocena: { type: SchemaType.NUMBER, description: "Ocena firmy (może być null)." },
                            liczba_opinii: { type: SchemaType.NUMBER, description: "Liczba opinii (może być null)." },
                        },
                        required: ["nazwa", "adres"],
                    },
                },
            },
            required: ["companies"],
        },
    };

    const allTools = [...browserTools, finalReportTool];

    const generativeModelWithBrowserTools = vertex_ai.getGenerativeModel({
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
            const functionCalls = result.response.candidates?.[0]?.content?.parts?.filter((part: Part): part is Part & { functionCall: any } => !!part.functionCall);

            if (!functionCalls || functionCalls.length === 0) {
                break;
            }

            const apiResponses = [];
            for (const call of functionCalls) {
                const { name: action, args: params } = call.functionCall;

                if (action === "submit_final_report") {
                    await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `AI zakończyło pracę i zwróciło ostateczny raport w formacie JSON.` }) });
                    const finalResults = (params as any).companies || [];
                    
                    await taskRef.update({
                        status: "completed",
                        completedAt: admin.firestore.FieldValue.serverTimestamp(),
                        results: finalResults,
                        logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Zakończono. Agent V3 (Puppeteer) znalazł ${finalResults.length} firm.` }),
                    });
                    return;
                } else {
                    await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `AI prosi o wykonanie: ${action}` }) });
                    const apiResponse = await execute_puppeteer_action(action, params);
                    apiResponses.push({ functionResponse: { name: action, response: apiResponse } });
                }
            }
            
            if (apiResponses.length > 0) {
                result = await chat.sendMessage(apiResponses);
            }
        }

        const finalText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "Agent zakończył pracę bez wywołania narzędzia raportującego.";
        await taskRef.update({
            status: "completed",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            results: [],
            summary: finalText,
            logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: "Zakończono. AI nie zwróciło sformatowanej listy." }),
        });

    } catch (error) {
        const err = error as Error;
        console.error("Błąd w runAgent3Logic:", err);
        await taskRef.update({ status: "failed", error: err.message });
    }
}