# KuberKet

A voice-first farm-loan companion for Indian farmers. The farmer says what the loan is for (equipment such as a
tractor, a borewell or irrigation setup, dairy animals or livestock, or anything else) and speaks in Hindi, Hinglish,
English. KuberKet asks only for what is missing, a deterministic Python engine does every calculation, and the answer is
spoken back in simple language with charts. A Teach-Back question checks that the farmer understood.

**KuberKet is education and decision support. It is not a bank, lawyer or financial adviser.**

## How it works

```
Farmer's voice -> Gnani Prisma (speech to text) -> rule-based conversation agent
              -> deterministic finance engine (Python) -> explanation text
              -> Gnani Timbre (text to speech) -> voice + charts + Teach-Back
```

* **Gnani Prisma v3.0** turns the recorded voice into text (`gnani_client.py`).
* **Gnani Timbre v3.0** speaks every reply (`gnani_client.py`, with a small in-memory cache to save credits).
* **Loan purpose** (equipment, irrigation, livestock, other) is picked on the home screen or detected from what the
  farmer says first (for example "borewell"). It only changes the wording; the maths is the same for every purpose.
* **`conversation_agent.py`** is rule-based: it reads numbers from Hindi, Hinglish and English, remembers answers,
  reads each value back for confirmation, and runs the Teach-Back loop.
* **`finance_engine.py`** (`calculate_farm_loan`) is pure Python with unit tests: one EMI schedule plus income-drop
  stress tests that work for any farm term loan. Crop loans repaid in one lump sum at harvest are not covered yet. **No AI ever calculates or invents a number.**
* **`explanation_engine.py`** holds all user-facing wording in one place.
* **`api.py`** is a FastAPI server that also serves the built React app in `frontend/`.

## Run it (Windows)

1. Install Python 3.12+ and Node.js 20+.
2. Put your Gnani key in a file named `.env` in this folder (never share or commit it):
   `GNANI_API_KEY=your_key_here`
3. Install Python packages once: `python -m pip install -r requirements.txt`
4. Start everything: `run.bat`  (opens http://127.0.0.1:8000)

After changing frontend code, run `run.bat rebuild`.

## Tests

* Python: `python -m pytest tests -q`
* Frontend: `cd frontend` then `npm test`

## Safety

* Hypothetical numbers are labelled; farmers are told to confirm terms with their lender.
* KuberKet never asks for Aadhaar, PAN, passwords, PINs or bank logins.
* No promises of returns and no claims that a loan will cause loss of land.
* Demo data is synthetic and clearly labelled.

## Crop-based year story and Schemes page

- **Crops:** Paddy, Wheat, Maize. Typical sowing and harvest months live in `finance_engine.CROP_CALENDARS` (the app's copy in `frontend/src/year/text.ts` is checked against it by a test). They are typical, not official: real dates vary by place and year.
- **Cash flow:** `finance_engine.monthly_cashflow` puts yearly income only in harvest months, charges costs and kist every month, and tracks cash from a savings figure assumed to be zero (labelled as an assumption). It returns normal, 25% lower and 40% lower income.
- **Year chart and "साल की कहानी":** `frontend/src/year/` (chart, slider, Play with pause/stop, ask-about-chart). Sentences come from `narration.py`, built only from engine outputs. Play calls Timbre one sentence at a time (`/api/cashflow/speak`); if voice fails it keeps going with captions only.
- **Schemes page:** `schemes_data.py` (facts, each with a source URL and the date read, 2026-11-09) and `schemes_engine.py` (what each of KCC, AIF, SMAM, PMFBY, PM-KISAN changes on the farmer's numbers). The page shows computed differences, not advice.
- **Known limits:** Schemes page is Hindi and English. KCC interest support is confirmed for FY 2025-26 only. PM-KISAN eligibility rules come from an older FAQ. One SMAM cap (2WD 20–40 HP, other farmers) is derived from a scanned table. AIF pages do not clearly cover tractors. PMFBY claim amounts are not calculated.

## Talking to KuberKet (Home)

- Choose **Speak** or **Type** before starting, and switch at any point. In Speak mode KuberKet answers in voice, opens the mic again by itself after each question (turn that off with the tick box) and sends what you said when you pause. Type mode plays no sound and spends no voice credit.
- Choose the speaking speed (slow / normal / fast).
- When all the details are in, the chat disappears and three numbered steps appear: 1 your results, 2 the year story, 3 a one-question understanding check. In Speak mode KuberKet explains the results, plays the year story month by month, then asks the question and listens. Tap any tab to take over.
- **Check voice** (on the first screen) tests the browser microphone, Gnani Timbre (voice) and Gnani Prisma (listening) and says which one is broken. If the page says no key was found, put `GNANI_API_KEY=...` in `.env` next to `api.py` and restart the server.
- Only Hindi and English are offered.
