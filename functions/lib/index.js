"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.agent3_searchWithSelenium = exports.inviteUser = exports.runAgent1_findSubcontractors = exports.agent1_expandKeywords = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const admin = __importStar(require("firebase-admin"));
const cors_1 = __importDefault(require("cors"));
const agentV2_1 = require("./agentV2");
const agentV3_1 = require("./agentV3");
const firebase_init_1 = require("./firebase-init");
(0, v2_1.setGlobalOptions)({ region: "europe-west1" });
const generativeModel = firebase_init_1.vertex_ai.getGenerativeModel({
    model: "gemini-2.5-pro",
});
const corsHandler = (0, cors_1.default)({ origin: true });
// --- NOWA FUNKCJA DLA AGENTA 1 (ETAP 1) ---
exports.agent1_expandKeywords = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Musisz być zalogowany.");
    }
    const { specialization } = request.data;
    if (!specialization) {
        throw new https_1.HttpsError("invalid-argument", "Pole \'specjalizacja\' jest wymagane.");
    }
    const prompt = `Jesteś światowej klasy ekspertem w polskiej branży budowlanej i specjalistą od marketingu internetowego. Twoim zadaniem jest przeanalizowanie zapytania użytkownika i wyizolowanie GŁÓWNEJ USŁUGI BUDOWLANEJ/RZEMIOSŁA. Następnie, na podstawie wyizolowanej usługi, kreatywnie rozbudujesz zbiór fraz kluczowych oraz zidentyfikujesz pasujące kody PKD.\n\n**WYTYCZNE KRYTYCZNE:**\n1.  **Ignoruj Lokalizację:** Wszelkie wzmianki o lokalizacji (np. miasto, województwo, "w pobliżu", "okolice") muszą być całkowicie zignorowane i nie mogą być częścią generowanych fraz kluczowych. Interesuje nas czysta usługa (np. "brukarstwo", "ocieplanie budynków").\n2.  **Profesjonalna Terminologia:** Generowane frazy muszą być profesjonalne i obejmować zarówno potoczne nazwy, jak i techniczne/biznesowe synonimy (np. dla "ocieplanie budynków" to także "termomodernizacja").\n\nOryginalne zapytanie użytkownika: "${specialization}"\n\n**Zadania do wykonania:**\n1.  **Identyfikacja Usługi:** Zidentyfikuj i wyodrębnij jedną, główną usługę budowlaną lub rzemiosło z zapytania użytkownika.\n2.  **Generowanie Kluczowych Fraz:** Wygeneruj listę 8-12 unikalnych, alternatywnych i synonimicznych fraz oraz słów kluczowych, które profesjonalnie opisują zidentyfikowaną usługę. Uwzględnij formy rzeczownikowe (np. "brukarz") oraz czynności (np. "układanie kostki brukowej").\n3.  **Kody PKD:** Na podstawie zidentyfikowanej usługi i wygenerowanych fraz, zidentyfikuj 1-3 najbardziej prawdopodobne, pasujące kody PKD (Polskiej Klasyfikacji Działalności) dla firm świadczących tę usługę.\n\nZwróć wynik wyłącznie w formacie JSON, bez żadnych dodatkowych komentarzy, formatowania markdown (bez \`\`\`json) ani wyjaśnień. Struktura JSON musi być następująca:\n{\n  "identifiedService": "Główna usługa wyodrębniona z zapytania",\n  "keywords": ["fraza_1", "fraza_2", "fraza_3", "fraza_4", "fraza_5", "fraza_6", "fraza_7", "fraza_8"],\n  "pkdCodes": ["kod_pkd_1", "kod_pkd_2", "kod_pkd_3"]\n}\n`;
    try {
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;
        const responseText = (_e = (_d = (_c = (_b = (_a = response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text;
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
        }
        catch (e) {
            console.error("Failed to parse the extracted JSON string.", e);
            throw new Error("Failed to parse the extracted JSON string.");
        }
    }
    catch (error) {
        console.error("Błąd podczas komunikacji z Vertex AI:", error);
        throw new https_1.HttpsError("internal", "Błąd podczas generowania sugestii AI.");
    }
});
exports.runAgent1_findSubcontractors = (0, https_1.onRequest)({ secrets: ["GOOGLE_MAPS_API_KEY"] }, (request, response) => {
    corsHandler(request, response, async () => {
        var _a;
        const idToken = (_a = request.headers.authorization) === null || _a === void 0 ? void 0 : _a.split("Bearer ")[1];
        if (!idToken) {
            response.status(401).send("Unauthorized");
            return;
        }
        let decodedToken;
        try {
            decodedToken = await admin.auth().verifyIdToken(idToken);
        }
        catch (error) {
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
        const taskRef = firebase_init_1.db.collection("agent_tasks").doc();
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
            let initialResults = [];
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
            await (0, agentV2_1.runAgent2Logic)(data, taskRef);
        }
        catch (error) {
            const err = error;
            await taskRef.update({ status: "failed", error: err.message });
        }
    });
});
async function expandQueryWithAI(specialization) {
    console.log(`AI: Rozszerzam zapytanie dla: "${specialization}"`);
    await new Promise(resolve => setTimeout(resolve, 1500));
    return Promise.resolve({
        keywords: [specialization, `układanie ${specialization}`, `firma ${specialization}`],
        pkdCodes: ["43.99.Z", "43.33.Z"],
    });
}
async function enrichCompanyData(company, specialization) {
    console.log(`AI: Weryfikuję i wzbogacam dane dla: "${company.name}"`);
    await new Promise(resolve => setTimeout(resolve, 500));
    const email = `kontakt@${company.name.toLowerCase().replace(/\s/g, "")}.pl`;
    const phone = `+48 555 ${Math.floor(Math.random() * 900) + 100} ${Math.floor(Math.random() * 900) + 100}`;
    const match = Math.random() > 0.3 ? "Wysokie" : "Niskie";
    const rating = (Math.random() * (5 - 3.5) + 3.5).toFixed(1);
    return Object.assign(Object.assign({}, company), { email,
        phone,
        match,
        rating });
}
exports.inviteUser = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Musisz być zalogowany, aby zapraszać użytkowników.");
    }
    const adminUid = request.auth.uid;
    const { newUserEmail, newUserName, newUserPassword, companyId } = request.data;
    const adminProfileRef = admin.firestore().collection("users").doc(adminUid);
    const adminProfileSnap = await adminProfileRef.get();
    const adminProfile = adminProfileSnap.data();
    if (!adminProfile || adminProfile.role !== "company-admin" || adminProfile.companyId !== companyId) {
        throw new https_1.HttpsError("permission-denied", "Nie masz uprawnień do dodawania użytkowników do tej firmy.");
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
    }
    catch (error) {
        console.error("Błąd podczas tworzenia użytkownika:", error);
        if (error.code === 'auth/email-already-exists') {
            throw new https_1.HttpsError('already-exists', 'Ten adres e-mail jest już zarejestrowany.');
        }
        throw new https_1.HttpsError("internal", "Wystąpił nieoczekiwany błąd serwera.");
    }
});
__exportStar(require("./agentV2"), exports);
// Trivial change to force redeployment
exports.agent3_searchWithSelenium = (0, https_1.onRequest)({
    timeoutSeconds: 540,
    memory: "2GiB",
    cpu: 4,
    secrets: ["GOOGLE_MAPS_API_KEY"]
}, async (request, response) => {
    corsHandler(request, response, async () => {
        var _a;
        const idToken = (_a = request.headers.authorization) === null || _a === void 0 ? void 0 : _a.split("Bearer ")[1];
        if (!idToken) {
            response.status(401).send("Unauthorized");
            return;
        }
        let decodedToken;
        try {
            decodedToken = await admin.auth().verifyIdToken(idToken);
        }
        catch (error) {
            response.status(401).send("Unauthorized");
            return;
        }
        const uid = decodedToken.uid;
        const data = request.body;
        const { query } = data || {};
        if (!query) {
            response.status(400).json({ error: "Pole 'query' jest wymagane." });
            return;
        }
        const taskRef = firebase_init_1.db.collection("agent_tasks").doc();
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
        (0, agentV3_1.runAgent3Logic)(data, taskRef);
    });
});
//# sourceMappingURL=index.js.map