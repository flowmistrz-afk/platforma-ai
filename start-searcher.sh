#!/bin/bash

# Przejdź do katalogu serwisu
cd ceidg-firm-searcher-service

# venvShellHook (z replit.nix) automatycznie aktywuje venv.
# My musimy tylko zainstalować zależności.
echo "Installing dependencies for searcher..."
pip install -r requirements.txt

# Uruchom aplikację na porcie 8080
echo "Starting CEIDG Firm Searcher on port 8080..."
python -m uvicorn main:app --host 0.0.0.0 --port 8080
