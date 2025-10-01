## /home/flowmistrz/platforma-ai/firestore.rules

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Reguły dla kolekcji 'companies'
    match /companies/{companyId} {
      // KTO MOŻE CZYTAĆ DANE O FIRMIE?
      // 1. Super Admin (może czytać dane wszystkich firm).
      // 2. LUB pracownik tej firmy (może czytać dane tylko swojej firmy).
      allow read: if request.auth != null && 
                    (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'super-admin' || 
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.companyId == companyId);
      
      // KTO MOŻE STWORZYĆ FIRMĘ?
      // Każdy zalogowany użytkownik może stworzyć nową firmę podczas rejestracji.
      allow create: if request.auth != null;

      // KTO MOŻE AKTUALIZOWAĆ DANE FIRMY? (np. listę włączonych agentów)
      // Tylko i wyłącznie Super Admin.
      allow update: if request.auth != null &&
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'super-admin';
      
      // Na razie nikt nie może usuwać firm z poziomu aplikacji.
      allow delete: if false;
    }

    // Reguły dla kolekcji 'users'
    match /users/{userId} {
      // KTO MOŻE CZYTAĆ DANE UŻYTKOWNIKÓW?
      // 1. Użytkownik może czytać SWÓJ WŁASNY profil.
      // 2. LUB Admin firmy może CZYTAĆ profile wszystkich pracowników SWOJEJ firmy.
      // 3. LUB Super Admin może czytać profile wszystkich użytkowników.
      allow read: if request.auth != null &&
                   (request.auth.uid == userId ||
                    (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'company-admin' &&
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.companyId == resource.data.companyId) ||
                    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'super-admin');
      
      // KTO MOŻE STWORZYĆ UŻYTKOWNIKA?
      // Każdy może stworzyć swój profil podczas rejestracji.
      // (Tworzenie sub-kont będzie obsługiwane przez bezpieczną Cloud Function).
      allow create: if true;

      // KTO MOŻE EDYTOWAĆ UŻYTKOWNIKA?
      // Na razie tylko użytkownik może edytować swój własny profil.
      allow update: if request.auth != null && request.auth.uid == userId;

      // Na razie nikt nie może usuwać użytkowników z poziomu aplikacji.
      allow delete: if false;
    }

    // Reguły dla zadań agentów
    match /agent_tasks/{taskId} {
      // Użytkownik może odczytać zadanie, jeśli jest zalogowany (tymczasowo dla testów)
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}

## /home/flowmistrz/platforma-ai/functions/src/agentV2.ts
```typescript
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import cors from "cors";
import { SchemaType } from "@google-cloud/vertexai";
import { DocumentReference } from "firebase-admin/firestore";
import { db, vertex_ai } from "./firebase-init";

setGlobalOptions({ region: "europe-west1" });

const corsHandler = cors({ origin: true });


// Mock function to simulate calling the Google Places API
async function execute_google_places_search(query: string): Promise<any> {
  console.log(`SIMULATING Google Places API call with query: "${query}"`);
  await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay

  const mockResults = [
    { name: "Bud-Rem-Stal S.A.", address: "ul. Przemysłowa 1, Kraków", phone: "+48 12 555 01 01", rating: 4.5 },
    { name: "Termo-System Sp. z o.o.", address: "ul. Ciepłownicza 54, Kraków", phone: "+48 12 555 02 02", rating: 4.8 },
    { name: "Nowoczesne Elewacje Kowalski", address: "ul. Fasadowa 8, Kraków", phone: "+48 12 555 03 03", rating: 4.2 },
  ];

  console.log(`SIMULATED API returned ${mockResults.length} results.`);
  return mockResults;
}

export async function runAgent2Logic(data: any, taskRef: DocumentReference) {
    const { keywords, city } = data || {};

    try {
      await taskRef.update({
        logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: "Agent v2 (z narzędziami) rozpoczyna pracę..." })
      });

      const tools = [{ 
        functionDeclarations: [
          {
            name: "google_places_search",
            description: "Wyszukuje firmy w podanej lokalizacji na podstawie zapytania. Używaj do znajdowania konkretnych usług budowlanych.",
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                query: {
                  type: SchemaType.STRING,
                  description: "Zapytanie do wyszukiwarki, np. 'firmy ocieplające budynki Kraków' lub 'usługi brukarskie Kraków'.",
                },
              },
              required: ["query"],
            },
          },
        ],
      }];

      const generativeModelWithTools = vertex_ai.getGenerativeModel({
model: "gemini-2.5-pro",
        tools: tools,
      });

      const chat = generativeModelWithTools.startChat();
      const prompt = `Jesteś agentem AI, Twoim zadaniem jest znalezienie firm budowlanych.
      Oto zapytanie użytkownika:
      - Miasto: ${city}
      - Słowa kluczowe opisujące usługę: ${keywords.join(", ")}

      Twoje zadanie:
      1. Użyj narzędzia 'google_places_search', aby znaleźć firmy pasujące do zapytania. Sformułuj jedno, najlepsze zapytanie.
      2. Po zebraniu wyników, przeanalizuj je.
      3. Zwróć ostateczną listę znalezionych firm w formacie JSON, bez żadnych dodatkowych komentarzy. Struktura JSON: [{"name": "nazwa firmy", "address": "adres", "phone": "telefon", "rating": "ocena"}]. Zwróć tylko i wyłącznie JSON.`;

      await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Rozpoczynam sesję z AI...` }) });

      const result1 = await chat.sendMessage(prompt);
      const response1 = result1.response;

      const functionCall = response1.candidates?.[0]?.content?.parts?.find(part => part.functionCall)?.functionCall;

      if (functionCall?.name === "google_places_search") {
        const query = (functionCall.args as any)['query'] as string;
        await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `AI zdecydowało się użyć narzędzia z zapytaniem: "${query}"` }) });

        const apiResponse = await execute_google_places_search(query);
        await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Otrzymano ${apiResponse.length} wyników z (symulowanego) API.` }) });

        const result2 = await chat.sendMessage(
          [{ functionResponse: { name: "google_places_search", response: { content: apiResponse } } }]
        );

        const finalResponseText = result2.response.candidates?.[0]?.content?.parts?.[0]?.text;
        await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `AI zakończyło pracę i zwróciło ostateczny raport.` }) });
        
        if (!finalResponseText) {
            throw new Error("AI nie zwróciło ostatecznego raportu po wykonaniu narzędzia.");
        }

        let finalResults = [];
        try {
            const rawJsonMatch = finalResponseText.match(/(\[[\s\S]*\])/);
            if (rawJsonMatch && rawJsonMatch[0]) {
                finalResults = JSON.parse(rawJsonMatch[0]);
            } else {
                 throw new Error("Nie znaleziono formatu JSON w odpowiedzi AI.");
            }
        } catch(e) {
            const err = e as Error;
            await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Błąd parsowania JSON z odpowiedzi AI: ${err.message}` }) });
            throw e;
        }

        await taskRef.update({
          status: "completed",
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          results: finalResults,
          logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Zakończono. Agent v2 znalazł ${finalResults.length} pasujących podwykonawców.` }),
        });

      } else {
        await taskRef.update({ logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: "AI nie zdecydowało się na użycie narzędzia. Zakończono." }) });
        const fallbackText = response1.candidates?.[0]?.content?.parts?.[0]?.text || "Brak odpowiedzi tekstowej.";
        await taskRef.update({ status: "failed", error: "AI nie wywołało narzędzia.", results: [{fallbackText}] });
      }
    } catch (error) {
      const err = error as Error;
      console.error("Błąd w agent2_searchWithTools:", err);
      await taskRef.update({ status: "failed", error: err.message });
    }
}

export const agent2_searchWithTools = onRequest(async (request, response) => {
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

    // Wywołaj główną logikę agenta w tle
    runAgent2Logic(data, taskRef);
  });
});
```

## /home/flowmistrz/platforma-ai/functions/src/firebase-init.ts
```typescript
import * as admin from "firebase-admin";
import { VertexAI } from "@google-cloud/vertexai";

admin.initializeApp();

export const db = admin.firestore();
export const vertex_ai = new VertexAI({ project: "automatyzacja-pesamu", location: "europe-west4" });
```

## /home/flowmistrz/platforma-ai/functions/src/index.ts
```typescript
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import cors from "cors";
import { runAgent2Logic } from "./agentV2";
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

  const prompt = `Jesteś światowej klasy ekspertem w polskiej branży budowlanej i specjalistą od marketingu internetowego. Twoim zadaniem jest przeanalizowanie zapytania użytkownika i wyizolowanie GŁÓWNEJ USŁUGI BUDOWLANEJ/RZEMIOSŁA. Następnie, na podstawie wyizolowanej usługi, kreatywnie rozbudujesz zbiór fraz kluczowych oraz zidentyfikujesz pasujące kody PKD.

**WYTYCZNE KRYTYCZNE:**
1.  **Ignoruj Lokalizację:** Wszelkie wzmianki o lokalizacji (np. miasto, województwo, "w pobliżu", "okolice") muszą być całkowicie zignorowane i nie mogą być częścią generowanych fraz kluczowych. Interesuje nas czysta usługa (np. "brukarstwo", "ocieplanie budynków").
2.  **Profesjonalna Terminologia:** Generowane frazy muszą być profesjonalne i obejmować zarówno potoczne nazwy, jak i techniczne/biznesowe synonimy (np. dla "ocieplanie budynków" to także "termomodernizacja").

Oryginalne zapytanie użytkownika: "${specialization}"

**Zadania do wykonania:**
1.  **Identyfikacja Usługi:** Zidentyfikuj i wyodrębnij jedną, główną usługę budowlaną lub rzemiosło z zapytania użytkownika.
2.  **Generowanie Kluczowych Fraz:** Wygeneruj listę 8-12 unikalnych, alternatywnych i synonimicznych fraz oraz słów kluczowych, które profesjonalnie opisują zidentyfikowaną usługę. Uwzględnij formy rzeczownikowe (np. "brukarz") oraz czynności (np. "układanie kostki brukowej").
3.  **Kody PKD:** Na podstawie zidentyfikowanej usługi i wygenerowanych fraz, zidentyfikuj 1-3 najbardziej prawdopodobne, pasujące kody PKD (Polskiej Klasyfikacji Działalności) dla firm świadczących tę usługę.

Zwróć wynik wyłącznie w formacie JSON, bez żadnych dodatkowych komentarzy, formatowania markdown (bez \`\`\`json) ani wyjaśnień. Struktura JSON musi być następująca:
{
  "identifiedService": "Główna usługa wyodrębniona z zapytania",
  "keywords": ["fraza_1", "fraza_2", "fraza_3", "fraza_4", "fraza_5", "fraza_6", "fraza_7", "fraza_8"],
  "pkdCodes": ["kod_pkd_1", "kod_pkd_2", "kod_pkd_3"]
}
`;

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


export const runAgent1_findSubcontractors = onRequest((request, response) => {
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
// Zmiana, aby wymusić wdrożenie
export * from "./agentV2";
```

## /home/flowmistrz/platforma-ai/src/App.tsx
```typescript
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Container } from 'react-bootstrap';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Header from './components/Header';
import ProtectedRoute from './components/ProtectedRoute';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import TeamManagementPage from './pages/TeamManagementPage';
import { useAuth } from './hooks/useAuth';
import LoadingSpinner from './components/LoadingSpinner';
import AgentsListPage from './pages/AgentsListPage';
import Agent1RunPage from './pages/Agent1RunPage';
import Agent1ResultsPage from './pages/Agent1ResultsPage';
import AgentV2Runner from './components/agent/AgentV2Runner';

function App() {
  const { userProfile, loading } = useAuth();

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <>
      <Header />
      <main className="py-4">
        <Container>
          <Routes>
            <Route path="/login" element={!userProfile ? <LoginPage /> : <Navigate to="/" replace />} />
            <Route path="/register" element={!userProfile ? <RegisterPage /> : <Navigate to="/" replace />} />

            <Route
              path="/"
              element={
                !userProfile ? (
                  <Navigate to="/login" replace />
                ) : userProfile.role === 'super-admin' ? (
                  <Navigate to="/super-admin" replace />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute roles={['company-admin', 'company-user']}>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/team"
              element={
                <ProtectedRoute roles={['company-admin']}>
                  <TeamManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/super-admin"
              element={
                <ProtectedRoute roles={['super-admin']}>
                  <SuperAdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/agents"
              element={
                <ProtectedRoute roles={['company-admin', 'company-user']}>
                  <AgentsListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/agents/run/find-subcontractors"
              element={
                <ProtectedRoute roles={['company-admin', 'company-user']}>
                  <Agent1RunPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/agents/results/:taskId"
              element={
                <ProtectedRoute roles={['company-admin', 'company-user']}>
                  <Agent1ResultsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/uruchom-agenta-v2/:taskId"
              element={
                <ProtectedRoute roles={['company-admin', 'company-user']}>
                  <AgentV2Runner />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Container>
      </main>
      <ToastContainer position="top-right" autoClose={5000} hideProgressBar={false} />
    </>
  );
}

export default App;
```

## /home/flowmistrz/platforma-ai/src/components/agent/AgentV2Runner.tsx
```typescript
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Button, Card, Spinner, Container, ListGroup } from 'react-bootstrap';
import { useAuth } from '../../hooks/useAuth';
import { toast } from 'react-toastify';

const AgentV2Runner = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { authUser } = useAuth();

  const [taskData, setTaskData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAgentRunning, setIsAgentRunning] = useState(false);

  useEffect(() => {
    const fetchTaskData = async () => {
      if (!taskId) return;
      try {
        const taskRef = doc(db, 'agent_tasks', taskId);
        const taskSnap = await getDoc(taskRef);
        if (taskSnap.exists()) {
          setTaskData(taskSnap.data().query);
        } else {
          toast.error("Nie znaleziono zadania o podanym ID.");
        }
      } catch (error) {
        toast.error("Błąd podczas pobierania danych zadania.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTaskData();
  }, [taskId]);

  const handleRunAgentV2 = async () => {
    if (!taskData || !authUser) {
      toast.error("Brak danych zadania lub użytkownik niezalogowany.");
      return;
    }
    setIsAgentRunning(true);
    toast.info("Uruchamiam Agenta v2...");

    try {
        const token = await authUser.getIdToken();
        // Nazwa nowej funkcji wdrożonej na Firebase
        const functionUrl = 'https://europe-west1-automatyzacja-pesamu.cloudfunctions.net/agent2_searchWithTools';

        const payload = {
            keywords: taskData.keywords,
            city: taskData.city,
        };

        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Błąd serwera podczas uruchamiania Agenta V2');
        }

        const result = await response.json();
        const newTaskId = result.data.taskId;

        if (newTaskId) {
            toast.success("Agent V2 pomyślnie uruchomiony! Przekierowuję na stronę wyników.");
            navigate(`/agents/results/${newTaskId}`);
        } else {
            throw new Error("Nie otrzymano ID nowego zadania od serwera.");
        }

    } catch (e: any) {
        console.error("Błąd Agenta V2:", e);
        toast.error(e.message || "Wystąpił błąd podczas uruchamiania Agenta V2!");
        setIsAgentRunning(false);
    }
  };

  if (isLoading) {
    return <Container className="text-center mt-5"><Spinner animation="border" /></Container>;
  }

  if (!taskData) {
    return <Container className="text-center mt-5"><h2>Nie znaleziono danych zadania.</h2></Container>;
  }

  return (
    <Container className="mt-4">
      <Card>
        <Card.Header as="h2">Uruchom Agenta Wersji 2</Card.Header>
        <Card.Body>
          <Card.Title>Gotowy do uruchomienia z następującymi danymi:</Card.Title>
          <ListGroup variant="flush">
            <ListGroup.Item><b>Miasto:</b> {taskData.city}</ListGroup.Item>
            <ListGroup.Item><b>Główna usługa:</b> {taskData.identifiedService || taskData.specialization}</ListGroup.Item>
            <ListGroup.Item><b>Słowa kluczowe:</b> {taskData.keywords?.join(', ')}</ListGroup.Item>
          </ListGroup>
          <div className="d-flex justify-content-end mt-3">
            <Button 
              variant="success" 
              onClick={handleRunAgentV2} 
              disabled={isAgentRunning}
            >
              {isAgentRunning ? <Spinner as="span" animation="border" size="sm" /> : 'Uruchom Agenta V2'}
            </Button>
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default AgentV2Runner;
```

## /home/flowmistrz/platforma-ai/src/pages/Agent1ResultsPage.tsx
```typescript
// ścieżka: src/pages/Agent1ResultsPage.tsx
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, onSnapshot, DocumentSnapshot, FirestoreError } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Card, Spinner, Alert, ListGroup, Button, Table, Row, Col } from 'react-bootstrap';

// Definicja typu dla dokumentu zadania
interface AgentTask {
  status: 'processing' | 'completed' | 'failed';
  logs: { timestamp: { toDate: () => Date }, message: string }[];
  results: any[];
  error?: string;
  summary?: string; // Dodane pole na podsumowanie
}

const Agent1ResultsPage = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const [task, setTask] = useState<AgentTask | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setError("Nie podano ID zadania.");
      return;
    }

    const taskRef = doc(db, "agent_tasks", taskId);

    // Ustaw nasłuch w czasie rzeczywistym na zmiany w dokumencie
    const unsubscribe = onSnapshot(taskRef, (docSnap: DocumentSnapshot) => {
      if (docSnap.exists()) {
        setTask(docSnap.data() as AgentTask);
        setError(null); // Wyczyść błąd, jeśli dokument zostanie znaleziony
      } else {
        // Dokument jeszcze nie istnieje, cierpliwie czekamy.
        // UI pokaże spinner dzięki warunkowi `!task`
        setTask(null);
      }
    }, (err: FirestoreError) => {
      console.error("Błąd nasłuchu zadania:", err);
      setError("Błąd połączenia z bazą danych.");
    });

    // Sprzątanie po odmontowaniu komponentu
    return () => {
      unsubscribe();
    };
  }, [taskId]);
  
  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  if (!task) {
    return <div className="text-center p-5"><Spinner animation="border" /></div>;
  }

  return (
    <div>
      <Link to="/agents" className="mb-4 d-inline-block">
        <Button variant="outline-secondary" size="sm">
          &larr; Wróć do listy agentów
        </Button>
      </Link>
      <h1>Wyniki Pracy Agenta</h1>
      <p>ID zadania: <code>{taskId}</code></p>
      
      <Row>
        <Col md={8}>
          <Card className="mt-4">
            <Card.Header as="h5">Znalezione Firmy</Card.Header>
            <Card.Body>
              {task.status === 'processing' && <div className="text-center p-4"><Spinner animation="border" /> <p className="mt-2">Agent wciąż pracuje...</p></div>}
              {task.status === 'completed' && (
                <Table striped bordered hover responsive size="sm">
                  <thead><tr><th>Nazwa</th><th>Email</th><th>Telefon</th><th>Dopasowanie</th><th>Ocena</th></tr></thead>
                  <tbody>
                    {task.results.map((company, index) => (
                      <tr key={index}>
                        <td>{company.name}</td>
                        <td>{company.email}</td>
                        <td>{company.phone}</td>
                        <td>{company.match}</td>
                        <td>{company.rating}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
               {task.status === 'failed' && <Alert variant="danger">Praca agenta zakończona błędem: {task.error}</Alert>}
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="mt-4">
            <Card.Header as="h5">Konsola Agenta (Na Żywo)</Card.Header>
            <ListGroup variant="flush" style={{ maxHeight: '500px', overflowY: 'auto', fontSize: '0.85rem' }}>
              {task.logs && task.logs.slice().reverse().map((log, index) => (
                <ListGroup.Item key={index} className="py-2 px-3 border-bottom-0">
                  <small className="text-muted">{log.timestamp.toDate().toLocaleTimeString()}</small>
                  <p className="mb-0">{log.message}</p>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Agent1ResultsPage; // ZMIANA NAZWY
```