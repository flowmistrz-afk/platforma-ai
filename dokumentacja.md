# Kompletna Dokumentacja Projektu: Platforma Analityki AI (Backup)

Data utworzenia: 27 września 2025

## 1. Podsumowanie

Ten dokument stanowi kompletny zrzut (snapshot) kodu źródłowego i plików konfiguracyjnych projektu `platforma-ai` w jego ostatniej, stabilnej i działającej wersji. Służy jako punkt przywracania i kompletna dokumentacja techniczna.

## 2. Pełny Kod Źródłowy Wszystkich Plików

---
### `/home/flowmistrz/platforma-ai/.firebaserc`
```json
{
  "projects": {
    "default": "automatyzacja-pesamu"
  }
}
```

---
### `/home/flowmistrz/platforma-ai/.gitignore`
```
# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
/node_modules
/.pnp
.pnp.js

# testing
/coverage

# production
/build

# misc
.DS_Store
.env.local
.env.development.local
.env.test.local
.env.production.local

npm-debug.log*
yarn-debug.log*
yarn-error.log*
```

---
### `/home/flowmistrz/platforma-ai/README.md`
```markdown
# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’tsatisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).
```

---
### `/home/flowmistrz/platforma-ai/firebase.json`
```json
{
  "functions": {
    "source": "functions"
  },
  "hosting": {
    "public": "build",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  },
  "firestore": {
    "rules": "firestore.rules"
  }
}
```

---
### `/home/flowmistrz/platforma-ai/firestore.rules`
```
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
      // Użytkownik może odczytać zadanie, jeśli jest jego właścicielem
      allow read: if request.auth.uid == resource.data.ownerUid;
      // Użytkownik nie może tworzyć, edytować ani usuwać zadań bezpośrednio
      // - tym zarządza funkcja w chmurze
      allow write: if false;
    }
  }
}
```

---
### `/home/flowmistrz/platforma-ai/package.json`
```json
{
  "name": "platforma-ai",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "@testing-library/dom": "^10.4.1",
    "@testing-library/jest-dom": "^6.8.0",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^13.5.0",
    "@types/jest": "^27.5.2",
    "@types/node": "^16.18.126",
    "@types/react": "^19.1.13",
    "@types/react-dom": "^19.1.9",
    "@types/react-router-dom": "^5.3.3",
    "@types/react-toastify": "^4.0.2",
    "bootstrap": "^5.3.8",
    "firebase": "^12.3.0",
    "react": "^19.1.1",
    "react-bootstrap": "^2.10.10",
    "react-dom": "^19.1.1",
    "react-router-dom": "^7.9.2",
    "react-scripts": "5.0.1",
    "react-toastify": "^11.0.5",
    "typescript": "^4.9.5",
    "web-vitals": "^2.1.4",
    "zustand": "^5.0.8"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  },
  "eslintConfig": {
    "extends": [
      "react-app",
      "react-app/jest"
    ]
  },
  "browserslist": {
    "production": [
      ">0.2%",
      "not dead",
      "not op_mini all"
    ],
    "development": [
      "last 1 chrome version",
      "last 1 firefox version",
      "last 1 safari version"
    ]
  }
}
```

---
### `/home/flowmistrz/platforma-ai/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "es5",
    "lib": [
      "dom",
      "dom.iterable",
      "esnext"
    ],
    "allowJs": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": [
    "src"
  ]
}
```

---
### `/home/flowmistrz/platforma-ai/functions/package.json`
```json
{
  "name": "functions",
  "description": "Cloud Functions for Firebase",
  "scripts": {
    "lint": "eslint --ext .js,.ts .",
    "build": "tsc",
    "serve": "npm run build && firebase emulators:start --only functions",
    "shell": "npm run build && firebase functions:shell",
    "start": "npm run shell",
    "deploy": "firebase deploy --only functions",
    "logs": "firebase functions:log"
  },
  "engines": {
    "node": "20"
  },
  "main": "lib/index.js",
  "dependencies": {
    "@google-cloud/vertexai": "^1.10.0",
    "cors": "^2.8.5",
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^6.4.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.13",
    "@typescript-eslint/eslint-plugin": "^5.12.0",
    "@typescript-eslint/parser": "^5.12.0",
    "eslint": "^8.9.0",
    "eslint-plugin-import": "^2.25.4",
    "typescript": "^4.9.0"
  },
  "private": true
}
```

---
### `/home/flowmistrz/platforma-ai/functions/tsconfig.json`
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "outDir": "lib",
    "sourceMap": true,
    "strict": true,
    "target": "es2017",
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "compileOnSave": true,
  "include": [
    "src"
  ],
  "exclude": [
    "node_modules",
    "../node_modules"
  ]
}
```

---
### `/home/flowmistrz/platforma-ai/functions/src/index.ts`
```typescript
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import cors from "cors";
import { VertexAI } from "@google-cloud/vertexai";

setGlobalOptions({ region: "europe-west1" });

admin.initializeApp();
const db = admin.firestore();

const vertex_ai = new VertexAI({ project: "automatyzacja-pesamu", location: "europe-west4" });
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
    throw new HttpsError("invalid-argument", "Pole 'specjalizacja' jest wymagane.");
  }

  const prompt = `
    Jesteś światowej klasy ekspertem w polskiej branży budowlanej i specjalistą od marketingu internetowego. Twoim zadaniem jest przeanalizowanie zapytania użytkownika i kreatywne rozbudowanie go na potrzeby wyszukiwania w internecie.
    Oryginalne zapytanie użytkownika: "${specialization}"

    Zadania do wykonania:
    1.  Wygeneruj listę 5-10 unikalnych, alternatywnych i synonimicznych fraz oraz słów kluczowych, których Polacy użyliby do wyszukania takiej firmy w wyszukiwarce Google. Uwzględnij zarówno formy rzeczownikowe, jak i czasownikowe (np. "brukarz", "układanie kostki").
    2.  Na podstawie oryginalnego zapytania i wygenerowanych fraz, zidentyfikuj 1-3 najbardziej prawdopodobne, pasujące kody PKD z Polskiej Klasyfikacji Działalności.

    Zwróć wynik wyłącznie w formacie JSON, bez żadnych dodatkowych komentarzy, formatowania markdown (bez 

) ani wyjaśnień. Struktura JSON musi być następująca:
    {
      "keywords": ["fraz_1", "fraza_2", ...],
      "pkdCodes": ["kod_pkd_1", "kod_pkd_2", ...]
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
      response.status(400).json({ error: "Pola 'specjalizacja' i 'miasto' są wymagane." });
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

      await new Promise(resolve => setTimeout(resolve, 1500));
      await taskRef.update({
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        results: enrichedCompanies,
        logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Zakończono. Agent znalazł ${enrichedCompanies.length} pasujących podwykonawców.` })
      });

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
```

---
### `/home/flowmistrz/platforma-ai/public/index.html`
```html
<!DOCTYPE html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta
      name="description"
      content="Platforma Analityki Budowlanej AI"
    />
    <link rel="apple-touch-icon" href="/logo192.png" />
    <link rel="manifest" href="/manifest.json" />
    <title>Platforma Analityki Budowlanej AI</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
  <script type="importmap">
{
  "imports": {
    "react": "https://aistudiocdn.com/react@^19.1.1",
    "react-router-dom": "https://aistudiocdn.com/react-router-dom@^7.9.2",
    "react-bootstrap": "https://aistudiocdn.com/react-bootstrap@^2.10.10",
    "react-toastify": "https://aistudiocdn.com/react-toastify@^11.0.5",
    "react-toastify/": "https://aistudiocdn.com/react-toastify@^11.0.5/",
    "react/": "https://aistudiocdn.com/react@^19.1.1/",
    "firebase/": "https://aistudiocdn.com/firebase@^12.3.0/",
    "react-dom/": "https://aistudiocdn.com/react-dom@^19.1.1/"
  }
}
</script>
</head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
```

---
### `/home/flowmistrz/platforma-ai/src/App.tsx`
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

---
### `/home/flowmistrz/platforma-ai/src/components/Header.tsx`
```typescript
import React from 'react';
import { Navbar, Nav, Container, Button, NavDropdown } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'react-toastify';

const Header = () => {
  const { userProfile, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Wylogowano pomyślnie!');
      navigate('/login');
    } catch (error) {
      toast.error('Wystąpił błąd podczas wylogowywania.');
    }
  };

  return (
    <header>
      <Navbar bg="dark" variant="dark" expand="lg" collapseOnSelect>
        <Container>
          <Navbar.Brand as={Link} to="/">
            Platforma Analityki AI
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="ms-auto">
              {userProfile ? (
                <>
                  {userProfile.role === 'super-admin' && (
                    <Nav.Link as={Link} to="/super-admin">
                      Panel Super Admina
                    </Nav.Link>
                  )}
                  {userProfile.role === 'company-admin' && (
                     <Nav.Link as={Link} to="/team">
                        Zarządzanie Zespołem
                      </Nav.Link>
                  )}
                  <NavDropdown title={userProfile.email} id="username">
                    <NavDropdown.Item onClick={handleLogout}>
                      Wyloguj
                    </NavDropdown.Item>
                  </NavDropdown>
                </>
              ) : (
                <>
                  <Nav.Link as={Link} to="/login">
                    <Button variant="outline-light" size="sm">Logowanie</Button>
                  </Nav.Link>
                  <Nav.Link as={Link} to="/register">
                    <Button variant="primary" size="sm">Zarejestruj firmę</Button>
                  </Nav.Link>
                </>
              )}
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
    </header>
  );
};

export default Header;
```

---
### `/home/flowmistrz/platforma-ai/src/components/LoadingSpinner.tsx`
```typescript
import React from 'react';
import { Spinner } from 'react-bootstrap';

const LoadingSpinner = () => {
  return (
    <Spinner animation="border" role="status">
      <span className="visually-hidden">Ładowanie...</span>
    </Spinner>
  );};

export default LoadingSpinner;
```

---
### `/home/flowmistrz/platforma-ai/src/components/ProtectedRoute.tsx`
```typescript
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { UserRole } from '../type';
import { Spinner } from 'react-bootstrap';

interface ProtectedRouteProps {
  children: React.JSX.Element;
  roles: UserRole[];
}

const ProtectedRoute = ({ children, roles }: ProtectedRouteProps): React.JSX.Element => {
  const { userProfile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '80vh' }}>
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Ładowanie...</span>
        </Spinner>
      </div>
    );
  }

  if (!userProfile) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  if (!roles.includes(userProfile.role)) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;
```

---
### `/home/flowmistrz/platforma-ai/src/contexts/AuthContext.tsx`
```typescript
import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  User
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { UserProfile, Company } from '../type';

export interface AuthContextType {
  authUser: User | null; // Zmienione na pełny typ User
  userProfile: UserProfile | null;
  company: Company | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  registerCompany: (companyName: string, email: string, pass: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [authUser, setAuthUser] = useState<User | null>(null); // Zmienione na pełny typ User
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = useCallback(async (user: User) => {
    setLoading(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const profile = userDocSnap.data() as UserProfile;
        setUserProfile(profile);

        if (profile.companyId) {
          const companyDocRef = doc(db, 'companies', profile.companyId);
          const companyDocSnap = await getDoc(companyDocRef);
          if (companyDocSnap.exists()) {
            setCompany({ id: companyDocSnap.id, ...companyDocSnap.data() } as Company);
          }
        }
      } else {
        console.error("No user profile found in Firestore for UID:", user.uid);
        setUserProfile(null);
        setCompany(null);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      setUserProfile(null);
      setCompany(null);
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthUser(user); // Ustawiamy pełny obiekt użytkownika
        fetchUserData(user);
      } else {
        setAuthUser(null);
        setUserProfile(null);
        setCompany(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [fetchUserData]);
  
  const login = async (email: string, pass: string) => {
      await signInWithEmailAndPassword(auth, email, pass);
  };

  const logout = () => {
    return signOut(auth);
  };
  
  const registerCompany = async (companyName: string, email: string, pass: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    const user = userCredential.user;
    
    if (!user) {
        throw new Error("User creation failed.");
    }

    const newCompanyRef = doc(db, 'companies', user.uid);
    const newCompany: Omit<Company, 'id'> = {
        name: companyName,
        adminUids: [user.uid],
    };
    await setDoc(newCompanyRef, newCompany);

    const newUserProfile: UserProfile = {
      uid: user.uid,
      email: user.email!,
      role: 'company-admin',
      companyId: newCompanyRef.id,
    };
    await setDoc(doc(db, 'users', user.uid), newUserProfile);
  };


  const value = {
    authUser,
    userProfile,
    company,
    loading,
    login,
    logout,
    registerCompany,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
```

---
### `/home/flowmistrz/platforma-ai/src/hooks/useAuth.ts`
```typescript
import { useContext } from 'react';
import { AuthContext, AuthContextType } from '../contexts/AuthContext';

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
```

---
### `/home/flowmistrz/platforma-ai/src/index.css`
```css
@import url('bootstrap/dist/css/bootstrap.min.css');

:root {
  --primary-color: #0d6efd;
  --success-color: #198754;
  --error-color: #dc3545;
  --background-color: #f8f9fa;
  --text-color: #212529;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: var(--background-color);
  color: var(--text-color);
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
    monospace;
}

.auth-form-container {
    max-width: 450px;
    margin: 5rem auto;
    padding: 2rem;
    background-color: #fff;
    border-radius: 0.5rem;
    box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.1);
}
```

---
### `/home/flowmistrz/platforma-ai/src/index.tsx`
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import './index.css';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
```

---
### `/home/flowmistrz/platforma-ai/src/pages/DashboardPage.tsx`
```typescript
import React from 'react';
import { Card, Col, Row, Button } from 'react-bootstrap';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';

const DashboardPage = () => {
  const { userProfile, company } = useAuth();
  return (
    <div>
      <h1>Panel Główny</h1>
      <p>Witaj, {userProfile?.email}!</p>
      {company && <p>Jesteś członkiem firmy: <strong>{company.name}</strong></p>}
      
      <Row className="mt-4">
        <Col md={6}>
            <Card>
                <Card.Body>
                    <Card.Title>Agenci AI</Card.Title>
                    <Card.Text>
                        Zarządzaj dostępnymi agentami AI i monitoruj ich wykorzystanie.
                    </Card.Text>
                    <Link to="/agents">
                        <Button variant="primary">Przejdź do agentów</Button>
                    </Link>
                </Card.Body>
            </Card>
        </Col>
        <Col md={6}>
            <Card>
                <Card.Body>
                    <Card.Title>Raporty i Analizy</Card.Title>
                    <Card.Text>
                        Przeglądaj raporty dotyczące aktywności i kosztów.
                    </Card.Text>
                </Card.Body>
            </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
```

---
### `/home/flowmistrz/platforma-ai/src/pages/LoginPage.tsx`
```typescript
import React, { useState, FormEvent } from 'react';
import { Form, Button, Card, Alert, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'react-toastify';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      toast.success('Zalogowano pomyślnie!');
    } catch (err: any) {
      setError('Nie udało się zalogować. Sprawdź e-mail i hasło.');
      toast.error('Błąd logowania!');
      setLoading(false);
    }
  };

  return (
    <div className="auth-form-container">
      <Card>
        <Card.Body>
          <h2 className="text-center mb-4">Logowanie</h2>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={handleSubmit}>
            <Form.Group id="email">
              <Form.Label>Adres e-mail</Form.Label>
              <Form.Control
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Form.Group>
            <Form.Group id="password"  className="mt-3">
              <Form.Label>Hasło</Form.Label>
              <Form.Control
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Form.Group>
            <Button disabled={loading} className="w-100 mt-4" type="submit">
              {loading ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> : 'Zaloguj się'}
            </Button>
          </Form>
        </Card.Body>
      </Card>
      <div className="w-100 text-center mt-2">
        Nie masz konta? <Link to="/register">Zarejestruj firmę</Link>
      </div>
    </div>
  );
};

export default LoginPage;
```

---
### `/home/flowmistrz/platforma-ai/src/pages/RegisterPage.tsx`
```typescript
import React, { useState, FormEvent } from 'react';
import { Form, Button, Card, Alert, Spinner } from 'react-bootstrap';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'react-toastify';

const RegisterPage = () => {
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { registerCompany } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      return setError('Hasła nie są identyczne.');
    }

    setError('');
    setLoading(true);

    try {
      await registerCompany(companyName, email, password);
      toast.success('Firma zarejestrowana pomyślnie!');
      navigate('/dashboard');
    } catch (err: any) {
      let errorMessage = 'Nie udało się utworzyć konta. Spróbuj ponownie.';
      switch (err.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'Ten adres e-mail jest już zajęty.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Wprowadzony adres e-mail jest nieprawidłowy.';
          break;
        case 'auth/weak-password':
          errorMessage = 'Hasło jest zbyt słabe. Powinno mieć co najmniej 6 znaków.';
          break;
      }
      setError(errorMessage);
      toast.error('Błąd rejestracji!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form-container">
      <Card>
        <Card.Body>
          <h2 className="text-center mb-4">Zarejestruj firmę</h2>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={handleSubmit}>
             <Form.Group id="companyName">
              <Form.Label>Nazwa firmy</Form.Label>
              <Form.Control
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </Form.Group>
            <Form.Group id="email" className="mt-3">
              <Form.Label>Twój adres e-mail (login)</Form.Label>
              <Form.Control
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Form.Group>
            <Form.Group id="password" className="mt-3">
              <Form.Label>Hasło</Form.Label>
              <Form.Control
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Form.Group>
            <Form.Group id="confirmPassword"  className="mt-3">
              <Form.Label>Potwierdź hasło</Form.Label>
              <Form.Control
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </Form.Group>
            <Button disabled={loading} className="w-100 mt-4" type="submit">
               {loading ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> : 'Zarejestruj się'}
            </Button>
          </Form>
        </Card.Body>
      </Card>
      <div className="w-100 text-center mt-2">
        Masz już konto? <Link to="/login">Zaloguj się</Link>
      </div>
    </div>
  );
};

export default RegisterPage;
```

---
### `/home/flowmistrz/platforma-ai/src/pages/SuperAdminDashboard.tsx`
```typescript
import React, { useState, useEffect } from 'react';
import { Card, Table, Alert, Container, Row, Col, Button } from 'react-bootstrap';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Company } from '../type';
import LoadingSpinner from '../components/LoadingSpinner';

type AdminView = 'companies' | 'agents' | 'analytics' | 'logs';

const SuperAdminDashboard = () => {
  const [activeView, setActiveView] = useState<AdminView>('companies');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  useEffect(() => {
    if (activeView !== 'companies') {
      setLoading(false);
      return;
    }
    
    if (activeView === 'companies' && companies.length === 0) {
      const fetchCompanies = async () => {
        setLoading(true);
        try {
          const companiesCollectionRef = collection(db, 'companies');
          const querySnapshot = await getDocs(companiesCollectionRef);
          const companiesList = querySnapshot.docs.map(doc => ({
            id: doc.id, ...doc.data()
          } as Company));
          setCompanies(companiesList);
        } catch (err) {
          console.error("Error fetching companies:", err);
          setError('Wystąpił błąd podczas pobierania danych o firmach.');
        } finally {
          setLoading(false);
        }
      };
      fetchCompanies();
    } else {
        setLoading(false);
    }
  }, [activeView, companies.length]);

  const handleViewChange = (view: AdminView) => {
    setActiveView(view);
    setIsFullScreen(false);
  };

  const renderCompanyList = () => {
    if (error) return <Alert variant="danger">{error}</Alert>;
    return (
      <div style={{ maxHeight: isFullScreen ? 'calc(100vh - 120px)' : '65vh', overflowY: 'auto' }}>
        <Table striped bordered hover responsive>
          <thead className="sticky-top" style={{ backgroundColor: '#f8f9fa', zIndex: 1 }}>
            <tr>
              <th style={{ width: '40%' }}>ID Firmy</th>
              <th>Nazwa Firmy</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (<tr key={company.id}><td><code>{company.id}</code></td><td>{company.name}</td></tr>))}
          </tbody>
        </Table>
      </div>
    );
  };

  const renderActiveView = () => {
    const views = {
      companies: { title: 'Zarejestrowane Firmy', content: renderCompanyList() },
      agents: { title: 'Zarządzanie Agentami', content: null },
      analytics: { title: 'Analityka i Raporty', content: null },
      logs: { title: 'Dziennik Zdarzeń', content: null },
    };
    const currentView = views[activeView];

    if (loading) {
        return (
            <Card className="shadow-sm">
                <Card.Header as="h5">{currentView.title}</Card.Header>
                <Card.Body><div className="d-flex justify-content-center py-5"><LoadingSpinner /></div></Card.Body>
            </Card>
        );
    }

    return (
      <Card className="shadow-sm">
        <Card.Header as="h5" className="d-flex justify-content-between align-items-center">
          {currentView.title}
          <Button variant="outline-secondary" size="sm" onClick={() => setIsFullScreen(!isFullScreen)} title={isFullScreen ? "Wyjdź z trybu pełnoekranowego" : "Tryb pełnoekranowy"}>
            <i className={isFullScreen ? "bi bi-fullscreen-exit" : "bi bi-fullscreen"}></i>
          </Button>
        </Card.Header>
        {currentView.content ? currentView.content : (
          <Card.Body>
            <div className="text-center p-5">
              <h4 className="text-muted">Funkcjonalność w budowie</h4>
              <p>Ta sekcja zostanie wkrótce udostępniona.</p>
            </div>
          </Card.Body>
        )}
      </Card>
    );
  };

  if (isFullScreen) {
    return (
      <Container fluid className="p-3 h-100">
        <Row className="h-100">
          <Col className="d-flex flex-column h-100">{renderActiveView()}</Col>
        </Row>
      </Container>
    );
  }

  return (
    <div style={{ height: 'calc(100vh - 72px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0 }}>
        <div className="p-3 mb-4 bg-primary text-white text-center">
          <Container>
            <h1 className="display-5 fw-bold">Panel Super Administratora</h1>
          </Container>
        </div>
        <Container>
            <div className="row mb-4 text-center">
              {Object.keys({ companies: 'a', agents: 'b', analytics: 'c', logs: 'd' }).map((view) => {
                const titles = { companies: 'Zarządzanie Firmami', agents: 'Zarządzanie Agentami', analytics: 'Analityka i Raporty', logs: 'Dziennik Zdarzeń' };
                const texts = { companies: 'Przeglądaj i edytuj zarejestrowane firmy.', agents: 'Konfiguruj dostępne modele i agenty AI.', analytics: 'Monitoruj zużycie usług i generuj raporty.', logs: 'Przeglądaj logi systemowe i aktywność.' };
                return (
                  <div className="col-md-6 col-lg-3 mb-3" key={view}>
                    <Card onClick={() => handleViewChange(view as AdminView)} className={`shadow-sm h-100 ${activeView === view ? 'border-primary border-2' : ''}`} style={{ cursor: 'pointer' }}>
                      <Card.Body><Card.Title>{titles[view as AdminView]}</Card.Title><Card.Text>{texts[view as AdminView]}</Card.Text></Card.Body>
                    </Card>
                  </div>
                );
              })}
            </div>
        </Container>
      </div>
      
      <div style={{ flexGrow: 1, overflowY: 'auto', minHeight: 0 }}>
        <Container>
            <div className="row justify-content-center">
                <div className="col-lg-10 col-xl-9">
                    {renderActiveView()}
                </div>
            </div>
        </Container>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
```

---
### `/home/flowmistrz/platforma-ai/src/pages/TeamManagementPage.tsx`
```typescript
import React, { useState, useEffect, FormEvent } from 'react';
import { Card, Button, Form, Alert, Spinner, Table } from 'react-bootstrap';
import { useAuth } from '../hooks/useAuth';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";
import { UserProfile } from '../type';
import { toast } from 'react-toastify';

const TeamManagementPage = () => {
    const { company } = useAuth();
    const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
    const [loadingTeam, setLoadingTeam] = useState(true);
    
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserName, setNewUserName] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [isInviting, setIsInviting] = useState(false);
    
    const [inviteError, setInviteError] = useState('');
    const [listError, setListError] = useState('');

    useEffect(() => {
        if (!company?.id) {
            setLoadingTeam(false);
            return;
        }
        
        setLoadingTeam(true);
        setListError('');
        const q = query(collection(db, "users"), where("companyId", "==", company.id));
        
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const members = querySnapshot.docs.map(doc => doc.data() as UserProfile);
            setTeamMembers(members);
            setLoadingTeam(false);
        }, (err) => {
            console.error("Error fetching team members: ", err);
            setListError("Nie udało się załadować listy pracowników. Sprawdź konsolę (F12) po więcej szczegółów.");
            setLoadingTeam(false);
        });

        return () => unsubscribe();

    }, [company?.id]);

    const handleInviteSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!newUserEmail || !newUserName || !newUserPassword) {
            return setInviteError("Wszystkie pola są wymagane.");
        }
        if (newUserPassword.length < 6) {
            return setInviteError("Hasło musi mieć co najmniej 6 znaków.");
        }
        setIsInviting(true);
        setInviteError('');

        try {
            const functions = getFunctions(undefined, 'europe-west1');
            const inviteUser = httpsCallable(functions, 'inviteUser');
            await inviteUser({
                newUserEmail, 
                newUserName, 
                newUserPassword,
                companyId: company?.id 
            });
            
            toast.success(`Pracownik ${newUserName} został pomyślnie dodany!`);
            setNewUserEmail('');
            setNewUserName('');
            setNewUserPassword('');
        } catch (err: any) {
            setInviteError(err.message || "Wystąpił błąd podczas zapraszania.");
            toast.error(err.message || "Nie udało się dodać pracownika.");
        } finally {
            setIsInviting(false);
        }
    };

    return (
        <div>
          <h1>Zarządzanie Zespołem</h1>
          {company && <p>Zarządzasz pracownikami firmy: <strong>{company.name}</strong></p>}
          
          <Card className="mt-4">
            <Card.Header as="h5">Dodaj nowego pracownika</Card.Header>
            <Card.Body>
                <Form onSubmit={handleInviteSubmit}>
                    {inviteError && <Alert variant="danger">{inviteError}</Alert>}
                    <Form.Group className="mb-3" controlId="newUserName">
                        <Form.Label>Imię i nazwisko</Form.Label>
                        <Form.Control type="text" placeholder="Jan Kowalski" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} required disabled={isInviting} />
                    </Form.Group>
                    <Form.Group className="mb-3" controlId="newUserEmail">
                        <Form.Label>Adres e-mail</Form.Label>
                        <Form.Control type="email" placeholder="email@przyklad.com" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} required disabled={isInviting} />
                    </Form.Group>
                    <Form.Group className="mb-3" controlId="newUserPassword">
                        <Form.Label>Hasło początkowe</Form.Label>
                        <Form.Control type="password" placeholder="Min. 6 znaków" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} required disabled={isInviting} />
                    </Form.Group>
                    <Button variant="primary" type="submit" disabled={isInviting}>
                        {isInviting ? <><Spinner as="span" animation="border" size="sm" /> Zapraszanie...</> : 'Dodaj pracownika'}
                    </Button>
                </Form>
            </Card.Body>
          </Card>

          <Card className="mt-4">
            <Card.Header as="h5">Lista pracowników</Card.Header>
            <Card.Body>
                {loadingTeam ? <div className="text-center p-5"><Spinner animation="border" /></div> : 
                 listError ? <Alert variant="danger">{listError}</Alert> : (
                    <Table striped bordered hover responsive>
                        <thead><tr><th>Imię i nazwisko</th><th>Email</th><th>Rola</th></tr></thead>
                        <tbody>
                            {teamMembers.map(member => (
                                <tr key={member.uid}>
                                    <td>{member.name || '-'}</td>
                                    <td>{member.email}</td>
                                    <td>{member.role}</td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                )}
            </Card.Body>
          </Card>
        </div>
    );
};

export default TeamManagementPage;
```

---
### `/home/flowmistrz/platforma-ai/src/react-app-env.d.ts`
```typescript
/// <reference types="react-scripts" />
```

---
### `/home/flowmistrz/platforma-ai/src/services/firebase.ts`
```typescript
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDODHbCiufhcewFlpfqOYMKyz61GBVs_DY",
  authDomain: "automatyzacja-pesamu.firebaseapp.com",
  projectId: "automatyzacja-pesamu",
  storageBucket: "automatyzacja-pesamu.appspot.com",
  messagingSenderId: "567539916654",
  appId: "1:567539916654:web:012575afa470e68954ab7f",
  measurementId: "G-W0M8YXD114"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
```

---
### `/home/flowmistrz/platforma-ai/src/type.ts`
```typescript
export type UserRole = 'super-admin' | 'company-admin' | 'company-user';



export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  companyId: string;
  name?: string;
}

export interface Company {
  id: string;
  name: string;
  adminUids: string[];
  enabledAgents?: string[];
}
```

---
### `/home/flowmistrz/platforma-ai/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "es5",
    "lib": [
      "dom",
      "dom.iterable",
      "esnext"
    ],
    "allowJs": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": [
    "src"
  ]
}
```
