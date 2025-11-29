const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const sessions = new Map(); // Przechowuje sesje: { browser, page, lastAccessed }

// --- HELPERY (INTELIGENCJA) ---

const normalizeUrl = (url) => {
    if (!url) return url;
    let correctedUrl = url.trim();
    if (correctedUrl.startsWith('http.') || correctedUrl.startsWith('https.')) {
        correctedUrl = correctedUrl.replace('.', '://');
    }
    if (!/^(https?:\/\/)/i.test(correctedUrl)) {
        correctedUrl = 'https://' + correctedUrl;
    }
    return correctedUrl;
};

// Funkcja symulująca ludzkie scrollowanie (dla Lazy Loading)
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 150; // Trochę szybciej
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                // Przewijamy max do końca lub do 15000 pikseli (żeby nie utknąć na infinite scroll)
                if (totalHeight >= scrollHeight - window.innerHeight || totalHeight > 15000) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

// Funkcja zabijająca modale cookies
async function dismissCookieModal(page) {
    try {
        const keywords = ['akceptuj', 'zgoda', 'zgadzam', 'accept', 'agree', 'ok', 'zamknij', 'przejdź', 'rozumiem'];
        await page.evaluate((keywords) => {
            // Szukamy przycisków, linków i divów, które wyglądają jak przyciski
            const elements = [...document.querySelectorAll('button, a, div[role="button"], input[type="submit"], input[type="button"]')];
            for (const el of elements) {
                const text = el.innerText.toLowerCase();
                // Sprawdzamy czy tekst pasuje i czy element jest widoczny
                if (keywords.some(k => text.includes(k)) && el.offsetParent !== null) {
                    el.click();
                    return; // Klikamy tylko pierwszy znaleziony
                }
            }
        }, keywords);
        // Czekamy chwilę na animację zamknięcia
        await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
        // Ignorujemy błędy (nie każda strona ma cookies)
    }
}

// --- CZYSZCZENIE SESJI ---
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, sessionData] of sessions.entries()) {
        if (now - sessionData.lastAccessed > 10 * 60 * 1000) { // 10 minut
            console.log(`Sesja ${sessionId} wygasła. Zamykam.`);
            sessionData.browser.close().catch(console.error);
            sessions.delete(sessionId);
        }
    }
}, 60000);

// --- GŁÓWNA LOGIKA ---
async function handlePuppeteerAction(action, params, sessionId) {
    if (!sessionId) throw new Error("Wymagany sessionId.");

    let session = sessions.get(sessionId);

    // Tworzenie nowej sesji
    if (!session) {
        console.log(`Start sesji: ${sessionId}`);
        const browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage', 
                '--disable-gpu',
                '--window-size=1920,1080' // Ważne dla RWD
            ]
        });
        const page = await browser.newPage();
        // User-Agent jak prawdziwy Chrome
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setDefaultNavigationTimeout(60000); // 60s timeout
        
        session = { browser, page, lastAccessed: Date.now() };
        sessions.set(sessionId, session);
    }

    session.lastAccessed = Date.now();
    const { page, browser } = session;

    try {
        let result;
        switch (action) {
            case "closeSession":
                await browser.close();
                sessions.delete(sessionId);
                result = { success: true, message: "Sesja zamknięta." };
                break;

            case "goToURL":
                const url = normalizeUrl(params.url);
                console.log(`Nawigacja do: ${url}`);
                // waitUntil: 'domcontentloaded' jest szybsze niż 'networkidle2'
                await page.goto(url, { waitUntil: 'domcontentloaded' });
                result = { success: true };
                break;

            // --- NOWA AKCJA: SMART SCRAPE ---
            case "smartScrape":
                console.log(`SmartScrape dla sesji ${sessionId}`);
                
                // 1. Próba zamknięcia Cookies (może przeładować stronę, więc czekamy chwilę)
                await dismissCookieModal(page);
                
                // 2. Przewijanie (ładuje leniwe treści)
                await autoScroll(page);
                
                // 3. Krótka pauza na dociągnięcie AJAX-ów
                await new Promise(r => setTimeout(r, 2000));
                
                // 4. Pobranie treści
                const smartContent = await page.content();
                result = { success: true, content: smartContent };
                break;
            // --------------------------------

            case "scrapeContent":
                if (params.selector) {
                    await page.waitForSelector(params.selector, { timeout: 10000 });
                }
                const content = await page.content();
                result = { success: true, content: content };
                break;

            case "typeText":
                await page.type(params.selector, params.text, { delay: 50 });
                result = { success: true };
                break;

            case "clickElement":
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}),
                    page.click(params.selector),
                ]);
                result = { success: true };
                break;

            case "clickIfExists":
                try {
                    await page.click(params.selector);
                    result = { success: true, message: "Kliknięto." };
                } catch {
                    result = { success: true, message: "Nie znaleziono, pominięto." };
                }
                break;

            default:
                throw new Error(`Nieznana akcja: ${action}`);
        }
        return result;
    } catch (error) {
        console.error(`Błąd w sesji ${sessionId}: ${error.message}`);
        // Nie zamykamy sesji przy błędzie (może user chce spróbować ponownie)
        return { success: false, error: error.message };
    }
}

const app = express();
// Zwiększamy limit JSON, bo strony HTML mogą być duże
app.use(express.json({ limit: '50mb' }));

app.post('/execute', async (req, res) => {
    const { action, params, sessionId } = req.body;
    
    if (!action || !sessionId) {
        return res.status(400).json({ error: 'Brak action lub sessionId' });
    }
    
    try {
        const result = await handlePuppeteerAction(action, params || {}, sessionId);
        res.status(200).json(result);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Puppeteer Executor (Smart) nasłuchuje na porcie ${port}`);
});