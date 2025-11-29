"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runGoogleSearch = runGoogleSearch;
const firebase_init_1 = require("../firebase-init");
const secret_manager_1 = require("@google-cloud/secret-manager");
const secretManagerClient = new secret_manager_1.SecretManagerServiceClient();
async function getSecret(secretName) {
    var _a, _b;
    const [version] = await secretManagerClient.accessSecretVersion({
        name: `projects/automatyzacja-pesamu/secrets/${secretName}/versions/latest`,
    });
    const payload = (_b = (_a = version.payload) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.toString();
    if (!payload) {
        throw new Error(`Secret ${secretName} has no payload.`);
    }
    return payload;
}
async function filterLinksWithAI(query, searchResults) {
    var _a, _b, _c, _d, _e;
    if (!searchResults || searchResults.length === 0) {
        return [];
    }
    const generativeModel = firebase_init_1.vertex_ai.getGenerativeModel({ model: "gemini-2.5-flash" });
    const linksToFilter = searchResults.map(r => `{"link": "${r.link}", "title": "${r.title}", "snippet": "${r.snippet}"}`).join("\n");
    const prompt = `Jesteś analitykiem danych specjalizującym się w ocenie wyników wyszukiwania. Twoim zadaniem jest przeanalizowanie poniższej listy linków (w formacie JSONL) w kontekście zapytania użytkownika i odfiltrowanie tylko tych, które z dużym prawdopodobieństwem są stroną firmy świadczącej usługi lub portalem zbierającym oferty.

**Kontekst zapytania użytkownika:**
- Usługa: "${query.identifiedService || query.initialQuery}"

**Kryteria Oceny:**
- **ZACHOWAJ:** Linki, których tytuł lub opis wskazują na konkretną firmę, ofertę, usługi, kontakt, portfolio (np. "Jan Kowalski - Usługi Budowlane", "Oferteo - znajdź wykonawcę", "Cennik - Firma X").
- **ODRZUĆ:** Linki prowadzące do artykułów, wiadomości, postów na forach, stron informacyjnych, wpisów na blogach, stron urzędowych, definicji słownikowych (np. "Jak wybrać firmę?", "Remont ulicy w Dębicy - Wiadomości", "Forum budowlane - opinie", "Wikipedia: Asfalt").

**Lista linków do odfiltrowania (format JSONL):**
${linksToFilter}

Zwróć **wyłącznie** przefiltrowaną listę linków w tym samym formacie JSONL, bez żadnych dodatkowych wyjaśnień, komentarzy ani formatowania markdown. Zwróć tylko te linki, które zostały zakwalifikowane do zachowania.`;
    try {
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;
        const responseText = (_e = (_d = (_c = (_b = (_a = response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text;
        if (!responseText) {
            console.warn("[Searcher-Filter] Otrzymano pustą odpowiedź od AI. Zwracam oryginalną listę.");
            return searchResults;
        }
        const filteredLinks = responseText
            .trim()
            .split('\n')
            .map(line => {
            try {
                return JSON.parse(line);
            }
            catch (e) {
                console.warn("[Searcher-Filter] Błąd parsowania linii JSON, pomijam:", line, e);
                return null;
            }
        })
            .filter((item) => item !== null && !!item.link && !!item.title && !!item.snippet);
        return filteredLinks;
    }
    catch (error) {
        console.error("[Searcher-Filter] Błąd podczas filtrowania linków przez AI:", error);
        return searchResults;
    }
}
/**
 * Uruchamia Asystenta Wyszukującego Google.
 * Wykonuje wyszukiwania dla każdego słowa kluczowego i zwraca unikalną listę wyników.
 * @param query Obiekt zapytania z zadania, zawierający wzbogacone słowa kluczowe i lokalizację.
 * @returns Obietnica zwracająca tablicę wyników wyszukiwania.
 */
async function runGoogleSearch(taskId, query) {
    var _a, _b, _c;
    const apiKey = await getSecret('SEARCH_API_KEY');
    const searchEngineId = await getSecret('SEARCH_ENGINE_CX');
    if (!apiKey || !searchEngineId) {
        throw new Error("Brak klucza API lub ID wyszukiwarki w zmiennych środowiskowych.");
    }
    if (!query.expandedKeywords || query.expandedKeywords.length === 0) {
        console.log("Brak rozszerzonych słów kluczowych, pomijam wyszukiwanie.");
        return [];
    }
    const allResults = [];
    const searchLocation = ((_a = query.location) === null || _a === void 0 ? void 0 : _a.city) || '';
    // Pętla przez wszystkie wzbogacone słowa kluczowe
    for (const keyword of query.expandedKeywords) {
        const taskDoc = await firebase_init_1.db.collection("tasks").doc(taskId).get();
        if (['terminated', 'paused'].includes((_b = taskDoc.data()) === null || _b === void 0 ? void 0 : _b.status)) {
            console.log(`[Searcher] Przerwanie zadania ${taskId} na żądanie (status: ${(_c = taskDoc.data()) === null || _c === void 0 ? void 0 : _c.status}).`);
            break;
        }
        const searchQuery = `${keyword} ${searchLocation}`.trim();
        const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(searchQuery)}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`Błąd zapytania do Google Search API dla "${searchQuery}": ${response.statusText}`);
                continue; // Przejdź do następnego słowa kluczowego w przypadku błędu
            }
            const data = await response.json();
            if (data.items) {
                const results = data.items.map((item) => ({
                    link: item.link,
                    title: item.title,
                    snippet: item.snippet,
                }));
                allResults.push(...results);
            }
        }
        catch (error) {
            console.error(`Błąd krytyczny podczas wyszukiwania dla "${searchQuery}":`, error);
            // Kontynuuj, nawet jeśli jedno zapytanie się nie powiedzie
        }
    }
    // Usuwanie duplikatów na podstawie linku
    const uniqueResults = Array.from(new Map(allResults.map(item => [item.link, item])).values());
    console.log(`[Searcher] Znaleziono ${uniqueResults.length} unikalnych wyników wyszukiwania.`);
    // Nowy krok: Filtrowanie wyników za pomocą AI
    console.log(`[Searcher] Rozpoczynam filtrację ${uniqueResults.length} linków za pomocą AI...`);
    const filteredResults = await filterLinksWithAI(query, uniqueResults);
    console.log(`[Searcher] Po filtracji AI pozostało ${filteredResults.length} linków.`);
    return filteredResults;
}
// TODO: Implementacja Asystenta Google Maps
// export async function runGoogleMapsSearch(...) { ... }
// TODO: Implementacja Asystenta CEIDG/KRS
// export async function runCeidgSearch(...) { ... }
//# sourceMappingURL=searcher.js.map