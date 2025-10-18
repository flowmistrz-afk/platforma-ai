import { Task } from "../types";
import { db, vertex_ai } from '../firebase-init';

// Definicja typu dla pojedynczego wyniku wyszukiwania
export interface SearchResult {
  link: string;
  title: string;
  snippet: string;
}

async function filterLinksWithAI(query: Task['query'], searchResults: SearchResult[]): Promise<SearchResult[]> {
  if (!searchResults || searchResults.length === 0) {
    return [];
  }

  const generativeModel = vertex_ai.getGenerativeModel({ model: "gemini-2.5-flash" });

  const linksToFilter = searchResults.map(r => `{"link": "${r.link}", "title": "${r.title}", "snippet": "${r.snippet}"}`).join("\n");

  const prompt = `Jesteś analitykiem danych specjalizującym się w ocenie wyników wyszukiwania. Twoim zadaniem jest przeanalizowanie poniższej listy linków (w formacie JSONL) w kontekście zapytania użytkownika i odfiltrowanie tylko tych, które z dużym prawdopodobieństwem są stroną firmy świadczącej usługi lub portalem zbierającym oferty.

**Kontekst zapytania użytkownika:**
- Usługa: "${query.identifiedService || query.initialQuery}"

**Kryteria Oceny:**
- **ZACHOWAJ:** Linki, których tytuł lub opis wskazują na konkretną firmę, ofertę, usługi, kontakt, portfolio (np. "Jan Kowalski - Usługi Budowlane", "Oferteo - znajdź wykonawcę", "Cennik - Firma X").
- **ODRZUĆ:** Linki prowadzące do artykułów, wiadomości, postów na forach, stron informacyjnych, wpisów na blogach, stron urzędowych, definicji słownikowych (np. "Jak wybrać firmę?", "Remont ulicy w Dębicy - Wiadomości", "Forum budowlane - opinie", "Wikipedia: Asfalt").

**Lista linków do odfiltrowania (format JSONL):**
${linksToFilter}

Zwróć **wyłącznie** przefiltrowaną listę linków w tym samym formacie JSONL, bez żadnych dodatkowych wyjaśnień, komentarzy ani formatowania markdown. Zwróć tylko te linki, które zostały zakwalifikowane do zachowania.`

  try {
    const result = await generativeModel.generateContent(prompt);
    const response = result.response;
    const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      console.warn("[Searcher-Filter] Otrzymano pustą odpowiedź od AI. Zwracam oryginalną listę.");
      return searchResults;
    }

    const filteredLinks: SearchResult[] = responseText
      .trim()
      .split('\n')
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          console.warn("[Searcher-Filter] Błąd parsowania linii JSON, pomijam:", line, e);
          return null;
        }
      })
      .filter((item): item is SearchResult => item !== null && !!item.link && !!item.title && !!item.snippet);

    return filteredLinks;

  } catch (error) {
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
export async function runGoogleSearch(taskId: string, query: Task['query']): Promise<{ title: string; link: string; snippet: string; }[]> {
  const apiKey = process.env.SEARCH_API_KEY;
  const searchEngineId = process.env.SEARCH_ENGINE_CX;

  if (!apiKey || !searchEngineId) {
    throw new Error("Brak klucza API lub ID wyszukiwarki w zmiennych środowiskowych.");
  }

  if (!query.expandedKeywords || query.expandedKeywords.length === 0) {
    console.log("Brak rozszerzonych słów kluczowych, pomijam wyszukiwanie.");
    return [];
  }

  const allResults: SearchResult[] = [];
  const searchLocation = query.location?.city || '';

  // Pętla przez wszystkie wzbogacone słowa kluczowe
  for (const keyword of query.expandedKeywords) {
    const taskDoc = await db.collection("tasks").doc(taskId).get();
    if (['terminated', 'paused'].includes(taskDoc.data()?.status)) {
      console.log(`[Searcher] Przerwanie zadania ${taskId} na żądanie (status: ${taskDoc.data()?.status}).`);
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
        const results: SearchResult[] = data.items.map((item: any) => ({
          link: item.link,
          title: item.title,
          snippet: item.snippet,
        }));
        allResults.push(...results);
      }
    } catch (error) {
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
