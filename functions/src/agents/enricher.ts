import { vertex_ai } from "../firebase-init";
import { Task } from "../types";
import pkdData from '../data/pkd-database.json';

// Definicja typu dla wyniku, aby utrzymać spójność
export interface EnrichedQuery {
  identifiedService: string;
  keywords: string[];
  pkdCodes: string[];
}

/**
 * Uruchamia Agenta Wzbogacającego Zapytanie.
 * Analizuje zapytanie użytkownika, aby wyodrębnić usługę, słowa kluczowe i kody PKD z lokalnej bazy danych.
 * @param taskData Pełny obiekt zadania, zawierający zapytanie i wybraną sekcję PKD.
 * @returns Obiekt z wzbogaconymi danymi.
 */
export async function runEnricher(taskId: string, taskData: Task): Promise<any> {
  const generativeModel = vertex_ai.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const { initialQuery, selectedPkdSection } = taskData.query;

  // Przygotowanie listy kodów PKD na podstawie wybranej sekcji
  let availablePkdCodes: { kod: string; nazwa: string; }[] = [];
  if (selectedPkdSection && selectedPkdSection !== '') {
    const section = pkdData.find(s => s.kod === selectedPkdSection);
    if (section && section.podklasy) {
      availablePkdCodes = section.podklasy;
    }
  } else {
    // Jeśli brak wybranej sekcji, użyj wszystkich kodów ze wszystkich sekcji
    pkdData.forEach(section => {
      if(section.podklasy) {
        availablePkdCodes.push(...section.podklasy);
      }
    });
  }

  const pkdListForPrompt = availablePkdCodes.map(p => `${p.kod} - ${p.nazwa}`).join('\n');

  const prompt = `Jesteś światowej klasy ekspertem w polskiej gospodarce i specjalistą od marketingu internetowego. Twoim zadaniem jest przeanalizowanie zapytania użytkownika, zidentyfikowanie głównej usługi, a następnie dobranie do niej słów kluczowych i KODÓW PKD z dostarczonej listy.\n\n**Oryginalne zapytanie użytkownika:** "${initialQuery}"\n\n**DOSTĘPNA LISTA KODÓW PKD:**\n---\n${pkdListForPrompt}\n---\n\n**Zadania do wykonania:**\n1.  **Identyfikacja Usługi:** Zidentyfikuj i wyodrębnij jedną, główną usługę z zapytania użytkownika (ignorując lokalizację).\n2.  **Generowanie Kluczowych Fraz:** Wygeneruj listę 8-12 unikalnych, profesjonalnych fraz i słów kluczowych, które opisują zidentyfikowaną usługę.\n3.  **Dobór Kodów PKD:** Zidentyfikuj od 1 do 3 kodów PKD, które NAJLEPIEJ pasują do zapytania użytkownika, **WYBIERAJĄC JE WYŁĄCZNIE Z POWYŻSZEJ LISTY DOSTĘPNYCH KODÓW PKD**.\n\nZwróć wynik wyłącznie w formacie JSON, bez żadnych dodatkowych komentarzy i formatowania markdown. Struktura JSON musi być następująca:\n{\n  "identifiedService": "Główna usługa wyodrębniona z zapytania",\n  "keywords": ["fraza_1", "fraza_2", "fraza_3", "..."],
  "pkdCodes": ["kod_pkd_1_z_listy", "kod_pkd_2_z_listy", "..."]\n}\n`;

  try {
    const result = await generativeModel.generateContent(prompt);
    const response = result.response;
    const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      throw new Error("Otrzymano pustą odpowiedź od AI.");
    }

    const jsonMatch = responseText.match(/{[\s\S]*}/);
    if (!jsonMatch || !jsonMatch[0]) {
      console.error("Could not find a JSON object in the AI response.", responseText);
      throw new Error("Nie znaleziono obiektu JSON w odpowiedzi AI.");
    }
    
    const extractedJSON = jsonMatch[0];

    try {
      const parsedResult = JSON.parse(extractedJSON) as EnrichedQuery;

      // Weryfikacja po stronie serwera, aby upewnić się, że AI nie zignorowało polecenia
      const allowedCodes = new Set(availablePkdCodes.map(p => p.kod));
      const verifiedCodes = (parsedResult.pkdCodes || []).filter(code => allowedCodes.has(code));
      
      parsedResult.pkdCodes = verifiedCodes;

      return parsedResult;
    } catch (e) {
      console.error("Błąd parsowania JSON:", e, "Otrzymany tekst:", extractedJSON);
      throw new Error("Błąd parsowania odpowiedzi JSON od AI.");
    }
  } catch (error) {
    console.error("Błąd podczas komunikacji z Vertex AI:", error);
    throw new Error("Błąd podczas generowania sugestii przez AI.");
  }
}
