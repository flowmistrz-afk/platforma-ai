#!/bin/bash
gcloud run deploy google-service-v2-agent \
    --source . \
    --region europe-west1 \
    --platform managed \
    --allow-unauthenticated \
    --min-instances 0 \
    --max-instances 20 \
    --cpu 1 \
    --memory 1Gi \
    --concurrency 80 \
    --timeout 300s \
    --set-env-vars PUPPETEER_SERVICE_URL="https://puppeteer-executor-service-567539916654.europe-west1.run.app/execute",SEARCH_API_KEY="AIzaSyB-JBDEV1SFG3qvZegHDreTwZZtF7JNn3k",SEARCH_ENGINE_CX="c629e5216f12d4698",CEIDG_API_KEY="eyJraWQiOiJjZWlkZyIsImFsZyI6IkhTNTEyIn0.eyJnaXZlbl9uYW1lIjoiTUFH மடங்குLE5BIiwicGVzZWwiOiI4MDEwMDQwODA4NyIsImlhdCI6MTc1OTgxODg3NiwiZmFtaWx5X25hbWUiOiJNT1NLSUVXSUNaIiwiY2xpZW50X2lkIjoiVVNFUi04MDEwMDQwODA4Ny1NQUd மடங்குLE5BLU1PU0tJRVdJWlMifQ.JHIDfIzwhnd8rAP8ST-xerWwMznHdyrpQB_GxmC7gpYLEG--QE9op3"
