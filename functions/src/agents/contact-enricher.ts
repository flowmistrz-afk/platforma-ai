import { ScrapedData } from "../types";
import { db } from "../firebase-init";
import { scrapeContactDetails } from "./contact-scraper";
import { performBrowserSearch, SearchResult } from "./browser-searcher";

const CONCURRENCY_LIMIT = 3; // Przetwarzaj maksymalnie 3 firmy jednocześnie

function findBestUrl(results: SearchResult[]): string | null {
  if (!results || results.length === 0) return null;
  const facebookResult = results.find(r => r && r.link && r.link.includes("facebook.com"));
  if (facebookResult && facebookResult.link) return facebookResult.link;
  const firstResult = results[0];
  if (firstResult && firstResult.link) return firstResult.link;
  return null;
}

async function enrichSingleFirm(firm: ScrapedData, taskId: string): Promise<ScrapedData> {
    const enrichedFirm = { ...firm, contactDetails: { ...firm.contactDetails, emails: [...firm.contactDetails.emails], phones: [...firm.contactDetails.phones] } };

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
    const taskDoc = await db.collection("tasks").doc(taskId).get();
    if (['terminated', 'paused'].includes(taskDoc.data()?.status)) {
      console.log(`[Contact-Enricher] Przerwanie zadania ${taskId} na żądanie (przed wyszukiwaniem).`);
      return enrichedFirm;
    }

    console.log(`[Contact-Enricher] Rozpoczynam pracę dla: ${baseQuery}`);
    let bestUrl: string | null = null;

    const fbQuery = `${baseQuery} facebook`;
    const fbResults = await performBrowserSearch(fbQuery);
    const facebookUrl = fbResults.find(r => r.link.includes("facebook.com"));

    if (facebookUrl) {
        bestUrl = facebookUrl.link;
    } else {
        const generalResults = await performBrowserSearch(baseQuery);
        bestUrl = findBestUrl(generalResults);
    }

    if (!bestUrl) {
        console.log(`[Contact-Enricher] Nie znaleziono żadnego URL do dalszej analizy dla firmy ${baseQuery}.`);
        return enrichedFirm;
    }

    const cleanedUrl = bestUrl.replace(/ › /g, '/');
    console.log(`[Contact-Enricher] Wybrano link do scrapowania: ${cleanedUrl}`);
    const newContactDetails = await scrapeContactDetails(cleanedUrl);
    
    enrichedFirm.contactDetails.emails.push(...newContactDetails.emails);
    enrichedFirm.contactDetails.phones.push(...newContactDetails.phones);

    enrichedFirm.contactDetails.emails = Array.from(new Set(enrichedFirm.contactDetails.emails));
    enrichedFirm.contactDetails.phones = Array.from(new Set(enrichedFirm.contactDetails.phones));

    return enrichedFirm;
}

export async function enrichContacts(taskId: string, firms: ScrapedData[]): Promise<ScrapedData[]> {
  console.log(`[Contact-Enricher] Rozpoczynam wzbogacanie kontaktów dla ${firms.length} firm z limitem ${CONCURRENCY_LIMIT} naraz.`);
  
  const allEnrichedFirms: ScrapedData[] = [];
  
  for (let i = 0; i < firms.length; i += CONCURRENCY_LIMIT) {
    const taskDoc = await db.collection("tasks").doc(taskId).get();
    if (['terminated', 'paused'].includes(taskDoc.data()?.status)) {
      console.log(`[Contact-Enricher] Przerwanie zadania ${taskId} na żądanie (przed paczką).`);
      break;
    }

    const batch = firms.slice(i, i + CONCURRENCY_LIMIT);
    console.log(`[Contact-Enricher] Przetwarzam paczkę ${i / CONCURRENCY_LIMIT + 1}... Firmy: ${batch.map(f=>f.companyName).join(', ')}`);
    
    const promises = batch.map(firm => enrichSingleFirm(firm, taskId));
    const batchResults = await Promise.all(promises);
    allEnrichedFirms.push(...batchResults);
  }

  console.log(`[Contact-Enricher] Zakończono proces wzbogacania.`);
  return allEnrichedFirms;
}