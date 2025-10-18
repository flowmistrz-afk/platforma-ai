"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.performBrowserSearch = performBrowserSearch;
const firebase_init_1 = require("../firebase-init");
const PUPPETEER_SERVICE_URL = process.env.PUPPETEER_SERVICE_URL;
async function callPuppeteer(action, params, sessionId) {
    if (!PUPPETEER_SERVICE_URL)
        throw new Error("Brak skonfigurowanego adresu URL usługi Puppeteer.");
    console.log(`[BrowserSearcher] -> Usługa Puppeteer: Akcja=${action}, Parametry=${JSON.stringify(params)}`);
    try {
        const response = await fetch(PUPPETEER_SERVICE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, params, sessionId }),
        });
        if (!response.ok)
            throw new Error(`Usługa Puppeteer zwróciła błąd: ${response.status} ${await response.text()}`);
        return await response.json();
    }
    catch (error) {
        console.error(`[BrowserSearcher] Błąd krytyczny podczas komunikacji z usługą Puppeteer:`, error);
        throw error;
    }
}
async function getAiChoiceForSearch(simplifiedDom) {
    var _a, _b, _c, _d, _e;
    const model = firebase_init_1.vertex_ai.getGenerativeModel({ model: "gemini-2.5-pro" });
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
        const responseText = ((_e = (_d = (_c = (_b = (_a = result.response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text) || '';
        const jsonMatch = responseText.match(/{[\s\S]*}/);
        if (!jsonMatch)
            throw new Error("AI nie zwróciło poprawnego JSONa z wynikami wyszukiwania.");
        return JSON.parse(jsonMatch[0]);
    }
    catch (error) {
        console.error("[BrowserSearcher-AI] Błąd podczas analizy wyników wyszukiwania przez AI:", error);
        return { results: [] };
    }
}
async function performBrowserSearch(query) {
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
        const searchResults = (aiResults.results || []).map((r) => (Object.assign(Object.assign({}, r), { snippet: '' })));
        console.log(`[BrowserSearcher] AI wyodrębniło ${searchResults.length} wyników z DuckDuckGo.`);
        return searchResults;
    }
    catch (error) {
        console.error(`[BrowserSearcher] Błąd podczas wyszukiwania w przeglądarce:`, error);
        return [];
    }
    finally {
        await callPuppeteer('closeSession', {}, sessionId).catch(err => console.error("Błąd podczas zamykania sesji", err));
    }
}
//# sourceMappingURL=browser-searcher.js.map