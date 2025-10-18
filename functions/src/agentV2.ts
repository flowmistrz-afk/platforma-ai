import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import cors from "cors";
import { SchemaType, FunctionDeclaration } from "@google-cloud/vertexai";
import { DocumentReference } from "firebase-admin/firestore";
import { db, vertex_ai } from "./firebase-init";

setGlobalOptions({ region: "europe-west1", secrets: ["GOOGLE_MAPS_API_KEY"] });

const corsHandler = cors({ origin: true });

// --- REAL API TOOL IMPLEMENTATIONS (using fetch) ---

async function execute_geocoding(city: string): Promise<any> {
  console.log(`[AGENT_V2_DEBUG] Rozpoczynam execute_geocoding dla miasta: "${city}"`);
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("[AGENT_V2_DEBUG] Klucz Google Maps API nie został znaleziony!");
    throw new Error("Google Maps API key not found.");
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.append("address", city);
  url.searchParams.append("key", apiKey);
  console.log(`[AGENT_V2_DEBUG] Wywołuję Geocoding API z URL: ${url.toString()}`);

  try {
    const response = await fetch(url.toString());
    const data = await response.json();
    console.log("[AGENT_V2_DEBUG] Otrzymano odpowiedź z Geocoding API:", JSON.stringify(data, null, 2));

    if (data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      console.log(`[AGENT_V2_DEBUG] Sukces geokodowania. Znaleziono lokalizację:`, location);
      return { success: true, location: location };
    }
    console.warn("[AGENT_V2_DEBUG] Geokodowanie nie powiodło się lub nie zwróciło wyników.", data.error_message);
    return { success: false, error: data.error_message || "Nie znaleziono współrzędnych dla podanego miasta." };
  } catch (error) {
    console.error("[AGENT_V2_DEBUG] Krytyczny błąd w execute_geocoding:", error);
    return { success: false, error: "Błąd podczas wywołania Geocoding API." };
  }
}

async function execute_places_search(query: string, location?: { lat: number, lng: number }, radiusInKm?: number): Promise<any> {
  console.log(`[AGENT_V2_DEBUG] Rozpoczynam execute_places_search z zapytaniem: "${query}"`);
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("[AGENT_V2_DEBUG] Klucz Google Maps API nie został znaleziony w execute_places_search!");
    throw new Error("Google Maps API key not found.");
  }

  const url = "https://places.googleapis.com/v1/places:searchText";
  const body: any = { textQuery: query.substring(0, 250) };

  if (location) {
    const radiusInMeters = radiusInKm ? radiusInKm * 1000 : 50000.0;
    body.locationBias = {
      circle: {
        center: { latitude: location.lat, longitude: location.lng },
        radius: radiusInMeters,
      },
    };
    console.log(`[AGENT_V2_DEBUG] Dodano locationBias: lat=${location.lat}, lng=${location.lng}, radius=${radiusInMeters}m`);
  }

  console.log(`[AGENT_V2_DEBUG] Wywołuję Places API z URL: ${url} i body:`, JSON.stringify(body, null, 2));

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.internationalPhoneNumber",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    console.log("[AGENT_V2_DEBUG] Otrzymano odpowiedź z Places API:", JSON.stringify(data, null, 2));

    if (data.error) {
        console.error("[AGENT_V2_DEBUG] Places API zwróciło błąd:", data.error);
        return { success: false, error: data.error.message || "Unknown Places API Error" };
    }
    console.log(`[AGENT_V2_DEBUG] Sukces Places API. Znaleziono ${data.places?.length || 0} miejsc.`);
    return { success: true, places: data.places || [] };
  } catch (error) {
    console.error("[AGENT_V2_DEBUG] Krytyczny błąd w execute_places_search:", error);
    return { success: false, error: "Błąd podczas wywołania Places API (New)." };
  }
}

// --- AGENT LOGIC ---

export async function runAgent2Logic(data: any, taskRef: DocumentReference) {
    console.log("[AGENT_V2_DEBUG] Uruchomiono runAgent2Logic z danymi:", data);
    const { keywords, city, radius } = data || {};

    try {
      await taskRef.update({
        logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: "Agent v2 (z prawdziwymi narzędziami) rozpoczyna pracę..." })
      });

      const geocodeTool: FunctionDeclaration = {
        name: "geocode_city",
        description: "Pobiera współrzędne geograficzne (latitude, longitude) dla nazwy miasta.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            city: { type: SchemaType.STRING, description: "Nazwa miasta, np. 'Warszawa'" },
          },
          required: ["city"],
        },
      };

      const placesTool: FunctionDeclaration = {
        name: "places_text_search",
        description: "Wyszukuje firmy i miejsca na podstawie zapytania tekstowego. Może być zawężone do konkretnej lokalizacji i promienia.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: { type: SchemaType.STRING, description: "Zapytanie, np. 'firmy budowlane' lub 'sklep hydrauliczny'" },
            location: { type: SchemaType.OBJECT, properties: { lat: {type: SchemaType.NUMBER}, lng: {type: SchemaType.NUMBER} }, description: "Współrzędne geograficzne do zawężenia wyszukiwania." },
            radiusInKm: { type: SchemaType.NUMBER, description: "Promień wyszukiwania w kilometrach." },
          },
          required: ["query"],
        },
      };

      const tools = [{ functionDeclarations: [geocodeTool, placesTool] }];
      console.log("[AGENT_V2_DEBUG] Zdefiniowano narzędzia:", JSON.stringify(tools, null, 2));

      const generativeModelWithTools = vertex_ai.getGenerativeModel({
        model: "gemini-2.5-pro", // Użycie wskazanego modelu
        tools: tools,
      });

      const chat = generativeModelWithTools.startChat();
      const prompt = `Jesteś agentem AI, Twoim zadaniem jest znalezienie firm budowlanych w Polsce.\n      Oto zapytanie użytkownika:\n      - Miasto: ${city}\n      - Promień wyszukiwania: ${radius} km\n      - Słowa kluczowe opisujące usługę: ${keywords.join(", ")}\n\n      Twoje zadanie:\n      1. **KROK 1: Geokodowanie.** Użyj narzędzia 'geocode_city', aby znaleźć współrzędne dla miasta: ${city}.\n      2. **KROK 2: Wyszukiwanie.** Użyj narzędzia 'places_text_search'. Jako 'query' użyj kombinacji słów kluczowych i miasta. Jako 'location' podaj współrzędne uzyskane w kroku 1. Jako 'radiusInKm' użyj promienia ${radius}.\n      3. **KROK 3: Analiza i Raport.** Przeanalizuj wyniki. Zwróć ostateczną listę 5-10 najlepszych znalezionych firm w formacie JSON. Użyj DOKŁADNIE następującego schematu dla każdego obiektu w tablicy: {\"nazwa\": \"string\", \"adres\": \"string\", \"telefon\": \"string | null\", \"website\": \"string | null\", \"ocena\": \"number | null\", \"liczba_opinii\": \"number | null\"}. Całość opakuj w blok markdown \n\`\`\`json ... \n\`\`\`. Zwróć tylko i wyłącznie ten blok.`;
      console.log("[AGENT_V2_DEBUG] Wygenerowano prompt dla AI:", prompt);

      await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Rozpoczynam sesję z AI...` }) });

      console.log("[AGENT_V2_DEBUG] Wysyłam pierwszą wiadomość do AI...");
      let result = await chat.sendMessage(prompt);
      console.log("[AGENT_V2_DEBUG] Otrzymano pierwszą odpowiedź od AI:", JSON.stringify(result, null, 2));

      for (let i = 0; i < 5; i++) {
        console.log(`[AGENT_V2_DEBUG] Pętla narzędzi, iteracja ${i + 1}`);
        const functionCalls = result.response.candidates?.[0]?.content?.parts?.filter(part => part.functionCall);
        if (!functionCalls || functionCalls.length === 0) {
          console.log("[AGENT_V2_DEBUG] AI nie wywołało żadnego narzędzia. Przerywam pętlę.");
          break;
        }
        console.log("[AGENT_V2_DEBUG] AI wywołało narzędzia:", JSON.stringify(functionCalls, null, 2));

        const apiResponses = [];
        for (const call of functionCalls) {
            if (call.functionCall?.name === "geocode_city") {
                const cityArg = (call.functionCall.args as any)['city'] as string;
                await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `AI prosi o geokodowanie miasta: "${cityArg}"` }) });
                const apiResponse = await execute_geocoding(cityArg);
                apiResponses.push({ functionResponse: { name: "geocode_city", response: apiResponse } });
            }
            else if (call.functionCall?.name === "places_text_search") {
                const queryArg = (call.functionCall.args as any)['query'] as string;
                const locationArg = (call.functionCall.args as any)['location'];
                const radiusArg = (call.functionCall.args as any)['radiusInKm'];
                await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `AI prosi o wyszukanie w Places API: "${queryArg}"` }) });
                const apiResponse = await execute_places_search(queryArg, locationArg, radiusArg);
                apiResponses.push({ functionResponse: { name: "places_text_search", response: apiResponse } });
            }
        }
        
        console.log("[AGENT_V2_DEBUG] Wysyłam odpowiedzi z narzędzi do AI:", JSON.stringify(apiResponses, null, 2));
        result = await chat.sendMessage(apiResponses);
        console.log("[AGENT_V2_DEBUG] Otrzymano kolejną odpowiedź od AI:", JSON.stringify(result, null, 2));
      }

      const finalResponseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
      console.log("[AGENT_V2_DEBUG] Finalna odpowiedź tekstowa od AI:", finalResponseText);
      await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `AI zakończyło pracę i zwróciło ostateczny raport.` }) });
      
      if (!finalResponseText) {
          console.error("[AGENT_V2_DEBUG] AI nie zwróciło finalnej odpowiedzi tekstowej.");
          throw new Error("AI nie zwróciło ostatecznego raportu tekstowego.");
      }

      let finalResults = [];
      try {
          console.log("[AGENT_V2_DEBUG] Próbuję parsować JSON z finalnej odpowiedzi...");
          const jsonMatch = finalResponseText.match(/```json\n([\s\S]*?)\n```/);
          let jsonString = null;

          if (jsonMatch && jsonMatch[1]) {
              jsonString = jsonMatch[1];
          } else {
              const rawJsonMatch = finalResponseText.match(/(\[[\s\S]*\])/);
              if (rawJsonMatch && rawJsonMatch[0]) {
                  jsonString = rawJsonMatch[0];
              }
          }

          if (jsonString) {
              console.log("[AGENT_V2_DEBUG] Znaleziono i wyodrębniono JSON:", jsonString);
              finalResults = JSON.parse(jsonString);
          } else {
              console.warn("[AGENT_V2_DEBUG] Nie znaleziono bloku JSON w odpowiedzi AI.");
              throw new Error("Nie znaleziono formatu JSON w odpowiedzi AI.");
          }
      } catch(e) {
          const err = e as Error;
          console.error("[AGENT_V2_DEBUG] Krytyczny błąd parsowania JSON:", err);
          await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Błąd parsowania JSON z odpowiedzi AI: ${err.message}` }) });
          throw e;
      }

      await taskRef.update({
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        results: finalResults,
        logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Zakończono. Agent v2 (real) znalazł ${finalResults.length} pasujących podwykonawców.` }),
      });

    } catch (error) {
      const err = error as Error;
      console.error("[AGENT_V2_DEBUG] Krytyczny błąd w runAgent2Logic:", err, err.stack);
      await taskRef.update({ status: "failed", error: err.message });
    }
}

export const agent2_searchWithTools = onRequest({ secrets: ["GOOGLE_MAPS_API_KEY"] }, async (request, response) => {
  corsHandler(request, response, async () => {
    const idToken = request.headers.authorization?.split("Bearer ")[1];
    if (!idToken) {
      response.status(401).send("Unauthorized");
      return;
    }
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      response.status(401).send("Unauthorized");
      return;
    }

    const uid = decodedToken.uid;
    const data = request.body;
    const { keywords, city } = data || {};

    if (!keywords || !city) {
      response.status(400).json({ error: "Pola 'keywords' i 'city' są wymagane." });
      return;
    }

    const taskRef = db.collection("agent_tasks").doc();
    response.json({ data: { success: true, taskId: taskRef.id } });

    await taskRef.set({
        ownerUid: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "processing",
        query: data,
        logs: [{ timestamp: new Date(), message: "Zlecenie przyjęte. Uruchamiam Agenta v2..." }],
        results: [],
      });

    runAgent2Logic(data, taskRef);
  });
});
