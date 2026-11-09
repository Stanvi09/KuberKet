import os, requests
from dotenv import load_dotenv

load_dotenv()
key = os.getenv("GNANI_API_KEY")

r = requests.post(
    "https://api.vachana.ai/api/v1/tts/inference",
    headers={"X-API-Key-ID": key, "Content-Type": "application/json"},
    json={
        "text": "नमस्ते! आपकी किस्त हर महीने लगभग बारह हजार रुपये होगी।",
        "voice": "Shivani",
        "model": "timbre-v3.0",
        "language": "hi-IN",
        "speed": 1.0,
        "audio_config": {
            "sample_rate": 24000,
            "num_channels": 1,
            "sample_width": 2,
            "encoding": "linear_pcm",
            "container": "wav",
        },
    },
    timeout=60,
)

print("Status:", r.status_code)
if r.status_code == 200:
    with open("output.wav", "wb") as f:
        f.write(r.content)
    print("Saved output.wav - double-click it to listen")
else:
    print(r.text)