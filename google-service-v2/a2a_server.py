import os
import uvicorn
from google.adk.cli.fast_api import get_fast_api_app

if __name__ == "__main__":
    AGENTS_DIR = os.path.dirname(os.path.abspath(__file__))
    app = get_fast_api_app(
        agents_dir=AGENTS_DIR,
        allow_origins=["*"],
        web=True,
    )
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)