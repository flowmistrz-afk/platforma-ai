# main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.cloud import storage, bigquery
from google.oauth2 import service_account
from datetime import datetime
from dateutil.relativedelta import relativedelta
from pydantic import BaseModel
import logging
import re
from typing import List, Optional

# --- Logging ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Models ---
class UploadRequest(BaseModel):
    filename: str

class ProcessRequest(BaseModel):
    filename: str

# --- FastAPI ---
app = FastAPI(title="File Processing Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- GCP Config ---
GCS_BUCKET_NAME = "platforma-ai-pliki-csv-do-przetworzenia"
BQ_PROJECT_ID = "automatyzacja-pesamu"
BQ_DATASET_ID = "pozwolenia_na_budowe"
BQ_TABLE_ID = "dane_z_plikow_csv"
KEY_FILE_PATH = "/gcp/sa-key"

# --- Clients ---
try:
    credentials = service_account.Credentials.from_service_account_file(KEY_FILE_PATH)
    storage_client = storage.Client(credentials=credentials)
    bq_client = bigquery.Client(credentials=credentials, project=BQ_PROJECT_ID)
except Exception as e:
    logger.critical(f"Brak klucza GCP: {e}")
    storage_client = bq_client = None

# --- BigQuery Schema (Final Version) ---
BQ_SCHEMA = [
    bigquery.SchemaField("numer_urzad", "STRING"),
    bigquery.SchemaField("nazwa_organu", "STRING"),
    bigquery.SchemaField("adres_organu", "STRING"),
    bigquery.SchemaField("data_wplywu_wniosku", "STRING"),
    bigquery.SchemaField("numer_decyzji_urzedu", "STRING"),
    bigquery.SchemaField("data_wydania_decyzji", "STRING"),
    bigquery.SchemaField("nazwa_inwestor", "STRING"),
    bigquery.SchemaField("wojewodztwo_z_pliku", "STRING"), # Renamed to avoid conflict
    bigquery.SchemaField("miasto", "STRING"),
    bigquery.SchemaField("terc", "STRING"),
    bigquery.SchemaField("cecha", "STRING"),
    bigquery.SchemaField("cecha_1", "STRING"),
    bigquery.SchemaField("ulica", "STRING"),
    bigquery.SchemaField("ulica_dalej", "STRING"),
    bigquery.SchemaField("nr_domu", "STRING"),
    bigquery.SchemaField("rodzaj_inwestycji", "STRING"),
    bigquery.SchemaField("kategoria", "STRING"),
    bigquery.SchemaField("nazwa_zamierzenia_bud", "STRING"),
    bigquery.SchemaField("nazwa_zam_budowlanego", "STRING"),
    bigquery.SchemaField("kubatura", "STRING"),
    bigquery.SchemaField("projektant_nazwisko", "STRING"),
    bigquery.SchemaField("projektant_imie", "STRING"),
    bigquery.SchemaField("projektant_numer_uprawnien", "STRING"),
    bigquery.SchemaField("jednosta_numer_ew", "STRING"),
    bigquery.SchemaField("obreb_numer", "STRING"),
    bigquery.SchemaField("numer_dzialki", "STRING"),
    bigquery.SchemaField("numer_arkusza_dzialki", "STRING"),
    bigquery.SchemaField("jednostka_stara_numeracja_z_wniosku", "STRING"),
    bigquery.SchemaField("stara_numeracja_obreb_z_wniosku", "STRING"),
    bigquery.SchemaField("stara_numeracja_dzialka_z_wniosku", "STRING"),
    bigquery.SchemaField("data_przetworzenia", "TIMESTAMP"), # Parsed and validated date
    bigquery.SchemaField("wojewodztwo", "STRING"), # From filename
]

# --- Helper: Find date column ---
def find_date_column(sample_lines: List[str]) -> Optional[int]:
    pattern = re.compile(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}')
    best_col, best_count = None, 0
    col_counts = {}
    for line in sample_lines:
        parts = line.split('#')
        for idx, part in enumerate(parts):
            if pattern.fullmatch(part.strip()):
                col_counts[idx] = col_counts.get(idx, 0) + 1
                if col_counts[idx] > best_count:
                    best_count, best_col = col_counts[idx], idx
    return best_col if best_count > 5 else None

# --- Endpoints ---
@app.get("/list-files/")
async def list_files():
    # ... (code is identical to previous version, omitted for brevity)
    if not storage_client: raise HTTPException(status_code=500, detail="No storage")
    try:
        bucket = storage_client.bucket(GCS_BUCKET_NAME)
        blobs = bucket.list_blobs()
        return {"files": [b.name for b in blobs if b.name.lower().endswith('.csv')]}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))


@app.post("/get-upload-url/")
async def get_upload_url(request: UploadRequest):
    # ... (code is identical to previous version, omitted for brevity)
    if not storage_client: raise HTTPException(status_code=500, detail="No storage")
    if not request.filename.lower().endswith('.csv'): raise HTTPException(status_code=400, detail="Only CSV")
    try:
        bucket = storage_client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob(request.filename)
        url = blob.generate_signed_url(version="v4", expiration=900, method="PUT", content_type="text/csv")
        return {"upload_url": url, "filename": request.filename}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/process-file/")
async def process_file(request: ProcessRequest):
    if not storage_client or not bq_client: raise HTTPException(status_code=500, detail="GCP not ready")

    filename = request.filename
    wojewodztwo_from_filename = filename.replace('.csv', '').strip()
    total_loaded = 0
    date_format = '%Y-%m-%d %H:%M:%S'
    six_months_ago = datetime.now() - relativedelta(months=6)

    try:
        bucket = storage_client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob(filename)
        if not blob.exists(): raise HTTPException(status_code=404, detail="File not found")

        # --- 1. Get sample to detect date column, skipping header ---
        sample_lines = []
        with blob.open("r", encoding="utf-8") as download_stream:
            for i, line in enumerate(download_stream):
                if i == 0: continue
                if i > 100: break
                sample_lines.append(line)

        date_column_idx = find_date_column(sample_lines)
        if date_column_idx is None: raise HTTPException(status_code=400, detail="Could not find a valid date column.")
        logger.info(f"Detected date column at index: {date_column_idx}")

        # --- 2. Process the file stream ---
        table_ref = bq_client.dataset(BQ_DATASET_ID).table(BQ_TABLE_ID)
        try:
            bq_client.get_table(table_ref)
        except Exception:
            table = bigquery.Table(table_ref, schema=BQ_SCHEMA)
            bq_client.create_table(table)
            logger.info(f"Created new table {BQ_TABLE_ID} with the final schema.")

        batch = []
        batch_size = 1000
        with blob.open("r", encoding="utf-8") as stream:
            for line_num, line in enumerate(stream, 1):
                if line_num == 1: continue
                
                parts = [p.strip() for p in line.strip().split('#')]
                if len(parts) <= date_column_idx: continue

                try:
                    dt = datetime.strptime(parts[date_column_idx], date_format)
                    if dt < six_months_ago: continue
                except (ValueError, IndexError):
                    continue

                # --- Build the row with the final schema ---
                row = {
                    "numer_urzad": parts[0] if len(parts) > 0 else None,
                    "nazwa_organu": parts[1] if len(parts) > 1 else None,
                    "adres_organu": parts[2] if len(parts) > 2 else None,
                    "data_wplywu_wniosku": parts[3] if len(parts) > 3 else None,
                    "numer_decyzji_urzedu": parts[4] if len(parts) > 4 else None,
                    "data_wydania_decyzji": parts[5] if len(parts) > 5 else None,
                    "nazwa_inwestor": parts[6] if len(parts) > 6 else None,
                    "wojewodztwo_z_pliku": parts[7] if len(parts) > 7 else None,
                    "miasto": parts[8] if len(parts) > 8 else None,
                    "terc": parts[9] if len(parts) > 9 else None,
                    "cecha": parts[10] if len(parts) > 10 else None,
                    "cecha_1": parts[11] if len(parts) > 11 else None,
                    "ulica": parts[12] if len(parts) > 12 else None,
                    "ulica_dalej": parts[13] if len(parts) > 13 else None,
                    "nr_domu": parts[14] if len(parts) > 14 else None,
                    "rodzaj_inwestycji": parts[15] if len(parts) > 15 else None,
                    "kategoria": parts[16] if len(parts) > 16 else None,
                    "nazwa_zamierzenia_bud": parts[17] if len(parts) > 17 else None,
                    "nazwa_zam_budowlanego": parts[18] if len(parts) > 18 else None,
                    "kubatura": parts[19] if len(parts) > 19 else None,
                    "projektant_nazwisko": parts[20] if len(parts) > 20 else None,
                    "projektant_imie": parts[21] if len(parts) > 21 else None,
                    "projektant_numer_uprawnien": parts[22] if len(parts) > 22 else None,
                    "jednosta_numer_ew": parts[23] if len(parts) > 23 else None,
                    "obreb_numer": parts[24] if len(parts) > 24 else None,
                    "numer_dzialki": parts[25] if len(parts) > 25 else None,
                    "numer_arkusza_dzialki": parts[26] if len(parts) > 26 else None,
                    "jednostka_stara_numeracja_z_wniosku": parts[27] if len(parts) > 27 else None,
                    "stara_numeracja_obreb_z_wniosku": parts[28] if len(parts) > 28 else None,
                    "stara_numeracja_dzialka_z_wniosku": parts[29] if len(parts) > 29 else None,
                    "data_przetworzenia": dt.isoformat(),
                    "wojewodztwo": wojewodztwo_from_filename,
                }
                batch.append(row)

                if len(batch) >= batch_size:
                    errors = bq_client.insert_rows_json(table_ref, batch)
                    if errors: logger.error(f"BigQuery errors: {errors}")
                    else: total_loaded += len(batch)
                    batch = []

        if batch:
            errors = bq_client.insert_rows_json(table_ref, batch)
            if errors: logger.error(f"BigQuery errors on final batch: {errors}")
            else: total_loaded += len(batch)

        msg = f"Processed {filename}: loaded {total_loaded} rows."
        logger.info(msg)
        return {"message": msg, "rows_loaded": total_loaded}

    except Exception as e:
        logger.error(f"An error occurred: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
