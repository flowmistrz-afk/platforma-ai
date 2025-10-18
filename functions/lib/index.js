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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.resumeWithSelection = exports.inviteUser = exports.agentOrchestratorTrigger = exports.createNewTask = void 0;
// Force redeploy: 2025-10-16 20:20:00
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const v2_1 = require("firebase-functions/v2");
const admin = __importStar(require("firebase-admin"));
const firebase_init_1 = require("./firebase-init");
const orchestrator_1 = require("./agents/orchestrator");
(0, v2_1.setGlobalOptions)({ region: "europe-west1" });
exports.createNewTask = (0, https_1.onRequest)({ cors: true }, async (request, response) => {
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
    const { initialQuery, city, province, workflowSteps } = request.body;
    if (!initialQuery || !city || !province) {
        response.status(400).json({ error: "Pola 'initialQuery', 'city' oraz 'province' są wymagane." });
        return;
    }
    try {
        const taskRef = await firebase_init_1.db.collection("tasks").add({
            ownerId: uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'pending',
            query: {
                initialQuery: initialQuery,
                location: {
                    city: city,
                    province: province,
                    radiusKm: 50
                }
            },
            logs: [{
                    timestamp: new Date(),
                    agent: 'System',
                    message: 'Zadanie utworzone przez AGENT wersja PRO.'
                }],
            results: [],
            workflowSteps: workflowSteps && workflowSteps.length > 0 ? workflowSteps : ['enriching', 'ceidg-searching', 'searching', 'classifying', 'waiting-for-user-selection', 'scraping-firmowe', 'scraping-portale', 'aggregating']
        });
        response.status(200).json({ success: true, taskId: taskRef.id });
    }
    catch (error) {
        console.error("Błąd podczas tworzenia nowego zadania:", error);
        response.status(500).json({ success: false, error: "Błąd serwera podczas tworzenia zadania." });
    }
});
exports.agentOrchestratorTrigger = (0, firestore_1.onDocumentWritten)({ document: "tasks/{taskId}", secrets: ["CEIDG_API_KEY", "GEMINI_API_KEY"] }, async (event) => {
    var _a;
    if (!((_a = event.data) === null || _a === void 0 ? void 0 : _a.after.exists)) {
        console.log(`[Trigger] Dokument ${event.params.taskId} został usunięty. Ignoruję.`);
        return;
    }
    const taskDataBefore = event.data.before.data();
    const taskDataAfter = event.data.after.data();
    if (taskDataBefore && taskDataBefore.status === taskDataAfter.status) {
        console.log(`[Trigger] Status zadania ${event.params.taskId} nie zmienił się. Ignoruję.`);
        return;
    }
    const taskId = event.params.taskId;
    try {
        await (0, orchestrator_1.runOrchestrator)(taskId, taskDataAfter);
    }
    catch (error) {
        console.error(`[Trigger] Błąd krytyczny w zadaniu ${taskId}:`, error);
        await firebase_init_1.db.collection("tasks").doc(taskId).update({
            status: "failed",
            logs: admin.firestore.FieldValue.arrayUnion({
                timestamp: new Date(),
                agent: "System-Trigger",
                message: `Błąd krytyczny: ${error.message}`,
            }),
        });
    }
});
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
exports.resumeWithSelection = (0, https_1.onCall)(async (request) => {
    var _a;
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Musisz być zalogowany, aby wykonać tę operację.");
    }
    const { taskId, selectedLinks } = request.data;
    if (!taskId || !selectedLinks) {
        throw new https_1.HttpsError("invalid-argument", "Pola 'taskId' oraz 'selectedLinks' są wymagane.");
    }
    try {
        const taskRef = firebase_init_1.db.collection("tasks").doc(taskId);
        const taskDoc = await taskRef.get();
        if (!taskDoc.exists) {
            throw new https_1.HttpsError("not-found", "Zadanie o podanym ID nie istnieje.");
        }
        if (((_a = taskDoc.data()) === null || _a === void 0 ? void 0 : _a.ownerId) !== request.auth.uid) {
            throw new https_1.HttpsError("permission-denied", "Nie masz uprawnień do modyfikacji tego zadania.");
        }
        await taskRef.update({
            'intermediateData.classifiedLinks': selectedLinks,
            'intermediateData.selectableLinks': admin.firestore.FieldValue.delete(),
            'status': 'pending',
            'logs': admin.firestore.FieldValue.arrayUnion({
                timestamp: new Date(),
                agent: 'UserInteraction',
                message: `Użytkownik wybrał ${selectedLinks.companyUrls.length} stron firmowych i ${selectedLinks.portalUrls.length} portali do analizy. Wznawiam pracę.`
            })
        });
        return { success: true, message: "Zadanie wznowione." };
    }
    catch (error) {
        console.error("Błąd podczas wznawiania zadania:", error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        throw new https_1.HttpsError("internal", "Wystąpił nieoczekiwany błąd serwera.");
    }
});
//# sourceMappingURL=index.js.map