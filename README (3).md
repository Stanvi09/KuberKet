# KuberKet: a farm-loan helper you can talk to

**Live app:** https://kuberket.onrender.com · **Demo:** [LinkedIn](https://www.linkedin.com/posts/tanvi-sadashiv-3713ba381_gnaniai-greatindianaiinternshipchallenge-activity-7525514175205453824-Cz6j) · [X](https://x.com/Tanvi_Sadashiv/status/2119753963423858854)

Built for the Great Indian AI Internship Challenge on **Gnani Prisma** and **Gnani Timbre**.

## The problem

Farm loans are sold in minutes ("instant approval, low interest, sign today"), but few farmers plan for the bad year: a failed crop or a hospital bill, with the instalment still due. In 2015, the last year NCRB recorded causes, debt was the biggest single reason for farmer suicides: 3,097 farmers, almost 4 in 10 ([source](https://countercurrents.org/2017/01/farmlands-developed-a-bit-more-into-farmer-graveyards-in-2015/)).

## The solution

KuberKet is a voice-first farm-loan companion. A farmer talks to it in Hindi, Hinglish or English, and it explains his monthly kist and what happens if income falls 25% or 40%, out loud, before he signs.

## How it uses Gnani AI

```
Farmer's voice → Gnani Prisma (speech to text) → KuberKet agent (reads every number back)
              → finance engine (tested Python) → Gnani Timbre (text to speech) → voice + charts
```

No AI ever invents a number: every rupee comes from a unit-tested Python engine.

## Key features

- Hands-free voice conversation, with every number confirmed
- Bad-year stress test and a month-by-month cash chart
- Ask about any chart or number, in Hindi or English
- KCC, PMFBY, PM-KISAN, AIF and SMAM compared on his own numbers

## What's next

Hindi and English today. Gnani Timbre already speaks 10 Indian languages, so Marathi, Tamil, Telugu and Bengali are next.

## Run it

Python 3.12+ and Node.js 20+. Put `GNANI_API_KEY=your_key` in `.env`, run `python -m pip install -r requirements.txt`, then `run.bat` (opens http://127.0.0.1:8000). Full technical notes: [TECHNICAL.md](TECHNICAL.md).

*KuberKet is education and decision support, not a bank, lawyer or financial adviser.*
