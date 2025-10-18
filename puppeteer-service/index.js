const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const sessions = new Map(); // Przechowuje sesje przeglądarki w formacie { browser, page, lastAccessed }

// Funkcja do okresowego czyszczenia starych sesji (zapobiega wyciekom pamięci)
const
// Funkcja pomocnicza do naprawiania typowych błędów w formacie URL
normalizeUrl = (url) => {
    if (!url) return url;
    let correctedUrl = url.trim();

    // Poprawia błędy typu "https.www.example.com" na "https://www.example.com"
    if (correctedUrl.startsWith('http.') || correctedUrl.startsWith('https.')) {
        correctedUrl = correctedUrl.replace('.', '://');
    }

    // Jeśli brakuje protokołu, dodaj "https://" jako domyślny
    if (!/^(https?:\/\/)/i.test(correctedUrl)) {
        correctedUrl = 'https://' + correctedUrl;
    }
    
    return correctedUrl;
};

setInterval(() => {
    const now = Date.now();
    for (const [sessionId, sessionData] of sessions.entries()) {
        // Usuń sesje nieaktywne przez ponad 10 minut
        if (now - sessionData.lastAccessed > 10 * 60 * 1000) {
            console.log(`Sesja ${sessionId} wygasła. Czyszczenie...`);
            sessionData.browser.close().catch(err => console.error(`Błąd podczas zamykania przeglądarki dla sesji ${sessionId}:`, err));
            sessions.delete(sessionId);
        }
    }
}, 60 * 1000); // Uruchamiaj co minutę

async function handlePuppeteerAction(action, params, sessionId) {
    if (!sessionId) {
        throw new Error("Wymagany jest identyfikator sesji (sessionId).");
    }

    let session = sessions.get(sessionId);

    // Jeśli sesja nie istnieje, utwórz nową
    if (!session) {
        console.log(`Tworzenie nowej sesji dla ID: ${sessionId}`);
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        const page = await browser.newPage();
        // Ustawiamy realistyczny User-Agent, aby ominąć podstawowe zabezpieczenia (np. Cloudflare)
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 800 });
        await page.setDefaultNavigationTimeout(60000); // Zwiększony timeout nawigacji
        
        session = { browser, page, lastAccessed: Date.now() };
        sessions.set(sessionId, session);
    }

    // Zaktualizuj czas ostatniego dostępu
    session.lastAccessed = Date.now();
    const { page, browser } = session;

    try {
        let result;
        switch (action) {
            case "closeSession":
                console.log(`Jawne zamykanie sesji: ${sessionId}`);
                await browser.close();
                sessions.delete(sessionId);
                result = { success: true, message: `Sesja ${sessionId} została zamknięta.` };
                break;
            case "goToURL":
                const normalizedUrl = normalizeUrl(params.url);
                console.log(`Nawiguję do znormalizowanego URL: ${normalizedUrl}`);
                await page.goto(normalizedUrl, { waitUntil: 'networkidle2' });
                result = { success: true, message: `Strona załadowana.` };
                break;
            case "typeText":
                await page.type(params.selector, params.text, { delay: 50 });
                result = { success: true, message: `Wpisano tekst.` };
                break;
            case "clickElement":
                 // Czekaj na nawigację, która może być wynikiem kliknięcia
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => console.log("Brak nawigacji po kliknięciu lub timeout.")),
                    page.click(params.selector),
                ]);
                result = { success: true, message: `Kliknięto element.` };
                break;
            case "clickIfExists":
                await page.click(params.selector).catch(() => console.log(`Element ${params.selector} nie znaleziony, pomijam kliknięcie.`));
                result = { success: true, message: `Podjęto próbę kliknięcia w element '${params.selector}'.` };
                break;
            case "scrapeContent":
                if (params.selector) {
                    await page.waitForSelector(params.selector, { timeout: 30000 });
                } else {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
                const content = await page.content();
                result = { success: true, content: content.substring(0, 40000) };
                break;
            case "lookAtPage":
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const simplifiedDom = await page.evaluate(() => {
                    const isVisible = (elem) => !!(elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length);
                    const interactiveElements = Array.from(document.querySelectorAll('a, button, input, textarea, select, [role="button"], [role="link"]'));
                    let content = "Oto co widzę na stronie:\n";
                    
                    interactiveElements.forEach((el) => {
                        if (isVisible(el)) {
                            const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('value') || '').trim();
                            if (text) {
                                const elementId = `agent-id-${Math.random().toString(36).slice(2, 10)}`;
                                el.setAttribute('data-agent-id', elementId);
                                content += `- ${el.tagName.toUpperCase()}: "${text.substring(0, 100)}" (selektor: [data-agent-id="${elementId}"])\n`;
                            }
                        }
                    });
                    return content;
                });
                
                result = { success: true, simplifiedDom: simplifiedDom };
                break;
            case "waitForSelectors": {
                const { selectors, timeout = 15000 } = params;
                if (!Array.isArray(selectors) || selectors.length === 0) {
                    throw new Error("Akcja 'waitForSelectors' wymaga tablicy 'selectors'.");
                }
                await page.waitForSelector(selectors.join(', '), { visible: true, timeout });
                result = { success: true, message: `Pojawił się jeden z oczekiwanych selektorów.` };
                break;
            }

            // === DODAJ TEN NOWY BLOK ===
            case "findAndClick": {
                const { selector, text, timeout = 30000 } = params;
                
                // Znajdź wszystkie elementy pasujące do selektora (np. 'a' dla linków)
                const elements = await page.$$(selector);
                let clicked = false;
                for (const element of elements) {
                    const innerText = await page.evaluate(el => el.innerText.toLowerCase(), element);
                    if (innerText.includes(text.toLowerCase())) {
                        console.log(`Znaleziono pasujący element: "${innerText}". Klikam...`);
                        await Promise.all([
                            page.waitForNavigation({ waitUntil: 'networkidle2', timeout }).catch(() => console.log("Brak nawigacji po kliknięciu lub timeout.")),
                            element.click()
                        ]);
                        clicked = true;
                        break; // Przerywamy pętlę po pierwszym znalezieniu
                    }
                }
                result = { success: true, clicked };
                break;
            }
            // ==========================

            default:
                throw new Error(`Nieznana akcja: ${action}`);
        }
        return result;
    } catch (error) {
        console.error(`Błąd akcji Puppeteer w sesji ${sessionId}: ${error.message}`);
        // W przypadku błędu nie zamykaj przeglądarki, agent może chcieć spróbować ponownie
        return { success: false, error: error.message };
    }
}

// Serwer Express
const app = express();
app.use(express.json({ limit: '50mb' }));

app.post('/execute', async (req, res) => {
    // Usunięto weryfikację sekretu na żądanie użytkownika.
    const { action, params, sessionId } = req.body;
    if (!action || !params || !sessionId) {
        return res.status(400).send('Pola "action", "params" oraz "sessionId" są wymagane.');
    }
    
    try {
        const result = await handlePuppeteerAction(action, params, sessionId);
        res.status(200).json(result);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Usługa wykonawcza Puppeteer nasłuchuje na porcie ${port}`);
});