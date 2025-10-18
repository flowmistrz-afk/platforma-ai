"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrichContacts = enrichContacts;
const firebase_init_1 = require("../firebase-init");
const contact_scraper_1 = require("./contact-scraper");
const browser_searcher_1 = require("./browser-searcher");
const CONCURRENCY_LIMIT = 3; // Przetwarzaj maksymalnie 3 firmy jednocześnie
function findBestUrl(results) {
    if (!results || results.length === 0)
        return null;
    const facebookResult = results.find(r => r && r.link && r.link.includes("facebook.com"));
    if (facebookResult && facebookResult.link)
        return facebookResult.link;
    const firstResult = results[0];
    if (firstResult && firstResult.link)
        return firstResult.link;
    return null;
}
async function enrichSingleFirm(firm, taskId) {
    var _a;
    const enrichedFirm = Object.assign(Object.assign({}, firm), { contactDetails: Object.assign(Object.assign({}, firm.contactDetails), { emails: [...firm.contactDetails.emails], phones: [...firm.contactDetails.phones] }) });
    if (enrichedFirm.contactDetails.emails.length > 0 || enrichedFirm.contactDetails.phones.length > 0) {
        console.log(`[Contact-Enricher] Firma ${enrichedFirm.companyName} ma już dane kontaktowe. Pomijam.`);
        return enrichedFirm;
    }
    const baseQuery = enrichedFirm.companyName;
    if (!baseQuery) {
        console.log(`[Contact-Enricher] Brak nazwy firmy, pomijam wyszukiwanie.`);
        return enrichedFirm;
    }
    // Sprawdzenie statusu zadania przed kosztownymi operacjami
    const taskDoc = await firebase_init_1.db.collection("tasks").doc(taskId).get();
    if (['terminated', 'paused'].includes((_a = taskDoc.data()) === null || _a === void 0 ? void 0 : _a.status)) {
        console.log(`[Contact-Enricher] Przerwanie zadania ${taskId} na żądanie (przed wyszukiwaniem).`);
        return enrichedFirm;
    }
    console.log(`[Contact-Enricher] Rozpoczynam pracę dla: ${baseQuery}`);
    let bestUrl = null;
    const fbQuery = `${baseQuery} facebook`;
    const fbResults = await (0, browser_searcher_1.performBrowserSearch)(fbQuery);
    const facebookUrl = fbResults.find(r => r.link.includes("facebook.com"));
    if (facebookUrl) {
        bestUrl = facebookUrl.link;
    }
    else {
        const generalResults = await (0, browser_searcher_1.performBrowserSearch)(baseQuery);
        bestUrl = findBestUrl(generalResults);
    }
    if (!bestUrl) {
        console.log(`[Contact-Enricher] Nie znaleziono żadnego URL do dalszej analizy dla firmy ${baseQuery}.`);
        return enrichedFirm;
    }
    const cleanedUrl = bestUrl.replace(/ › /g, '/');
    console.log(`[Contact-Enricher] Wybrano link do scrapowania: ${cleanedUrl}`);
    const newContactDetails = await (0, contact_scraper_1.scrapeContactDetails)(cleanedUrl);
    enrichedFirm.contactDetails.emails.push(...newContactDetails.emails);
    enrichedFirm.contactDetails.phones.push(...newContactDetails.phones);
    enrichedFirm.contactDetails.emails = Array.from(new Set(enrichedFirm.contactDetails.emails));
    enrichedFirm.contactDetails.phones = Array.from(new Set(enrichedFirm.contactDetails.phones));
    return enrichedFirm;
}
async function enrichContacts(taskId, firms) {
    var _a;
    console.log(`[Contact-Enricher] Rozpoczynam wzbogacanie kontaktów dla ${firms.length} firm z limitem ${CONCURRENCY_LIMIT} naraz.`);
    const allEnrichedFirms = [];
    for (let i = 0; i < firms.length; i += CONCURRENCY_LIMIT) {
        const taskDoc = await firebase_init_1.db.collection("tasks").doc(taskId).get();
        if (['terminated', 'paused'].includes((_a = taskDoc.data()) === null || _a === void 0 ? void 0 : _a.status)) {
            console.log(`[Contact-Enricher] Przerwanie zadania ${taskId} na żądanie (przed paczką).`);
            break;
        }
        const batch = firms.slice(i, i + CONCURRENCY_LIMIT);
        console.log(`[Contact-Enricher] Przetwarzam paczkę ${i / CONCURRENCY_LIMIT + 1}... Firmy: ${batch.map(f => f.companyName).join(', ')}`);
        const promises = batch.map(firm => enrichSingleFirm(firm, taskId));
        const batchResults = await Promise.all(promises);
        allEnrichedFirms.push(...batchResults);
    }
    console.log(`[Contact-Enricher] Zakończono proces wzbogacania.`);
    return allEnrichedFirms;
}
//# sourceMappingURL=contact-enricher.js.map