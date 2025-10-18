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
// import { runAgent3Logic } from "./agentV3"; // Usunięto, ponieważ nie jest już używane
const firebase_init_1 = require("./firebase-init");
const admin = __importStar(require("firebase-admin"));
// Ten skrypt służy do testowania logiki agenta v3.
// Symuluje utworzenie zadania i uruchamia agenta.
async function testAgent() {
    const testQuery = {
        query: "Znajdź szczegółowe informacje o firmach świadczących usługi 'brukarz' w mieście Poznań, korzystając z portali Oferteo i Fixly. Wejdź na każdą znalezioną stronę, spróbuj znaleźć dane kontaktowe (telefon, e-mail) i zapisz je.",
    };
    const uid = "test-user-id"; // Mockowy identyfikator użytkownika
    console.log("Tworzenie nowego zadania w Firestore...");
    const taskRef = firebase_init_1.db.collection("agent_tasks").doc();
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
    // Usunięto bezpośrednie wywołanie runAgent3Logic.
    // Skrypt teraz tylko tworzy zadanie i kończy pracę.
    // Prawdziwa funkcja w chmurze podejmie to zadanie.
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
    }
    catch (e) {
        console.error("Błąd podczas zamykania aplikacji Firebase:", e);
    }
    process.exit(1);
});
//# sourceMappingURL=test-agent.js.map