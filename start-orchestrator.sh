#!/bin/bash

# Przejdź do katalogu serwisu
cd agent-pro-max-service

# venvShellHook automatycznie aktywuje venv.
# My musimy tylko zainstalować zależności.
echo "Installing dependencies inside Nix venv..."
pip install -r requirements.txt

# Uruchom aplikację
echo "Starting orchestrator..."
python main.py
