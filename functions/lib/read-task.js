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
Object.defineProperty(exports, "__esModule", { value: true });
const firebase_init_1 = require("./firebase-init");
const admin = __importStar(require("firebase-admin"));
// Ten skrypt odczytuje konkretny dokument zadania z Firestore.
async function readTask() {
    const taskId = "bCq7dIuvYpp8C34feTnB"; // ID zadania z ostatniego testu
    console.log(`Odczytuję zadanie o ID: ${taskId} z Firestore...`);
    const taskRef = firebase_init_1.db.collection("agent_tasks").doc(taskId);
    const docSnap = await taskRef.get();
    if (!docSnap.exists) {
        console.log("Nie znaleziono dokumentu o tym ID.");
    }
    else {
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
    }
    catch (e) {
        // ignoruj błąd przy zamykaniu
    }
    process.exit(1);
});
//# sourceMappingURL=read-task.js.map