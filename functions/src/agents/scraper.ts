import { vertex_ai, db } from "../firebase-init";
import { ScrapedData } from "../types";
import { webFetch } from "../tools";
import fetch from 'node-fetch';

const PARALLEL_BATCH_SIZE = 3;
const PUPPETEER_SERVICE_URL = process.env.PUPPETEER_SERVICE_URL;

// ==================================================================
// == Puppeteer-based Scraper Implementation
// ==================================================================

async function callPuppeteer(action: string, params: any, sessionId: string): Promise<any> {
    if (!PUPPETEER_SERVICE_URL) throw new Error("Brak skonfigurowanego adresu URL usługi Puppeteer.");
    console.log(`[PuppeteerTool] -> Usługa Puppeteer: Akcja=${action}, Parametry=${JSON.stringify(params)}`);
    try {
        const response = await fetch(PUPPETEER_SERVICE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, params, sessionId }),
        });
        if (!response.ok) throw new Error(`Usługa Puppeteer zwróciła błąd: ${response.status} ${await response.text()}`);
        return await response.json();
    } catch (error) {
        console.error(`[PuppeteerTool] Błąd krytyczny podczas komunikacji z usługą Puppeteer:`, error);
        throw error;
    }
}

async function puppeteerScrape(url: string): Promise<{textContent: string, links: {href: string, text: string}[]}> {
    const sessionId = Math.random().toString(36).substring(7);
    let finalContent = '';

    try {
        let normalizedUrl = url;
        if (!normalizedUrl.startsWith('http')) {
            normalizedUrl = 'https://' + normalizedUrl;
        }

        await callPuppeteer('goToURL', { url: normalizedUrl }, sessionId);
        const contentResult = await callPuppeteer('scrapeContent', {}, sessionId);
        finalContent = contentResult.content;

    } catch (error) {
        console.error(`[PuppeteerTool] Błąd podczas scrapingu URL ${url}:`, error);
    } finally {
        await callPuppeteer('closeSession', {}, sessionId).catch(err => console.error("Błąd podczas zamykania sesji", err));
    }

    // Puppeteer doesn't easily give us clean links, so we return an empty array.
    // The main purpose is to get the JS-rendered content.
    return { textContent: finalContent, links: [] };
}


// ==================================================================
// == Hybrid Scraper Orchestrator with Fallback Logic
// ==================================================================

async function scrapeSingleUrl(url: string, sourceType: 'company_website' | 'portal'): Promise<ScrapedData> {
    console.log(`[HybridScraper] Przetwarzam URL: ${url}`);
    try {
        // Krok 1: Spróbuj pobrać treść za pomocą szybkiego webFetch
        let initialContent;
        try {
            console.log(`[HybridScraper] Próba pobrania za pomocą webFetch...`);
            initialContent = await webFetch(url);
            // Prosta heurystyka do wykrywania stron opartych na JS (pusta treść)
            if (!initialContent.textContent || initialContent.textContent.length < 200) {
                console.log(`[HybridScraper] webFetch zwrócił pustą lub podejrzaną treść. Przełączam na Puppeteer.`);
                throw new Error("Treść zbyt krótka, prawdopodobnie strona JS.");
            }
        } catch (error: any) {
            console.warn(`[HybridScraper] webFetch nie powiódł się (${error.message}). Uruchamiam Puppeteer jako fallback.`);
            initialContent = await puppeteerScrape(url);
        }

        const model = vertex_ai.getGenerativeModel({ model: "gemini-2.5-pro" });
        let { textContent, links } = initialContent;

        // Krok 2: Poproś model o analizę lub wskazanie następnego kroku
        const linksForPrompt = links.map(l => `Tytuł: "${l.text}", URL: "${l.href}"`).join('\n');
        let prompt = `
            Jesteś ekspertem od analizy danych. Twoje zadanie to znalezienie nazwy firmy, danych kontaktowych (e-mail, telefon) oraz stworzenie jednozdaniowego opisu jej działalności na podstawie dostarczonej treści strony internetowej.

            PRZEANALIZUJ PONIŻSZĄ TREŚĆ:
            ---
            ${textContent}
            ---

            PRZEANALIZUJ PONIŻSZĄ LISTĘ LINKÓW:
            ---
            ${linksForPrompt}
            ---

            ZADANIE:
            1.  **Priorytet 1: Opis i dane.** Przeanalizuj dostarczoną TREŚĆ. Twoim głównym celem jest znalezienie **opisu działalności** oraz danych kontaktowych. Jeśli znajdziesz wystarczająco informacji, aby stworzyć opis ORAZ znajdziesz dane kontaktowe, zwróć wszystko w formacie JSON (Format 1).
            2.  **Priorytet 2: Znajdź stronę "O nas" lub "Kontakt".** Jeśli w TREŚCI nie ma wystarczających danych, ale na LIŚCIE LINKÓW widzisz link, który prawdopodobnie prowadzi do strony z tymi informacjami (szukaj słów "kontakt", "contact", "o nas", "about"), zwróć JSON ze wskazaniem tego URL-a w polu \nnextUrl\n (Format 2).

            Zwróć **wyłącznie** obiekt JSON w jednym z dwóch formatów:
            Format 1 (gdy masz wszystkie dane):
            {
              "companyName": "Nazwa firmy",
              "description": "Jednozdaniowy, konkretny opis działalności firmy.",
              "emails": ["email@example.com"],
              "phones": ["123456789"]
            }

            Format 2 (gdy potrzebujesz więcej informacji):
            {
              "nextUrl": "URL_do_strony_O_firmie_lub_Kontakt"
            }
        `;

        let result = await model.generateContent(prompt);
        let responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        let jsonMatch = responseText.match(/{[\s\S]*}/);

        if (!jsonMatch) {
            throw new Error("AI nie zwróciło poprawnego JSONa w pierwszym kroku.");
        }

        let parsedResult: { companyName?: string; description?: string; emails?: string[]; phones?: string[]; nextUrl?: string } = JSON.parse(jsonMatch[0]);

        // Krok 3: Jeśli model wskazał kolejny URL, pobierz go (tylko za pomocą webFetch)
        if (parsedResult.nextUrl) {
            console.log(`[HybridScraper] Model wskazał kolejny URL do sprawdzenia: ${parsedResult.nextUrl}`);
            const nextUrl = new URL(parsedResult.nextUrl, url).href;
            const secondFetch = await webFetch(nextUrl);
            textContent = secondFetch.textContent;

            prompt = `
                Jesteś ekspertem od web scrapingu. Przeanalizuj poniższą treść strony internetowej i wyodrębnij z niej nazwę firmy, e-maile, telefony oraz stwórz jednozdaniowy, konkretny opis działalności firmy.

                TREŚĆ STRONY:
                ---
                ${textContent}
                ---

                Zwróć wynik **wyłącznie** w formacie JSON, bez żadnych dodatkowych wyjaśnień, komentarzy ani formatowania markdown. Struktura JSON musi być następująca:
                {
                  "companyName": "Nazwa firmy znaleziona na stronie",
                  "description": "Jednozdaniowy, konkretny opis działalności firmy.",
                  "emails": ["email1@example.com", "email2@example.com"],
                  "phones": ["123456789", "987654321"]
                }
            `;
            result = await model.generateContent(prompt);
            responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '';
            jsonMatch = responseText.match(/{[\s\S]*}/);

            if (!jsonMatch) {
                throw new Error("AI nie zwróciło poprawnego JSONa w drugim kroku.");
            }
            // Połącz wyniki, jeśli w pierwszym kroku znaleziono częściowe dane
            const finalParsedResult = JSON.parse(jsonMatch[0]);
            parsedResult = { ...parsedResult, ...finalParsedResult };
        }

        return {
            sourceUrl: url,
            sourceType: sourceType,
            companyName: parsedResult.companyName || "Nie udało się ustalić",
            description: parsedResult.description || "",
            contactDetails: {
                emails: [...new Set(parsedResult.emails || [])],
                phones: [...new Set(parsedResult.phones || [])],
                address: ""
            }
        };

    } catch (error) {
        console.error(`[HybridScraper] Błąd podczas scrapingu URL ${url}:`, error);
        return {
            sourceUrl: url,
            sourceType: sourceType,
            companyName: "Błąd podczas przetwarzania",
            description: "",
            contactDetails: { emails: [], phones: [], address: "" }
        };
    }
}


async function processInBatches<T, R>(items: T[], processItem: (item: T) => Promise<R>, batchSize: number, taskId: string): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const taskDoc = await db.collection("tasks").doc(taskId).get();
        if (['terminated', 'paused'].includes(taskDoc.data()?.status)) {
          console.log(`[HybridScraper] Zadanie ${taskId} wstrzymane lub zakończone, przerywam przetwarzanie batchowe.`);
          break;
        }
        const batch = items.slice(i, i + batchSize);
        console.log(`[HybridScraper] Przetwarzam batch ${i/batchSize + 1} z ${Math.ceil(items.length/batchSize)} (rozmiar: ${batch.length})`);
        const batchPromises = batch.map(processItem);
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
    }
    return results;
}

export async function scrapeCompanyWebsites(taskId: string, urls: string[]): Promise<ScrapedData[]> {
  console.log(`[HybridScraper] Rozpoczynam scraping ${urls.length} stron firmowych.`);
  const results = await processInBatches(urls, (url) => scrapeSingleUrl(url, 'company_website'), PARALLEL_BATCH_SIZE, taskId);
  return results.filter(r => r.contactDetails.emails.length > 0 || r.contactDetails.phones.length > 0);
}

export async function scrapePortalWebsites(taskId: string, urls: string[]): Promise<ScrapedData[]> {
    console.log(`[HybridScraper] Rozpoczynam scraping ${urls.length} portali.`);
    const results = await processInBatches(urls, (url) => scrapeSingleUrl(url, 'portal'), PARALLEL_BATCH_SIZE, taskId);
    return results.filter(r => r.contactDetails.emails.length > 0 || r.contactDetails.phones.length > 0);
}