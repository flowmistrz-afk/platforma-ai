import { vertex_ai } from "../firebase-init";

const PUPPETEER_SERVICE_URL = process.env.PUPPETEER_SERVICE_URL;
const MAX_STEPS = 5;

async function callPuppeteer(action: string, params: any, sessionId: string): Promise<any> {
  if (!PUPPETEER_SERVICE_URL) throw new Error("Brak skonfigurowanego adresu URL usługi Puppeteer.");
  console.log(`[ContactScraper] -> Usługa Puppeteer: Akcja=${action}, Parametry=${JSON.stringify(params)}`);
  try {
    const response = await fetch(PUPPETEER_SERVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params, sessionId }),
    });
    if (!response.ok) throw new Error(`Usługa Puppeteer zwróciła błąd: ${response.status} ${await response.text()}`);
    return await response.json();
  } catch (error) {
    console.error(`[ContactScraper] Błąd krytyczny podczas komunikacji z usługą Puppeteer:`, error);
    throw error;
  }
}

function parseContentForContacts(pageContent: string): { emails: string[], phones: string[] } {
    if (!pageContent) return { emails: [], phones: [] };
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = pageContent.match(emailRegex) || [];
    const phoneRegex = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,3}\)?[-. ]?)?(?:\d{2,4}[-. ]?){2,4}\d{2,4}/g;
    const potentialPhones = pageContent.match(phoneRegex) || [];
    const phones = potentialPhones.map((p: string) => p.replace(/\D/g, ''))
                                  .filter((digits: string) => digits.length >= 9 && digits.length <= 15);
    return { emails: [...new Set(emails)], phones: [...new Set(phones)] };
}

async function getAiChoice(simplifiedDom: string, history: string[]): Promise<any> {
    const model = vertex_ai.getGenerativeModel({ model: "gemini-2.5-pro" });
    const prompt = `
    Jesteś ekspertem od web scrapingu. Twoim celem jest znalezienie adresu e-mail i numeru telefonu na stronie internetowej.
    Sterujesz przeglądarką za pomocą poleceń JSON.

    Oto co aktualnie widzisz na stronie (uproszczona lista interaktywnych elementów):
    \`\`\`
    ${simplifiedDom}
    \`\`\`

    Twoja historia akcji do tej pory:
    ${history.join('\n') || 'Brak'}

    Dostępne akcje:
    1. {"action": "findAndClick", "params": {"selector": "a", "text": "szukany tekst"}} - Znajduje link (<a>) zawierający podany tekst i klika go. Najlepsza metoda do nawigacji.
    2. {"action": "clickElement", "params": {"selector": "[data-agent-id=...]"}} - Klika w konkretny element. Używaj, jeśli 'findAndClick' nie jest odpowiednie.
    3. {"action": "typeText", "params": {"selector": "[data-agent-id=...]", "text": "tekst do wpisania"}} - Wpisuje tekst w pole formularza.
    4. {"action": "scrapeContent", "params": {}} - Pobiera całą zawartość strony. Użyj tej akcji, jeśli uważasz, że dane kontaktowe są na obecnej stronie.
    5. {"action": "finish", "params": {}} - Zakończ pracę, jeśli znalazłeś już dane, utknąłeś lub uważasz, że dane nie istnieją na tej stronie.

    Zadanie: Przeanalizuj powyższe dane i zdecyduj, którą akcję wykonać jako następną. Twoim priorytetem jest znalezienie strony "Kontakt". Użyj 'findAndClick' z tekstem "Kontakt" lub "Contact". Jeśli nie ma takiego linku, ale widzisz obiecujące elementy, użyj 'clickElement'. Jeśli jesteś na właściwej stronie, użyj 'scrapeContent'.

    Zwróć **wyłącznie** obiekt JSON z następną akcją do wykonania. Nie dodawaj żadnych innych słów ani formatowania.
    `;
    try {
        const result = await model.generateContent(prompt);
        const responseText = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = responseText.match(/{[\s\S]*}/);
        if (!jsonMatch) throw new Error("AI nie zwróciło poprawnego JSONa.");
        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.error("[ContactScraper-AI] Błąd podczas podejmowania decyzji przez AI:", error);
        return { action: 'finish', params: {} };
    }
}

async function performScrapingStep(sessionId: string, history: string[]): Promise<{ foundContacts: { emails: string[], phones: string[] }, nextAction: any }> {
    const view = await callPuppeteer('lookAtPage', {}, sessionId);
    if (!view || !view.simplifiedDom) {
        console.log("[ContactScraper] Nie udało się uzyskać widoku strony.");
        return { foundContacts: { emails: [], phones: [] }, nextAction: { action: 'finish' } };
    }
    const aiDecision = await getAiChoice(view.simplifiedDom, history);
    console.log(`[ContactScraper-AI] Decyzja AI: ${JSON.stringify(aiDecision)}`);
    if (aiDecision.action === 'scrapeContent') {
        const contentResult = await callPuppeteer('scrapeContent', {}, sessionId);
        const contacts = parseContentForContacts(contentResult.content);
        return { foundContacts: contacts, nextAction: { action: 'finish' } };
    }
    return { foundContacts: { emails: [], phones: [] }, nextAction: aiDecision };
}

export async function scrapeContactDetails(url: string): Promise<{ emails: string[], phones: string[] }> {
    const sessionId = Math.random().toString(36).substring(7);
    let allContacts: { emails: string[], phones: string[] } = { emails: [], phones: [] };
        const history: string[] = [];
    
        try {
            // Normalizacja URL przed użyciem
            let normalizedUrl = url;
            if (!normalizedUrl.startsWith('http')) {
                normalizedUrl = 'https://' + normalizedUrl;
            }
    
            await callPuppeteer('goToURL', { url: normalizedUrl }, sessionId);
            history.push(`1. Przejście do ${normalizedUrl}`);
        for (let step = 0; step < MAX_STEPS; step++) {
            const { foundContacts, nextAction } = await performScrapingStep(sessionId, history);
            allContacts.emails.push(...foundContacts.emails);
            allContacts.phones.push(...foundContacts.phones);
            if (nextAction.action === 'finish' || (allContacts.emails.length > 0 && allContacts.phones.length > 0)) {
                console.log("[ContactScraper] Kończę pracę - cel osiągnięty lub AI zdecydowało o zakończeniu.");
                break;
            }
            await callPuppeteer(nextAction.action, nextAction.params, sessionId);
            history.push(`${step + 2}. Wykonano akcję: ${nextAction.action} z parametrami: ${JSON.stringify(nextAction.params)}`);
        }
    } catch (error) {
        console.error(`[ContactScraper] Błąd w głównej pętli scrapującej dla URL ${url}:`, error);
    } finally {
        console.log(`[ContactScraper] Zamykanie sesji Puppeteer: ${sessionId}`);
        await callPuppeteer('closeSession', {}, sessionId).catch(err => console.error("Błąd podczas zamykania sesji", err));
    }
    return {
        emails: [...new Set(allContacts.emails)],
        phones: [...new Set(allContacts.phones)],
    };
}
