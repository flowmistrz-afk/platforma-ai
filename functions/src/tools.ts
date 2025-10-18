import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

/**
 * Pobiera treść tekstową z podanego URL-a.
 * @param url Pełny adres URL strony internetowej do pobrania.
 * @returns Treść tekstowa strony lub komunikat o błędzie.
 */
export async function webFetch(url: string): Promise<{textContent: string, links: {href: string, text: string}[]}> {
    console.log(`[webFetch Tool] Pobieram treść z URL: ${url}`);
    try {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            throw new Error(`Nieprawidłowy format URL. URL musi zaczynać się od http:// lub https://.`);
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Błąd HTTP podczas pobierania ${url}: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        let textContent: string;
        const links: {href: string, text: string}[] = [];

        if (contentType && contentType.includes('text/html')) {
            const html = await response.text();
            const $ = cheerio.load(html);

            $('script, style, noscript, iframe').remove();

            $('a').each((i, el) => {
                const href = $(el).attr('href');
                if (href && !href.startsWith('#')) {
                    links.push({ href, text: $(el).text().trim() });
                }
            });
            
            textContent = $('body').text();
            textContent = textContent.replace(/\s\s+/g, ' ').trim();
            textContent = textContent.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n');

        } else if (contentType && contentType.includes('text/plain')) {
            textContent = await response.text();
        } else {
            throw new Error(`Nieobsługiwany typ treści (${contentType}) z URL: ${url}`);
        }

        console.log(`[webFetch Tool] Zobaczona treść (skrócona):\n${textContent.substring(0, 500)}...`);

        const MAX_CONTENT_LENGTH = 8000;
        if (textContent.length > MAX_CONTENT_LENGTH) {
            textContent = textContent.substring(0, MAX_CONTENT_LENGTH) + "\n... (treść została skrócona)";
        }

        return { textContent, links };

    } catch (error: any) {
        console.error(`[webFetch Tool] Błąd podczas pobierania URL ${url}:`, error);
        throw error;
    }
}
