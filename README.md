<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0F3D2E,55:1F6B4A,100:C9A227&height=210&section=header&text=KuberKet&fontSize=66&fontColor=FFF9E9&fontAlignY=36&desc=a%20farm-loan%20helper%20you%20can%20talk%20to&descSize=18&descAlignY=57&descColor=FFF9E9" width="100%" alt="KuberKet banner"/>

**Before a farmer signs a loan, KuberKet *tells him out loud* what his monthly kist is and what happens in a bad year.**

[![Live app](https://img.shields.io/badge/▶%20live%20app-kuberket.onrender.com-C9A227?style=for-the-badge&labelColor=0F3D2E)](https://kuberket.onrender.com)
[![Demo](https://img.shields.io/badge/demo-LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&labelColor=0F3D2E)](https://www.linkedin.com/posts/tanvi-sadashiv-3713ba381_gnaniai-greatindianaiinternshipchallenge-activity-7525514175205453824-Cz6j)
[![Demo](https://img.shields.io/badge/demo-X-000?style=for-the-badge&logo=x&labelColor=0F3D2E)](https://x.com/Tanvi_Sadashiv/status/2119753963423858854)

![Python](https://img.shields.io/badge/Python-3.12-1F6B4A?style=flat-square&logo=python&logoColor=FFF9E9)
![FastAPI](https://img.shields.io/badge/FastAPI-1F6B4A?style=flat-square&logo=fastapi&logoColor=FFF9E9)
![React](https://img.shields.io/badge/React%2019%20+%20TypeScript-1F6B4A?style=flat-square&logo=react&logoColor=FFF9E9)
![Vite](https://img.shields.io/badge/Vite-1F6B4A?style=flat-square&logo=vite&logoColor=FFF9E9)
![Tests](https://img.shields.io/badge/tests-321%20passing-C9A227?style=flat-square&labelColor=0F3D2E)

<sub>Built for the <b>Great Indian AI Internship Challenge</b> on <b>Gnani Prisma</b> (speech-to-text) and <b>Gnani Timbre</b> (text-to-speech).</sub>

</div>

---

## 🪙 Why this exists

Farm loans are sold in minutes: *"instant approval, low interest, sign today."* Almost nobody plans for the bad year, when the crop fails or there's a hospital bill and the instalment is still due.

In 2015, the last year NCRB recorded causes, **debt was the single biggest reason for farmer suicides: 3,097 farmers, almost 4 in 10** ([source](https://countercurrents.org/2017/01/farmlands-developed-a-bit-more-into-farmer-graveyards-in-2015/)).

KuberKet can't fix credit markets. It *can* make sure the farmer understands the numbers before he signs.

## 🗣️ What it does

A farmer **talks** to KuberKet in **Hindi, Hinglish or English**. It asks for his numbers one at a time, reads every number back to confirm it, then explains:

- 💸 **His monthly kist** and how much money he has left each month
- 🌧️ **A bad-year stress test**: what happens if income falls **25 %** or **40 %**
- 📅 **A month-by-month cash chart** that follows his crop calendar
- 🏛️ **Government schemes compared on his own numbers**: KCC, PMFBY, PM-KISAN, AIF and SMAM
- 📄 **His loan documents**: upload a PDF and ask what it says
- ❓ **"What does this chart mean?"** He can ask about any chart or number and get a spoken answer

## 🔒 The rule I built around

> **No AI ever invents a number.**

Every rupee KuberKet says comes from a **unit-tested Python finance engine**. The voice layer only turns speech into slots and slots back into speech. The maths never goes through a language model.

## 🏗️ Architecture

```mermaid
flowchart LR
    V["Farmer voice"] --> P["Gnani Prisma<br/>speech to text"]
    P --> A["Conversation agent<br/>slot filling + teach-back"]
    A --> F["Finance engine<br/>kist, stress test, cash flow"]
    A --> S["Schemes engine<br/>KCC, PMFBY, PM-KISAN, AIF, SMAM"]
    A --> D["Document service<br/>PDF text extraction"]
    F --> E["Explanation engine<br/>Hindi / English sentences"]
    S --> E
    E --> T["Gnani Timbre<br/>text to speech"]
    T --> UI["Voice + charts<br/>React UI"]
```

| Module | Responsibility |
|---|---|
| `finance_engine.py` | EMI (kist) maths, affordability status, income-shock scenarios, monthly cash flow by crop calendar |
| `schemes_engine.py` · `schemes_data.py` | Evaluates each scheme against the farmer's own cash flow and shows the change in risk |
| `conversation_agent.py` | Rule-based slot filling in a fixed order, number confirmation (teach-back) |
| `explanation_engine.py` · `narration.py` | Every user-facing sentence in Hindi and English |
| `documents_service.py` | Session-only PDF text extraction with hard limits (10 MB, 100 pages) |
| `gnani_client.py` | Prisma STT and Timbre TTS client |
| `api.py` | FastAPI app: sessions, conversation, numbers, charts, documents, voice |
| `frontend/` | React 19 + TypeScript + Vite: voice orb, results, year story, charts, documents |

## 🧪 Quality

| Suite | Count | Status |
|---|---|---|
| Backend (`pytest`) | **228** tests | ✅ all passing |
| Frontend (`vitest` + Testing Library) | **93** tests | ✅ all passing |

There are also dedicated **language-purity tests** (backend *and* frontend) that fail if a Hindi screen leaks English text, or the other way round.

## 🚀 Run it locally

Requirements: **Python 3.12+**, **Node.js 20+** and a Gnani API key.

```bash
git clone https://github.com/Stanvi09/KuberKet.git
cd KuberKet
echo GNANI_API_KEY=your_key > .env
python -m pip install -r requirements.txt
```

**Windows:** run `run.bat`. It builds the frontend on first run and opens http://127.0.0.1:8000

**macOS / Linux:**

```bash
(cd frontend && npm install && npm run build)
python -m uvicorn api:app --host 127.0.0.1 --port 8000
```

**Tests:**

```bash
python -m pytest tests -q
(cd frontend && npm test)
```

## 📁 Project structure

```
KuberKet/
├── api.py                    # FastAPI app & routes
├── finance_engine.py         # the maths (tested)
├── schemes_engine.py         # scheme comparison
├── schemes_data.py           # scheme rules & parameters
├── conversation_agent.py     # slot filling + teach-back
├── explanation_engine.py     # Hindi / English copy
├── narration.py              # chart & year narration
├── documents_service.py      # PDF extraction
├── gnani_client.py           # Prisma + Timbre client
├── config.py
├── tests/                    # 228 backend tests
├── frontend/                 # React + TS + Vite (93 tests)
│   └── src/{home,story,year}/
├── docs/                     # Gnani STT / TTS API notes
└── run.bat                   # one-click start on Windows
```

## 🔭 What's next

Hindi and English today. Gnani Timbre already speaks **10 Indian languages**, so **Marathi, Tamil, Telugu and Bengali** are next.

---

<div align="center">

Built by **Tanvi Sadashiv**
<br/>
<a href="https://www.linkedin.com/in/tanvi-sadashiv-3713ba381"><img src="https://img.shields.io/badge/LinkedIn-connect-0A66C2?style=flat-square&logo=linkedin" alt="LinkedIn"/></a>
<a href="https://x.com/Tanvi_Sadashiv"><img src="https://img.shields.io/badge/X-@Tanvi__Sadashiv-000?style=flat-square&logo=x" alt="X"/></a>
<a href="https://github.com/Stanvi09"><img src="https://img.shields.io/badge/GitHub-Stanvi09-181717?style=flat-square&logo=github" alt="GitHub"/></a>

<sub><i>KuberKet is education and decision support, not a bank, lawyer or financial adviser.</i></sub>

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:C9A227,45:1F6B4A,100:0F3D2E&height=100&section=footer" width="100%"/>

</div>
