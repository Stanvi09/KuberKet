import os, requests
from dotenv import load_dotenv

load_dotenv()
key = os.getenv("GNANI_API_KEY")

for lang in ["hi-IN", "indic-auto"]:
    with open("test.m4a", "rb") as f:
        r = requests.post(
            "https://api.vachana.ai/stt/v3",
            headers={"X-API-Key-ID": key},
            files={"audio_file": ("test.m4a", f)},
            data={"model": "prisma-v3.0", "language_code": lang},
            timeout=60,
        )
    print(lang, r.status_code, r.text)