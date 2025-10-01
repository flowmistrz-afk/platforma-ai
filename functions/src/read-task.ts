import { db } from "./firebase-init";
import * as admin from "firebase-admin";

// Ten skrypt odczytuje konkretny dokument zadania z Firestore.

async function readTask() {
  const taskId = "bCq7dIuvYpp8C34feTnB"; // ID zadania z ostatniego testu
  console.log(`Odczytuję zadanie o ID: ${taskId} z Firestore...`);

  const taskRef = db.collection("agent_tasks").doc(taskId);
  const docSnap = await taskRef.get();

  if (!docSnap.exists) {
    console.log("Nie znaleziono dokumentu o tym ID.");
  } else {
    console.log("Dane dokumentu:");
    console.log(JSON.stringify(docSnap.data(), null, 2));
  }
}

readTask().then(async () => {
  console.log("\nSkrypt odczytujący zakończył pracę.");
  await admin.app().delete();
  process.exit(0);
}).catch(async (error) => {
  console.error("Skrypt odczytujący napotkał błąd:", error);
  try {
    await admin.app().delete();
  } catch (e) {
    // ignoruj błąd przy zamykaniu
  }
  process.exit(1);
});
