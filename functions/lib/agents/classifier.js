"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runClassifier = runClassifier;
const firebase_init_1 = require("../firebase-init");
/**
 * Uruchamia Agenta Klasyfikującego Linki.
 * @param searchResults Tablica obiektów z wynikami wyszukiwania Google.
 * @returns Obietnica zwracająca obiekt ze sklasyfikowanymi linkami.
 */
async function runClassifier(taskId, searchResults) {
    var _a, _b, _c, _d, _e;
    if (!searchResults || searchResults.length === 0) {
        return { companyUrls: [], portalUrls: [] };
    }
    const generativeModel = firebase_init_1.vertex_ai.getGenerativeModel({ model: "gemini-2.5-flash" });
    const linksToClassify = searchResults.map(r => `{"link": "${r.link}", "title": "${r.title}", "snippet": "${r.snippet}"}`).join("\n");
    const prompt = `Jesteś inteligentnym analitykiem internetowym. Twoim zadaniem jest klasyfikacja listy linków na podstawie ich adresu, tytułu i opisu. Dla każdego linku zdecyduj, czy prowadzi on bezpośrednio do strony firmowej (wizytówki konkretnej firmy), czy do portalu ogłoszeniowego, katalogu firm lub forum (np. Oferteo, OLX, Panorama Firm, Fixly, forum-budowlane.pl).\n\n**Wytyczne:**\n- **Strona firmowa**: Zazwyczaj ma w domenie nazwę firmy, w tytule również, a opis mówi o ofercie tej konkretnej firmy.\n- **Portal/Katalog**: Adres URL jest generyczny (np. oferteo.pl, panoramafirm.pl), a tytuł i opis mówią o wielu firmach, zleceniach lub zawierają frazy "znajdź fachowca", "najlepsze firmy" itp.\n\nLista linków do sklasyfikowania (w formacie JSONL):\n${linksToClassify}\n\nZwróć wynik **wyłącznie** w formacie JSON, bez żadnych dodatkowych wyjaśnień, komentarzy ani formatowania markdown. Struktura JSON musi być następująca:\n{\n  "companyUrls": ["link_do_strony_firmowej_1", "link_do_strony_firmowej_2"],\n  "portalUrls": ["link_do_portalu_1", "link_do_portalu_2"]\n}`;
    try {
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;
        const responseText = (_e = (_d = (_c = (_b = (_a = response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text;
        if (!responseText) {
            throw new Error("Otrzymano pustą odpowiedź od AI przy klasyfikacji linków.");
        }
        const jsonMatch = responseText.match(/{[\s\S]*}/);
        if (!jsonMatch || !jsonMatch[0]) {
            console.error("Nie znaleziono obiektu JSON w odpowiedzi AI (klasyfikacja).", responseText);
            throw new Error("Nie znaleziono obiektu JSON w odpowiedzi AI (klasyfikacja).");
        }
        const parsedResult = JSON.parse(jsonMatch[0]);
        // Konwertuj z powrotem na pełne obiekty SearchResult
        const searchResultsMap = new Map(searchResults.map(r => [r.link, r]));
        const finalResult = {
            companyUrls: (parsedResult.companyUrls || []).map(link => searchResultsMap.get(link)).filter((r) => r !== undefined),
            portalUrls: (parsedResult.portalUrls || []).map(link => searchResultsMap.get(link)).filter((r) => r !== undefined),
        };
        // Prosta walidacja, czy odpowiedź zawiera oczekiwane pola
        if (Array.isArray(finalResult.companyUrls) && Array.isArray(finalResult.portalUrls)) {
            return finalResult;
        }
        else {
            throw new Error("Odpowiedź AI nie zawiera oczekiwanych pól 'companyUrls' i 'portalUrls'.");
        }
    }
    catch (error) {
        console.error("Błąd podczas klasyfikacji linków przez AI:", error);
        // W przypadku błędu zwróć pusty obiekt, aby nie przerywać całego procesu
        return { companyUrls: [], portalUrls: [] };
    }
}
//# sourceMappingURL=classifier.js.map