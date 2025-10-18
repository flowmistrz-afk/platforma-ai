import { vertex_ai } from "../firebase-init";

const PUPPETEER_SERVICE_URL = process.env.PUPPETEER_SERVICE_URL;

export interface SearchResult {
  link: string;
  title: string;
  snippet: string;
}

async function callPuppeteer(action: string, params: any, sessionId: string): Promise<any> {
  if (!PUPPETEER_SERVICE_URL) throw new Error("Brak skonfigurowanego adresu URL usługi Puppeteer.");
  console.log(`[BrowserSearcher] -> Usługa Puppeteer: Akcja=${action}, Parametry=${JSON.stringify(params)}`);
  try {
    const response = await fetch(PUPPETEER_SERVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params, sessionId }),
    });
    if (!response.ok) throw new Error(`Usługa Puppeteer zwróciła błąd: ${response.status} ${await response.text()}`);
    return await response.json();
  } catch (error) {
    console.error(`[BrowserSearcher] Błąd krytyczny podczas komunikacji z usługą Puppeteer:`, error);
    throw error;
  }
}

async function getAiChoiceForSearch(simplifiedDom: string): Promise<any> {
    const model = vertex_ai.getGenerativeModel({ model: "gemini-2.5-pro" });
    const prompt = `
    Jesteś analitykiem danych. Twoim zadaniem jest przeanalizowanie uproszczonej struktury strony z wynikami wyszukiwania i wyodrębnienie z niej wszystkich linków, które są organicznymi wynikami.

    Oto co aktualnie widzisz na stronie (uproszczona lista interaktywnych elementów):
    \`\`\`
    ${simplifiedDom}
    \`\`\`

    Zadanie: Zwróć **wyłącznie** obiekt JSON, który będzie zawierał jedną właściwość: "results". Właściwość "results" musi być tablicą obiektów, gdzie każdy obiekt reprezentuje jeden wynik wyszukiwania i ma format: {"title": "Tytuł linku", "link": "URL linku"}.

    Przykład odpowiedzi:
    {"results": [{"title": "Tytuł wyniku 1", "link": "https://example.com/1"}, {"title": "Tytuł wyniku 2", "link": "https://example.com/2"}]}

    Nie dodawaj żadnych innych słów, wyjaśnień ani formatowania. Zwróć tylko i wyłącznie JSON.
    `;

    try {
        const result = await model.generateContent(prompt);
        const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = responseText.match(/{[\s\S]*}/);
        if (!jsonMatch) throw new Error("AI nie zwróciło poprawnego JSONa z wynikami wyszukiwania.");
        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.error("[BrowserSearcher-AI] Błąd podczas analizy wyników wyszukiwania przez AI:", error);
        return { results: [] };
    }
}

export async function performBrowserSearch(query: string): Promise<SearchResult[]> {
    const sessionId = Math.random().toString(36).substring(7);
    console.log(`[BrowserSearcher] Rozpoczynam wyszukiwanie w przeglądarce dla frazy: "${query}"`);

    try {
        await callPuppeteer('goToURL', { url: 'https://duckduckgo.com/' }, sessionId);
        await callPuppeteer('typeText', { selector: 'input[name="q"]', text: query }, sessionId);
        await callPuppeteer('clickElement', { selector: 'button[type="submit"]' }, sessionId);
        
        // Po załadowaniu wyników, "patrzymy" na stronę
        const view = await callPuppeteer('lookAtPage', {}, sessionId);
        if (!view || !view.simplifiedDom) {
            console.log("[BrowserSearcher] Nie udało się uzyskać widoku strony z wynikami.");
            return [];
        }

        // Prosimy AI o wyciągnięcie wyników z tego, co "widzi"
        const aiResults = await getAiChoiceForSearch(view.simplifiedDom);

        const searchResults: SearchResult[] = (aiResults.results || []).map((r: any) => ({ ...r, snippet: '' }));

        console.log(`[BrowserSearcher] AI wyodrębniło ${searchResults.length} wyników z DuckDuckGo.`);
        return searchResults;

    } catch (error) {
        console.error(`[BrowserSearcher] Błąd podczas wyszukiwania w przeglądarce:`, error);
        return [];
    } finally {
        await callPuppeteer('closeSession', {}, sessionId).catch(err => console.error("Błąd podczas zamykania sesji", err));
    }
}