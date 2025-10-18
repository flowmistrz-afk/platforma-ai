// Force redeploy: 2025-10-16 20:20:00
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { db } from "./firebase-init";
import { Task } from "./types";
import { runOrchestrator } from "./agents/orchestrator";

setGlobalOptions({ region: "europe-west1" });

export const createNewTask = onRequest({ cors: true }, async (request, response) => {
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
    const { initialQuery, city, province, workflowSteps } = request.body;

    if (!initialQuery || !city || !province) {
        response.status(400).json({ error: "Pola 'initialQuery', 'city' oraz 'province' są wymagane." });
        return;
    }

    try {
        const taskRef = await db.collection("tasks").add({
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

    } catch (error) {
        console.error("Błąd podczas tworzenia nowego zadania:", error);
        response.status(500).json({ success: false, error: "Błąd serwera podczas tworzenia zadania." });
    }
});

export const agentOrchestratorTrigger = onDocumentWritten({ document: "tasks/{taskId}", secrets: ["CEIDG_API_KEY", "GEMINI_API_KEY"] }, async (event) => {
  if (!event.data?.after.exists) {
    console.log(`[Trigger] Dokument ${event.params.taskId} został usunięty. Ignoruję.`);
    return;
  }

  const taskDataBefore = event.data.before.data() as Task | undefined;
  const taskDataAfter = event.data.after.data() as Task;

  if (taskDataBefore && taskDataBefore.status === taskDataAfter.status) {
    console.log(`[Trigger] Status zadania ${event.params.taskId} nie zmienił się. Ignoruję.`);
    return;
  }
  
  const taskId = event.params.taskId;

  try {
    await runOrchestrator(taskId, taskDataAfter);
  } catch (error) {
    console.error(`[Trigger] Błąd krytyczny w zadaniu ${taskId}:`, error);
    await db.collection("tasks").doc(taskId).update({
      status: "failed",
      logs: admin.firestore.FieldValue.arrayUnion({
        timestamp: new Date(),
        agent: "System-Trigger",
        message: `Błąd krytyczny: ${(error as Error).message}`,
      }),
    });
  }
});

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

export const resumeWithSelection = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Musisz być zalogowany, aby wykonać tę operację."
    );
  }

  const { taskId, selectedLinks } = request.data;

  if (!taskId || !selectedLinks) {
    throw new HttpsError(
      "invalid-argument",
      "Pola 'taskId' oraz 'selectedLinks' są wymagane."
    );
  }

  try {
    const taskRef = db.collection("tasks").doc(taskId);
    const taskDoc = await taskRef.get();

    if (!taskDoc.exists) {
      throw new HttpsError("not-found", "Zadanie o podanym ID nie istnieje.");
    }
    
    if (taskDoc.data()?.ownerId !== request.auth.uid) {
         throw new HttpsError("permission-denied", "Nie masz uprawnień do modyfikacji tego zadania.");
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

  } catch (error) {
    console.error("Błąd podczas wznawiania zadania:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Wystąpił nieoczekiwany błąd serwera.");
  }
});
