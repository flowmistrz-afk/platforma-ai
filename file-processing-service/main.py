from fastapi import FastAPI, File, UploadFile
import pandas as pd

app = FastAPI()

@app.post("/uploadfile/")
async def create_upload_file(file: UploadFile = File(...)):
    try:
        # Read the CSV file with '#' delimiter
        df = pd.read_csv(file.file, sep='#', encoding='utf-8', low_memory=False)

        # Filter data for the current year (assuming a 'rok' or similar column exists)
        # This is a placeholder, the actual column name might be different
        # We will need to inspect the CSV to find the correct column name
        current_year = pd.to_datetime('today').year
        if 'DATA_ZATWIERDZENIA' in df.columns:
            df['DATA_ZATWIERDZENIA'] = pd.to_datetime(df['DATA_ZATWIERDZENIA'], errors='coerce')
            df_filtered = df[df['DATA_ZATWIERDZENIA'].dt.year == current_year]
        else:
            # If the column is not found, return the first 5 rows as a sample
            df_filtered = df.head(5)

        # Return the first 5 rows of the filtered data as JSON
        return df_filtered.to_dict(orient='records')

    except Exception as e:
        return {"error": str(e)}
