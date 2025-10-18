"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCeidgSearch = runCeidgSearch;
const node_fetch_1 = __importDefault(require("node-fetch"));
const firebase_init_1 = require("../firebase-init");
const CEIDG_API_URL = "https://dane.biznes.gov.pl/api/ceidg/v3/firmy";
const MAX_PAGES_TO_FETCH = 20; // Zwiększono do 20 stron
const MAX_FIRMS_TO_PROCESS = 30; // Zwiększono do 30 firm
/**
 * Nowa funkcja filtrująca z użyciem AI.
 * @param query Kontekst zapytania od użytkownika.
 * @param firmSummaries Lista firm do przefiltrowania.
 * @returns Przefiltrowana lista firm.
 */
async function filterFirmsWithAI(query, firmSummaries) {
    var _a, _b, _c, _d, _e;
    if (firmSummaries.length === 0) {
        return [];
    }
    console.log(`[CEIDG-AI] Uruchamiam filtrację AI dla ${firmSummaries.length} firm.`);
    const generativeModel = firebase_init_1.vertex_ai.getGenerativeModel({ model: "gemini-2.5-flash" });
    const companyNames = firmSummaries.map(f => `{"id": "${f.id}", "nazwa": "${f.nazwa}"}`).join('\n');
    const prompt = `Jesteś analitykiem biznesowym. Twoim zadaniem jest ocena, czy nazwa firmy wskazuje na jej związek z określoną branżą. Przeanalizuj poniższe zapytanie użytkownika i listę firm. Zwróć tylko te firmy, których nazwa jest najbardziej adekwatna.

**KONTEKST ZAPYTANIA:**
- Oryginalne zapytanie: "${query.initialQuery}"
- Zidentyfikowana usługa: "${query.identifiedService || 'brak'}"
- Słowa kluczowe: [${(query.expandedKeywords || []).join(', ')}]

**LISTA FIRM DO OCENY (format JSONL):**
${companyNames}

**ZADANIE:**
Twoim zadaniem jest wybranie do 30 firm z poniższej listy, które najlepiej pasują do kontekstu zapytania.

**Kryteria Oceny:**
1.  **Trafność Nazwy:** Nazwa firmy powinna jak najściślej odpowiadać oryginalnemu zapytaniu lub liście słów kluczowych.
2.  **Odrzucanie:** Odrzuć firmy o nazwach generycznych, niepasujących lub wielobranżowych, jeśli nie wskazują jasno na szukaną specjalizację.

**Format Wyjściowy:**
- Zwróć **wyłącznie** listę firm w formacie JSONL.
- Posortuj listę od **najlepiej pasującej** do najmniej pasującej.
- Zwróć **maksymalnie 30** pozycji.
`;
    try {
        const result = await generativeModel.generateContent(prompt);
        const responseText = (_e = (_d = (_c = (_b = (_a = result.response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text;
        if (!responseText) {
            console.warn("[CEIDG-AI] Otrzymano pustą odpowiedź od AI. Zwracam oryginalną listę.");
            return firmSummaries;
        }
        const filteredSummaries = responseText
            .split('\n')
            .map(line => {
            try {
                return JSON.parse(line);
            }
            catch (_a) {
                return null;
            }
        })
            .filter(item => item && item.id && item.nazwa);
        console.log(`[CEIDG-AI] AI przefiltrowało listę. Pozostało ${filteredSummaries.length} najbardziej trafnych firm.`);
        return filteredSummaries;
    }
    catch (error) {
        console.error("[CEIDG-AI] Błąd podczas filtracji AI. Zwracam oryginalną listę.", error);
        return firmSummaries; // W razie błędu, kontynuuj z niefiltrowaną listą
    }
}
async function getFirmDetails(firmId, apiKey) {
    var _a;
    const url = `https://dane.biznes.gov.pl/api/ceidg/v3/firma/${firmId}`;
    try {
        const response = await (0, node_fetch_1.default)(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!response.ok) {
            console.error(`[CEIDG] Błąd podczas pobierania szczegółów firmy ${firmId}: ${response.status}`);
            return null;
        }
        const data = await response.json();
        return ((_a = data.firma) === null || _a === void 0 ? void 0 : _a[0]) || null;
    }
    catch (error) {
        console.error(`[CEIDG] Błąd krytyczny podczas pobierania szczegółów firmy ${firmId}:`, error);
        return null;
    }
}
async function runCeidgSearch(taskId, query) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const apiKey = process.env.CEIDG_API_KEY;
    if (!apiKey) {
        console.error("[CEIDG] Brak klucza API dla CEIDG. Pomijam to źródło danych.");
        return [];
    }
    const pkdCodesToSearch = ((_a = query.pkdCodes) === null || _a === void 0 ? void 0 : _a.map(p => p.replace(/\./g, ''))) || [];
    console.log(`[CEIDG] Wyszukiwanie dla kodów PKD: [${pkdCodesToSearch.join(', ')}]`);
    const paramsPKD = new URLSearchParams();
    if ((_b = query.location) === null || _b === void 0 ? void 0 : _b.city)
        paramsPKD.append("miasto", query.location.city);
    if ((_c = query.location) === null || _c === void 0 ? void 0 : _c.province)
        paramsPKD.append("wojewodztwo", query.location.province);
    if (pkdCodesToSearch.length > 0) {
        pkdCodesToSearch.forEach(pkd => paramsPKD.append("pkd", pkd));
    }
    paramsPKD.append("status", "AKTYWNY");
    paramsPKD.append("limit", "25");
    const firmSummaries = await executeCeidgQueryWithPagination(taskId, paramsPKD, apiKey);
    // Nowy krok: Filtracja AI
    const aiFilteredSummaries = await filterFirmsWithAI(query, firmSummaries);
    const detailedFirms = [];
    const pkdCodesSet = new Set(pkdCodesToSearch);
    for (const summary of aiFilteredSummaries.slice(0, MAX_FIRMS_TO_PROCESS)) {
        const taskDoc = await firebase_init_1.db.collection("tasks").doc(taskId).get();
        if (['terminated', 'paused'].includes((_d = taskDoc.data()) === null || _d === void 0 ? void 0 : _d.status)) {
            console.log(`[CEIDG] Przerwanie zadania ${taskId} na żądanie (status: ${(_e = taskDoc.data()) === null || _e === void 0 ? void 0 : _e.status}).`);
            break;
        }
        if (summary.id) {
            console.log(`[CEIDG] Pobieranie szczegółów dla firmy: ${summary.nazwa} (ID: ${summary.id})`);
            const details = await getFirmDetails(summary.id, apiKey);
            if (details) {
                const allPkds = [...(((_f = details.pkd) === null || _f === void 0 ? void 0 : _f.map((p) => p.kod)) || []), (_g = details.pkdGlowny) === null || _g === void 0 ? void 0 : _g.kod].filter(Boolean);
                const hasMatchingPkd = pkdCodesSet.size === 0 || allPkds.some(pkd => pkdCodesSet.has(pkd));
                if (!hasMatchingPkd) {
                    console.log(`[CEIDG] Weryfikacja negatywna: Firma ${details.nazwa} nie ma wymaganego PKD. Pomijam.`);
                    continue;
                }
                const contactDetails = {
                    emails: details.email ? [details.email] : [],
                    phones: details.telefon ? [details.telefon] : [],
                    address: details.adresDzialalnosci ? `${details.adresDzialalnosci.ulica} ${details.adresDzialalnosci.budynek}, ${details.adresDzialalnosci.kod} ${details.adresDzialalnosci.miasto}` : ''
                };
                detailedFirms.push({
                    companyName: details.nazwa,
                    description: `Firma znaleziona w CEIDG.`,
                    sourceUrl: details.link || `https://prod.ceidg.gov.pl/ceidg/ceidg.public.ui/search/details.aspx?Id=${summary.id}`,
                    sourceType: 'registry_ceidg',
                    contactDetails: contactDetails,
                    pkdGlowny: (_h = details.pkdGlowny) === null || _h === void 0 ? void 0 : _h.kod,
                    pkdCodes: (details.pkd || []).map((p) => p.kod),
                });
            }
        }
    }
    console.log(`[CEIDG] Ostatecznie znaleziono i przetworzono ${detailedFirms.length} firm z bazy CEIDG.`);
    return detailedFirms;
}
async function executeCeidgQueryWithPagination(taskId, params, apiKey) {
    var _a, _b, _c;
    let allFirms = [];
    let nextUrl = `${CEIDG_API_URL}?${params.toString()}`;
    console.log(`[CEIDG] Rozpoczynam pobieranie paginowanych wyników od: ${nextUrl}`);
    let pageCount = 0;
    const visitedUrls = new Set();
    while (nextUrl && pageCount < MAX_PAGES_TO_FETCH) {
        console.log(`[CEIDG-DEBUG] Fetching URL: ${nextUrl}`);
        if (visitedUrls.has(nextUrl)) {
            console.warn(`[CEIDG] Wykryto pętlę w paginacji (URL się powtarza). Przerywam pobieranie.`);
            break;
        }
        visitedUrls.add(nextUrl);
        pageCount++;
        const taskDoc = await firebase_init_1.db.collection("tasks").doc(taskId).get();
        if (['terminated', 'paused'].includes((_a = taskDoc.data()) === null || _a === void 0 ? void 0 : _a.status)) {
            console.log(`[CEIDG] Przerwanie zadania ${taskId} na żądanie (status: ${(_b = taskDoc.data()) === null || _b === void 0 ? void 0 : _b.status}).`);
            break;
        }
        try {
            const response = await (0, node_fetch_1.default)(nextUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json'
                }
            });
            if (response.status === 401) {
                console.error("[CEIDG] Błąd autoryzacji 401. Sprawdź, czy klucz API jest poprawny.");
                break;
            }
            if (!response.ok) {
                console.error(`[CEIDG] Błąd zapytania do API: ${response.status} ${response.statusText}`);
                const errorBody = await response.text();
                console.error(`[CEIDG] Treść błędu: ${errorBody}`);
                break;
            }
            const data = await response.json();
            if (data.firmy) {
                allFirms.push(...data.firmy);
            }
            nextUrl = ((_c = data.links) === null || _c === void 0 ? void 0 : _c.next) || null;
        }
        catch (error) {
            console.error("[CEIDG] Błąd krytyczny podczas komunikacji z API CEIDG:", error);
            break;
        }
    }
    return allFirms;
}
//# sourceMappingURL=ceidg-searcher.js.map