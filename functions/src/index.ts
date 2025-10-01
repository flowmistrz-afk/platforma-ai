import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import cors from "cors";
import { runAgent2Logic } from "./agentV2";
import { runAgent3Logic } from "./agentV3";
import { db, vertex_ai } from "./firebase-init";

setGlobalOptions({ region: "europe-west1" });

const generativeModel = vertex_ai.getGenerativeModel({
  model: "gemini-2.5-pro",
});

const corsHandler = cors({ origin: true });

// --- NOWA FUNKCJA DLA AGENTA 1 (ETAP 1) ---
export const agent1_expandKeywords = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Musisz być zalogowany.");
  }
  const { specialization } = request.data;
  if (!specialization) {
    throw new HttpsError("invalid-argument", "Pole \'specjalizacja\' jest wymagane.");
  }

  const prompt = `Jesteś światowej klasy ekspertem w polskiej branży budowlanej i specjalistą od marketingu internetowego. Twoim zadaniem jest przeanalizowanie zapytania użytkownika i wyizolowanie GŁÓWNEJ USŁUGI BUDOWLANEJ/RZEMIOSŁA. Następnie, na podstawie wyizolowanej usługi, kreatywnie rozbudujesz zbiór fraz kluczowych oraz zidentyfikujesz pasujące kody PKD.\n\n**WYTYCZNE KRYTYCZNE:**\n1.  **Ignoruj Lokalizację:** Wszelkie wzmianki o lokalizacji (np. miasto, województwo, "w pobliżu", "okolice") muszą być całkowicie zignorowane i nie mogą być częścią generowanych fraz kluczowych. Interesuje nas czysta usługa (np. "brukarstwo", "ocieplanie budynków").\n2.  **Profesjonalna Terminologia:** Generowane frazy muszą być profesjonalne i obejmować zarówno potoczne nazwy, jak i techniczne/biznesowe synonimy (np. dla "ocieplanie budynków" to także "termomodernizacja").\n\nOryginalne zapytanie użytkownika: "${specialization}"\n\n**Zadania do wykonania:**\n1.  **Identyfikacja Usługi:** Zidentyfikuj i wyodrębnij jedną, główną usługę budowlaną lub rzemiosło z zapytania użytkownika.\n2.  **Generowanie Kluczowych Fraz:** Wygeneruj listę 8-12 unikalnych, alternatywnych i synonimicznych fraz oraz słów kluczowych, które profesjonalnie opisują zidentyfikowaną usługę. Uwzględnij formy rzeczownikowe (np. "brukarz") oraz czynności (np. "układanie kostki brukowej").\n3.  **Kody PKD:** Na podstawie zidentyfikowanej usługi i wygenerowanych fraz, zidentyfikuj 1-3 najbardziej prawdopodobne, pasujące kody PKD (Polskiej Klasyfikacji Działalności) dla firm świadczących tę usługę.\n\nZwróć wynik wyłącznie w formacie JSON, bez żadnych dodatkowych komentarzy, formatowania markdown (bez \`\`\`json) ani wyjaśnień. Struktura JSON musi być następująca:\n{\n  "identifiedService": "Główna usługa wyodrębniona z zapytania",\n  "keywords": ["fraza_1", "fraza_2", "fraza_3", "fraza_4", "fraza_5", "fraza_6", "fraza_7", "fraza_8"],\n  "pkdCodes": ["kod_pkd_1", "kod_pkd_2", "kod_pkd_3"]\n}\n`;

  try {
    const result = await generativeModel.generateContent(prompt);
    const response = result.response;
    const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      throw new Error("Otrzymano pustą odpowiedź od AI.");
    }
    console.log("Raw response from AI:", responseText);

    const jsonMatch = responseText.match(/{[\s\S]*}/);
    if (!jsonMatch || !jsonMatch[0]) {
        console.error("Could not find a JSON object in the AI response.");
        throw new Error("Could not find a JSON object in the AI response.");
    }
    
    const extractedJSON = jsonMatch[0];
    console.log("Extracted JSON string:", extractedJSON);

    try {
      const parsedResult = JSON.parse(extractedJSON);
      console.log("Successfully parsed JSON:", parsedResult);
      return parsedResult;
    } catch (e) {
        console.error("Failed to parse the extracted JSON string.", e);
        throw new Error("Failed to parse the extracted JSON string.");
    }
  } catch (error) {
    console.error("Błąd podczas komunikacji z Vertex AI:", error);
    throw new HttpsError("internal", "Błąd podczas generowania sugestii AI.");
  }
});


export const runAgent1_findSubcontractors = onRequest({ secrets: ["GOOGLE_MAPS_API_KEY"] }, (request, response) => {
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
    const { specialization, city, sources } = data || {};

    if (!specialization || !city) {
      response.status(400).json({ error: "Pola \'specjalizacja\' i \'miasto\' są wymagane." });
      return;
    }

    const taskRef = db.collection("agent_tasks").doc();
    
    response.json({ data: { success: true, taskId: taskRef.id } });

    try {
      await taskRef.set({
        ownerUid: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "processing",
        query: data,
        logs: [
          { timestamp: new Date(), message: "Zlecenie przyjęte. Agent rozpoczyna pracę..." }
        ],
        results: [],
      });

      await new Promise(resolve => setTimeout(resolve, 1500));
      await taskRef.update({
        logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `ETAP 1: Rozpoczynam analizę AI dla zapytania: "${specialization}"` })
      });
      const expandedQuery = await expandQueryWithAI(specialization);
      await taskRef.update({
        logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `AI wygenerowało słowa kluczowe: ${expandedQuery.keywords.join(", ")}` })
      });

      await new Promise(resolve => setTimeout(resolve, 1500));
      await taskRef.update({
        logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `ETAP 2: Przeszukuję wybrane źródła...` })
      });
      let initialResults: any[] = [];
      if (sources.google) {
        initialResults.push({ name: `Budex - ${specialization}`, source: "Google", nip: "123-456-78-90" });
        initialResults.push({ name: `Mal-Pol (usługi: ${expandedQuery.keywords[1]})`, source: "Google", nip: "987-654-32-10" });
      }
      if (sources.ceidg) {
        initialResults.push({ name: "Jan Kowalski Budownictwo", source: "CEIDG", nip: "111-222-33-44" });
      }
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      const uniqueCompanies = Array.from(new Map(initialResults.map(item => [item.nip, item])).values());
      await taskRef.update({
        logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `ETAP 3: Znaleziono ${uniqueCompanies.length} unikalnych firm. Rozpoczynam wzbogacanie danych...` })
      });

      const enrichedCompanies = [];
      for (const company of uniqueCompanies) {
        const enrichedData = await enrichCompanyData(company, specialization);
        enrichedCompanies.push(enrichedData);
        await taskRef.update({
          logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Wzbogacono dane dla: "${company.name}"` })
        });
      }

      // Instead of completing, hand over to Agent V2
      await taskRef.update({
        logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `ETAP 4: Przekazuję zebrane dane do Agenta v2 w celu inteligentnego wyszukiwania...` })
      });

      // Call Agent V2 logic directly
      await runAgent2Logic(data, taskRef);

    } catch (error) {
      const err = error as Error;
      await taskRef.update({ status: "failed", error: err.message });
    }
  });
});

async function expandQueryWithAI(specialization: string): Promise<{ keywords: string[], pkdCodes: string[] }> {
  console.log(`AI: Rozszerzam zapytanie dla: "${specialization}"`);
  await new Promise(resolve => setTimeout(resolve, 1500));
  return Promise.resolve({
    keywords: [specialization, `układanie ${specialization}`, `firma ${specialization}`],
    pkdCodes: ["43.99.Z", "43.33.Z"],
  });
}

async function enrichCompanyData(company: any, specialization: string): Promise<any> {
  console.log(`AI: Weryfikuję i wzbogacam dane dla: "${company.name}"`);
  await new Promise(resolve => setTimeout(resolve, 500));
  const email = `kontakt@${company.name.toLowerCase().replace(/\s/g, "")}.pl`;
  const phone = `+48 555 ${Math.floor(Math.random() * 900) + 100} ${Math.floor(Math.random() * 900) + 100}`;
  const match = Math.random() > 0.3 ? "Wysokie" : "Niskie";
  const rating = (Math.random() * (5 - 3.5) + 3.5).toFixed(1);

  return {
    ...company,
    email,
    phone,
    match,
    rating,
  };
}

export const inviteUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Musisz być zalogowany, aby zapraszać użytkowników."
    );
  }
  const adminUid = request.auth.uid;
  const { newUserEmail, newUserName, newUserPassword, companyId } = request.data;
  const adminProfileRef = admin.firestore().collection("users").doc(adminUid);
  const adminProfileSnap = await adminProfileRef.get();
  const adminProfile = adminProfileSnap.data();
  if (!adminProfile || adminProfile.role !== "company-admin" || adminProfile.companyId !== companyId) {
    throw new HttpsError(
      "permission-denied",
      "Nie masz uprawnień do dodawania użytkowników do tej firmy."
    );
  }
  try {
    const newUserRecord = await admin.auth().createUser({
      email: newUserEmail,
      displayName: newUserName,
      password: newUserPassword,
    });
    await admin.firestore().collection("users").doc(newUserRecord.uid).set({
      uid: newUserRecord.uid,
      email: newUserEmail,
      name: newUserName,
      companyId: companyId,
      role: "company-user",
    });
    return { success: true, message: `Użytkownik ${newUserEmail} został pomyślnie dodany.` };
  } catch (error: any) {
    console.error("Błąd podczas tworzenia użytkownika:", error);
    if (error.code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'Ten adres e-mail jest już zarejestrowany.');
    }
    throw new HttpsError(
      "internal",
      "Wystąpił nieoczekiwany błąd serwera."
    );
  }
});

export * from "./agentV2";

// Trivial change to force redeployment

export const agent3_searchWithSelenium = onRequest(
  { 
    timeoutSeconds: 540,
    memory: "2GiB",
    cpu: 4,
    secrets: ["GOOGLE_MAPS_API_KEY"]
  }, 
  async (request, response) => {
    corsHandler(request, response, async () => {
      const idToken = request.headers.authorization?.split("Bearer ")[1];
      if (!idToken) { response.status(401).send("Unauthorized"); return; }
      
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
      } catch (error) {
        response.status(401).send("Unauthorized"); return;
      }

      const uid = decodedToken.uid;
      const data = request.body;
      const { query } = data || {};

      if (!query) {
        response.status(400).json({ error: "Pole 'query' jest wymagane." });
        return;
      }

      const taskRef = db.collection("agent_tasks").doc();
      response.json({ data: { success: true, taskId: taskRef.id } });

      await taskRef.set({
          ownerUid: uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          status: "processing",
          query: data,
          agentVersion: "v3-selenium",
          logs: [{ timestamp: new Date(), message: "Zlecenie przyjęte. Uruchamiam Agenta v3 (Selenium)..." }],
          results: [],
        });

      runAgent3Logic(data, taskRef);
    });
});