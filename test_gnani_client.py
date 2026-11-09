import argparse
from pathlib import Path

from gnani_client import GnaniAPIError, speak, transcribe


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Make one Prisma transcription and one Timbre speech request."
    )
    parser.add_argument("audio", nargs="?", default="test.m4a")
    parser.add_argument("--output", default="gnani_smoke_test.wav")
    args = parser.parse_args()

    try:
        transcript = transcribe(args.audio)
        print(f"Transcript: {transcript}")

        text = input("Text for Timbre (press Enter for a short Hindi sample): ").strip()
        if not text:
            text = "नमस्ते! आपकी किस्त हर महीने लगभग बारह हजार रुपये होगी।"
        audio = speak(text)

        output_path = Path(args.output)
        output_path.write_bytes(audio)
        print(f"TTS audio saved to {output_path}.")
    except GnaniAPIError as exc:
        print(f"Gnani request failed: {exc}")


if __name__ == "__main__":
    main()
