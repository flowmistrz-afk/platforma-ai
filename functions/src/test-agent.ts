import { runAgent3Logic } from "./agentV3";
import { db } from "./firebase-init";
import * as admin from "firebase-admin";

// Ten skrypt służy do testowania logiki agenta v3.
// Symuluje utworzenie zadania i uruchamia agenta.

async function testAgent() {
const testQuery = {
    query: "Znajdź szczegółowe informacje o firmach świadczących usługi 'brukarz' w mieście Poznań, korzystając z portali Oferteo i Fixly. Wejdź na każdą znalezioną stronę, spróbuj znaleźć dane kontaktowe (telefon, e-mail) i zapisz je.",
  };

  const uid = "test-user-id"; // Mockowy identyfikator użytkownika

  console.log("Tworzenie nowego zadania w Firestore...");

  const taskRef = db.collection("agent_tasks").doc();

  await taskRef.set({
    ownerUid: uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    status: "processing",
    query: testQuery,
    agentVersion: "v3-test-script",
    logs: [{ timestamp: new Date(), message: "Test zainicjowany przez skrypt test-agent.ts." }],
    results: [],
  });

  console.log(`Zadanie utworzone z ID: ${taskRef.id}`);
  console.log("Uruchamianie logiki agenta... Skrypt zakończy działanie.");
  console.log("Możesz monitorować zadanie w konsoli Firebase lub za pomocą logów.");

  // Czekamy na zakończenie całej logiki agenta, aby zobaczyć pełne wykonanie w teście.
  await runAgent3Logic(testQuery, taskRef);

  // Czekamy chwilę, aby upewnić się, że operacje asynchroniczne zostały zainicjowane
  // zanim skrypt zakończy działanie.
  await new Promise(resolve => setTimeout(resolve, 3000));
}

testAgent().then(async () => {
  console.log("Skrypt testowy zakończył pracę.");
  // Zamykamy połączenie z Firebase, aby skrypt mógł się czysto zakończyć.
  await admin.app().delete();
  process.exit(0);
}).catch(async (error) => {
  console.error("Skrypt testowy napotkał błąd:", error);
  try {
    await admin.app().delete();
  } catch (e) {
    console.error("Błąd podczas zamykania aplikacji Firebase:", e);
  }
  process.exit(1);
});
