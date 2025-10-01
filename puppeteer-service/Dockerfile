# Krok 1: Użyj oficjalnego obrazu Puppeteer
FROM ghcr.io/puppeteer/puppeteer:22.10.0

# Krok 2: Ustaw środowisko pracy
WORKDIR /usr/src/app

# Krok 3: Skopiuj pliki package.json i package-lock.json
COPY package*.json ./

# Krok 4: Zmień właściciela skopiowanych plików i całego katalogu roboczego
USER root
RUN chown -R pptruser:pptruser /usr/src/app
USER pptruser

# Krok 5: Teraz uruchom npm install jako właściwy użytkownik
RUN npm install

# Krok 6: Skopiuj resztę kodu aplikacji
COPY index.js ./

# Krok 7: Uruchom serwer, gdy kontener wystartuje
CMD [ "npm", "start" ]
