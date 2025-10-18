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
exports.runOrchestrator = runOrchestrator;
const firebase_init_1 = require("../firebase-init");
const admin = __importStar(require("firebase-admin"));
const enricher_1 = require("./enricher");
const searcher_1 = require("./searcher");
const classifier_1 = require("./classifier");
const scraper_1 = require("./scraper");
const ceidg_searcher_1 = require("./ceidg-searcher");
const contact_enricher_1 = require("./contact-enricher");
const WORKFLOW_TEMPLATE = [
    { id: 'enriching', dependsOn: [] },
    // Ścieżka Google
    { id: 'searching', dependsOn: ['enriching'] },
    { id: 'classifying', dependsOn: ['searching'] },
    { id: 'scraping-firmowe', dependsOn: ['classifying'] },
    { id: 'scraping-portale', dependsOn: ['classifying'] },
    // Ścieżka CEIDG
    { id: 'ceidg-searching', dependsOn: ['enriching'] },
    // Krok końcowy
    { id: 'aggregating', dependsOn: ['scraping-firmowe', 'scraping-portale', 'ceidg-searching'], dependencyType: 'OR' },
];
// =================================================================================
// == GŁÓWNY ORKIESTRATOR
// =================================================================================
async function runOrchestrator(taskId, taskData) {
    console.log(`[Orchestrator] Przetwarzam zadanie ${taskId}. Obecny status: ${taskData.status}. Ukończone kroki: [${(taskData.completedSteps || []).join(', ')}]`);
    try {
        if (['completed', 'failed', 'paused', 'terminated', 'evaluating', 'waiting-for-user-selection'].includes(taskData.status)) {
            console.log(`[Orchestrator] Zadanie ${taskId} w stanie końcowym lub jest już przetwarzane. Zatrzymuję.`);
            return;
        }
        await firebase_init_1.db.collection("tasks").doc(taskId).update({ status: 'evaluating' });
        const logEntries = [];
        if (!taskData.completedSteps || taskData.completedSteps.length === 0) {
            const planMessage = `Rozpoczynam zadanie. Plan działania: [${(taskData.workflowSteps || []).join(' -> ')}]`;
            logEntries.push({ timestamp: new Date(), agent: "Orchestrator", message: planMessage });
        }
        const availableSteps = findNextAvailableSteps(taskData);
        if (availableSteps.length === 0) {
            const allWorkflowStepsCompleted = (taskData.workflowSteps || []).every(step => (taskData.completedSteps || []).includes(step));
            if (allWorkflowStepsCompleted) {
                await firebase_init_1.db.collection("tasks").doc(taskId).update({
                    status: 'completed',
                    logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), agent: "Orchestrator", message: "Zadanie pomyślnie ukończone." })
                });
            }
            else {
                await firebase_init_1.db.collection("tasks").doc(taskId).update({
                    status: 'failed',
                    logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), agent: "Orchestrator", message: "Błąd: Zadanie utknęło, brak możliwych do wykonania kroków." })
                });
            }
            return;
        }
        const stepToExecute = availableSteps[0];
        console.log(`[Orchestrator] Wykonuję krok: ${stepToExecute}`);
        const stepResult = await executeStep(stepToExecute, taskId, taskData);
        const updatePayload = stepResult.data;
        const completionMessage = stepResult.log || `Krok '${stepToExecute}' został ukończony.`;
        logEntries.push({ timestamp: new Date(), agent: "Orchestrator", message: completionMessage });
        updatePayload['completedSteps'] = admin.firestore.FieldValue.arrayUnion(stepToExecute);
        if (!updatePayload.status) {
            updatePayload['status'] = 'pending';
        }
        updatePayload['logs'] = admin.firestore.FieldValue.arrayUnion(...logEntries);
        await firebase_init_1.db.collection("tasks").doc(taskId).update(updatePayload);
        console.log(`[Orchestrator] Zadanie ${taskId} zaktualizowane. Następny status: ${updatePayload['status']}.`);
    }
    catch (error) {
        console.error(`[Orchestrator] Błąd krytyczny w zadaniu ${taskId}:`, error);
        await firebase_init_1.db.collection("tasks").doc(taskId).update({
            status: "failed",
            logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), agent: "Orchestrator", message: `Błąd krytyczny: ${error.message}` })
        });
    }
}
// =================================================================================
// == FUNKCJE POMOCNICZE
// =================================================================================
function findNextAvailableSteps(taskData) {
    const { workflowSteps = [], completedSteps = [] } = taskData;
    const availableSteps = [];
    for (const stepId of workflowSteps) {
        if (completedSteps.includes(stepId))
            continue;
        const stepTemplate = WORKFLOW_TEMPLATE.find(s => s.id === stepId);
        if (!stepTemplate)
            continue;
        if (stepTemplate.dependsOn.length === 0) {
            availableSteps.push(stepId);
            continue;
        }
        const dependenciesMet = stepTemplate.dependencyType === 'OR'
            ? stepTemplate.dependsOn.some(dep => completedSteps.includes(dep))
            : stepTemplate.dependsOn.every(dep => completedSteps.includes(dep));
        if (dependenciesMet)
            availableSteps.push(stepId);
    }
    return availableSteps;
}
async function executeStep(stepId, taskId, taskData) {
    var _a, _b, _c, _d, _e;
    let data = {};
    let log = null;
    switch (stepId) {
        case 'enriching':
            const enrichedQuery = await (0, enricher_1.runEnricher)(taskId, taskData);
            data = {
                "query.identifiedService": enrichedQuery.identifiedService,
                "query.expandedKeywords": enrichedQuery.keywords,
                "query.pkdCodes": enrichedQuery.pkdCodes,
            };
            log = `Agent Wzbogacający zakończył pracę. Zidentyfikowana usługa: "${enrichedQuery.identifiedService}". Słowa kluczowe: [${enrichedQuery.keywords.join(', ')}]. Kody PKD: [${enrichedQuery.pkdCodes.join(', ')}]`;
            break;
        case 'ceidg-searching':
            // Faza 1: Wyszukiwanie "surowych" danych
            const rawCeidgResults = await (0, ceidg_searcher_1.runCeidgSearch)(taskId, taskData.query);
            log = `Zakończono wyszukiwanie w CEIDG. Znaleziono ${rawCeidgResults.length} firm (po filtracji AI). Rozpoczynam wzbogacanie...`;
            if (rawCeidgResults.length > 0) {
                // Natychmiastowy zapis "surowych" wyników, aby były widoczne w UI
                await firebase_init_1.db.collection("tasks").doc(taskId).update({ 'results.ceidg-searching': rawCeidgResults });
            }
            // Faza 2: Wzbogacanie kontaktów
            const enrichedFirms = await (0, contact_enricher_1.enrichContacts)(taskId, rawCeidgResults);
            data = { 'results.ceidg-searching': enrichedFirms };
            log = `Zakończono wyszukiwanie w CEIDG i proces wzbogacania. Ostatecznie przetworzono ${enrichedFirms.length} firm.`;
            break;
        case 'searching':
            const searchResults = await (0, searcher_1.runGoogleSearch)(taskId, taskData.query);
            data = { "intermediateData.googleSearchResults": searchResults };
            log = `Zakończono wyszukiwanie Google. Znaleziono ${searchResults.length} unikalnych linków.`;
            break;
        case 'classifying':
            if (!((_a = taskData.intermediateData) === null || _a === void 0 ? void 0 : _a.googleSearchResults))
                throw new Error("Brak wyników wyszukiwania do klasyfikacji.");
            const classifiedLinks = await (0, classifier_1.runClassifier)(taskId, taskData.intermediateData.googleSearchResults);
            data = { "intermediateData.selectableLinks": classifiedLinks, status: 'waiting-for-user-selection' };
            log = `Sklasyfikowano linki. Strony firmowe: ${classifiedLinks.companyUrls.length}, Portale: ${classifiedLinks.portalUrls.length}. Oczekuję na wybór użytkownika.`;
            break;
        case 'scraping-firmowe':
            const companyUrls = (((_c = (_b = taskData.intermediateData) === null || _b === void 0 ? void 0 : _b.classifiedLinks) === null || _c === void 0 ? void 0 : _c.companyUrls) || []).map((url) => url.link);
            let companyResults = [];
            if (companyUrls.length > 0) {
                companyResults = await (0, scraper_1.scrapeCompanyWebsites)(taskId, companyUrls);
                if (companyResults.length > 0) {
                    data = { 'results.scraping-firmowe': companyResults };
                }
            }
            log = `Zakończono scraping stron firmowych. Znaleziono ${companyResults.length} nowych kontaktów.`;
            break;
        case 'scraping-portale':
            const portalUrls = (((_e = (_d = taskData.intermediateData) === null || _d === void 0 ? void 0 : _d.classifiedLinks) === null || _e === void 0 ? void 0 : _e.portalUrls) || []).map((url) => url.link);
            let portalResults = [];
            if (portalUrls.length > 0) {
                portalResults = await (0, scraper_1.scrapePortalWebsites)(taskId, portalUrls);
                if (portalResults.length > 0) {
                    data = { 'results.scraping-portale': portalResults };
                }
            }
            log = `Zakończono scraping portali. Znaleziono ${portalResults.length} nowych kontaktów.`;
            break;
        case 'aggregating':
            log = `Proces zbierania danych został zakończony.`;
            break;
        default:
            log = `[OSTRZEŻENIE] Nieznany krok do wykonania: ${stepId}`;
            break;
    }
    return { data, log };
}
//# sourceMappingURL=orchestrator.js.map