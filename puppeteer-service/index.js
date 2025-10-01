const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// Funkcja wykonawcza, która steruje przeglądarką
async function execute_puppeteer_action(action, params) {
    let browser = null;
    console.log(`Executing: ${action} with params:`, params);
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setDefaultNavigationTimeout(60000);

        let result;
        switch (action) {
            case "goToURL":
                await page.goto(params.url, { waitUntil: 'networkidle2' });
                result = { success: true, message: `Strona załadowana.` };
                break;
            case "typeText":
                await page.type(params.selector, params.text, { delay: 50 });
                result = { success: true, message: `Wpisano tekst.` };
                break;
            case "clickElement":
                await page.click(params.selector);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Poprawiona metoda czekania
                result = { success: true, message: `Kliknięto element.` };
                break;
            case "clickIfExists":
                // NOWE NARZĘDZIE: Próbuje kliknąć element, jeśli istnieje, ale nie zwraca błędu, jeśli go nie ma.
                // Idealne do zamykania banerów cookie.
                await page.click(params.selector).catch(() => console.log(`Element ${params.selector} not found, skipping click.`));
                result = { success: true, message: `Podjęto próbę kliknięcia w element '${params.selector}'.` };
                break;
            case "scrapeContent":
                if (params.selector) {
                    console.log(`Waiting for selector: ${params.selector}...`);
                    await page.waitForSelector(params.selector, { timeout: 30000 });
                } else {
                    console.log('Waiting for 5 seconds for dynamic content to load...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
                const content = await page.content();
                result = { success: true, content: content.substring(0, 40000) };
                break;
            case "lookAtPage":
                await new Promise(resolve => setTimeout(resolve, 2000)); // Dajmy stronie chwilę na załadowanie wszystkiego
                
                // Używamy page.evaluate, aby wykonać kod w kontekście przeglądarki
                const simplifiedDom = await page.evaluate(() => {
                    const interactiveElements = Array.from(document.querySelectorAll('a, button, input, textarea, select, [role="button"], [role="link"]'));
                    let content = "Oto co widzę na stronie:\n";
                    
                    interactiveElements.forEach((el, index) => {
                        let text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('value') || '').trim().substring(0, 100);
                        if (text) {
                            // Tworzymy unikalny atrybut do identyfikacji
                            const elementId = `agent-id-${index}`;
                            el.setAttribute('data-agent-id', elementId);

                            content += `- ${el.tagName.toUpperCase()}: \"${text}\" (selektor: [data-agent-id=\"${elementId}\"])\n`;
                        }
                    });
                    return content;
                });
                
                result = { success: true, simplifiedDom: simplifiedDom };
                break;
            default:
                throw new Error(`Nieznana akcja: ${action}`);
        }
        await browser.close();
        return result;
    } catch (error) {
        if (browser) await browser.close();
        console.error(`Puppeteer Action Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// Serwer Express, który nasłuchuje na polecenia
const app = express();
app.use(express.json());

// Endpoint, który będzie wywoływany przez naszą funkcję w chmurze
app.post('/execute', async (req, res) => {
    // Proste zabezpieczenie - sprawdzamy, czy żądanie ma specjalny nagłówek
    // WAŻNE: Zmień to hasło na własne, bezpieczne hasło!
    if (req.header('X-Internal-Secret') !== 'TWOJE_SUPER_TAJNE_HASLO') {
        return res.status(403).send('Forbidden');
    }

    const { action, params } = req.body;
    if (!action || !params) {
        return res.status(400).send('Brak "action" lub "params".');
    }
    const result = await execute_puppeteer_action(action, params);
    res.status(200).json(result);
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Puppeteer executor service listening on port ${port}`);
});
