import { Task, ScrapedData, SearchResult } from "../types";
import { db } from "../firebase-init";
import * as admin from "firebase-admin";
import { runEnricher } from "./enricher";
import { runGoogleSearch } from "./searcher";
import { runClassifier } from "./classifier";
import { scrapeCompanyWebsites, scrapePortalWebsites } from "./scraper";
import { runCeidgSearch } from "./ceidg-searcher";
import { enrichContacts } from "./contact-enricher";

// =================================================================================
// == DEFINICJA PRZEPŁYWU PRACY (WORKFLOW)
// =================================================================================

type DependencyType = 'AND' | 'OR';
const WORKFLOW_TEMPLATE: {id: string, dependsOn: string[], dependencyType?: DependencyType}[] = [
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

export async function runOrchestrator(taskId: string, taskData: Task) {
  console.log(`[Orchestrator] Przetwarzam zadanie ${taskId}. Obecny status: ${taskData.status}. Ukończone kroki: [${(taskData.completedSteps || []).join(', ')}]`);

  try {
    if (['completed', 'failed', 'paused', 'terminated', 'evaluating', 'waiting-for-user-selection'].includes(taskData.status)) {
      console.log(`[Orchestrator] Zadanie ${taskId} w stanie końcowym lub jest już przetwarzane. Zatrzymuję.`);
      return;
    }

    await db.collection("tasks").doc(taskId).update({ status: 'evaluating' });

    const logEntries: any[] = [];
    if (!taskData.completedSteps || taskData.completedSteps.length === 0) {
        const planMessage = `Rozpoczynam zadanie. Plan działania: [${(taskData.workflowSteps || []).join(' -> ')}]`;
        logEntries.push({ timestamp: new Date(), agent: "Orchestrator", message: planMessage });
    }

    const availableSteps = findNextAvailableSteps(taskData);
    
    if (availableSteps.length === 0) {
      const allWorkflowStepsCompleted = (taskData.workflowSteps || []).every(step => (taskData.completedSteps || []).includes(step));
      if (allWorkflowStepsCompleted) {
        await db.collection("tasks").doc(taskId).update({
          status: 'completed',
          logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), agent: "Orchestrator", message: "Zadanie pomyślnie ukończone." })
        });
      } else {
        await db.collection("tasks").doc(taskId).update({
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

    await db.collection("tasks").doc(taskId).update(updatePayload);
    console.log(`[Orchestrator] Zadanie ${taskId} zaktualizowane. Następny status: ${updatePayload['status']}.`);

  } catch (error) {
    console.error(`[Orchestrator] Błąd krytyczny w zadaniu ${taskId}:`, error);
    await db.collection("tasks").doc(taskId).update({
      status: "failed",
      logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), agent: "Orchestrator", message: `Błąd krytyczny: ${(error as Error).message}` })
    });
  }
}

// =================================================================================
// == FUNKCJE POMOCNICZE
// =================================================================================

function findNextAvailableSteps(taskData: Task): string[] {
  const { workflowSteps = [], completedSteps = [] } = taskData;
  const availableSteps: string[] = [];
  for (const stepId of workflowSteps) {
    if (completedSteps.includes(stepId)) continue;
    const stepTemplate = WORKFLOW_TEMPLATE.find(s => s.id === stepId);
    if (!stepTemplate) continue;
    if (stepTemplate.dependsOn.length === 0) {
      availableSteps.push(stepId);
      continue;
    }
    const dependenciesMet = stepTemplate.dependencyType === 'OR'
      ? stepTemplate.dependsOn.some(dep => completedSteps.includes(dep))
      : stepTemplate.dependsOn.every(dep => completedSteps.includes(dep));
    if (dependenciesMet) availableSteps.push(stepId);
  }
  return availableSteps;
}

async function executeStep(stepId: string, taskId: string, taskData: Task): Promise<{data: {[key: string]: any}, log: string | null}> {
  let data: {[key: string]: any} = {};
  let log: string | null = null;

  switch (stepId) {
    case 'enriching':
      const enrichedQuery = await runEnricher(taskId, taskData);
      data = {
        "query.identifiedService": enrichedQuery.identifiedService,
        "query.expandedKeywords": enrichedQuery.keywords,
        "query.pkdCodes": enrichedQuery.pkdCodes,
      };
      log = `Agent Wzbogacający zakończył pracę. Zidentyfikowana usługa: "${enrichedQuery.identifiedService}". Słowa kluczowe: [${enrichedQuery.keywords.join(', ')}]. Kody PKD: [${enrichedQuery.pkdCodes.join(', ')}]`;
      break;

    case 'ceidg-searching':
      // Faza 1: Wyszukiwanie "surowych" danych
      const rawCeidgResults = await runCeidgSearch(taskId, taskData.query);
      log = `Zakończono wyszukiwanie w CEIDG. Znaleziono ${rawCeidgResults.length} firm (po filtracji AI). Rozpoczynam wzbogacanie...`;

      if (rawCeidgResults.length > 0) {
        // Natychmiastowy zapis "surowych" wyników, aby były widoczne w UI
        await db.collection("tasks").doc(taskId).update({ 'results.ceidg-searching': rawCeidgResults });
      }

      // Faza 2: Wzbogacanie kontaktów
      const enrichedFirms = await enrichContacts(taskId, rawCeidgResults);
      data = { 'results.ceidg-searching': enrichedFirms };
      log = `Zakończono wyszukiwanie w CEIDG i proces wzbogacania. Ostatecznie przetworzono ${enrichedFirms.length} firm.`;
      break;

    case 'searching':
      const searchResults = await runGoogleSearch(taskId, taskData.query);
      data = { "intermediateData.googleSearchResults": searchResults };
      log = `Zakończono wyszukiwanie Google. Znaleziono ${searchResults.length} unikalnych linków.`;
      break;

    case 'classifying':
      if (!taskData.intermediateData?.googleSearchResults) throw new Error("Brak wyników wyszukiwania do klasyfikacji.");
      const classifiedLinks = await runClassifier(taskId, taskData.intermediateData.googleSearchResults);
      data = { "intermediateData.selectableLinks": classifiedLinks, status: 'waiting-for-user-selection' };
      log = `Sklasyfikowano linki. Strony firmowe: ${classifiedLinks.companyUrls.length}, Portale: ${classifiedLinks.portalUrls.length}. Oczekuję na wybór użytkownika.`;
      break;

    case 'scraping-firmowe':
      const companyUrls = (taskData.intermediateData?.classifiedLinks?.companyUrls || []).map((url: SearchResult) => url.link);
      let companyResults: ScrapedData[] = [];
      if (companyUrls.length > 0) {
        companyResults = await scrapeCompanyWebsites(taskId, companyUrls);
        if (companyResults.length > 0) {
            data = { 'results.scraping-firmowe': companyResults };
        }
      }
      log = `Zakończono scraping stron firmowych. Znaleziono ${companyResults.length} nowych kontaktów.`;
      break;

    case 'scraping-portale':
      const portalUrls = (taskData.intermediateData?.classifiedLinks?.portalUrls || []).map((url: SearchResult) => url.link);
      let portalResults: ScrapedData[] = [];
      if (portalUrls.length > 0) {
          portalResults = await scrapePortalWebsites(taskId, portalUrls);
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