// Every word on the story page, in Hindi and in English. A page in one language never shows the other.
// Brand and product names (KuberKet, Gnani Prisma, Gnani Timbre) are names and stay as written.

export type StoryLang = "hi" | "en";

/** A heading with one emphasised word: before <em>em</em> after. */
export type Heading = { before: string; em: string; after: string };

export const storyCopy = {
  hi: {
    skipLink: "मुख्य सामग्री पर जाएँ",
    brandLabel: "कुबेरकेत, कहानी के शुरू में जाएँ",
    navLabel: "कहानी के हिस्से",
    nav: { how: "कैसे काम करता है", pipeline: "पाइपलाइन", year: "साल की कहानी", teach: "समझ की जाँच" },
    languageLabel: "भाषा",
    skip: "छोड़ें",
    openApp: "ऐप खोलें",
    badge: "Gnani Prisma + Timbre पर बना",
    heroTitle: { before: "किस्त ", em: "समझिए", after: ", कर्ज़ से पहले" } as Heading,
    heroLead: "अपनी भाषा में बोलिए। कुबेरकेत किस्त का हिसाब लगाकर आपको सरल आवाज़ में समझाता है।",
    startVoice: "बोलकर शुरू करें",
    seeDemo: "डेमो किसान देखें",
    scrollCue: "नीचे कहानी देखें",

    trustTitle: { before: "भरोसे की ", em: "बातें", after: "" } as Heading,
    ledgerHead: ["क्र.", "बात", "हिसाब"],
    ledger: (testCount: number) => [
      { what: "हर रकम", detail: "किस्त, ब्याज और महीने का हिसाब गणित इंजन करता है। एआई कोई अंक नहीं बनाता।", entry: "गणित इंजन" },
      { what: "भाषा", detail: "समझाना हिंदी और अंग्रेज़ी में। बोलने में हिंग्लिश भी चलेगी।", entry: "हिंदी · अंग्रेज़ी" },
      { what: "आपकी जानकारी", detail: "आधार, पैन, पासवर्ड, पिन या बैंक लॉगिन कभी नहीं माँगते।", entry: "कभी नहीं" },
      { what: "जाँच", detail: "हर बदलाव पर अपने-आप चलने वाले टेस्ट गणित और शब्दों को परखते हैं।", entry: testCount > 0 ? `${testCount}+ टेस्ट` : "अपने-आप टेस्ट" },
      { what: "डेमो किसान", detail: "रामू काल्पनिक है। सभी संख्याएँ नमूना हैं।", entry: "काल्पनिक" },
    ],
    stamp: "जाँचा गया",

    howTitle: { before: "कैसे ", em: "काम", after: " करता है" } as Heading,
    steps: [
      { title: "बोलिए", text: "अपनी भाषा में बोलिए। Gnani Prisma आपकी आवाज़ को लिखे शब्दों में बदलता है, और कुबेरकेत हर रकम दोहराकर पूछता है कि सही है या नहीं।" },
      { title: "हिसाब", text: "किस्त, कुल ब्याज और कमाई घटने पर क्या होगा, यह सब गणित इंजन निकालता है। कोई एआई अंदाज़ा नहीं लगाता।" },
      { title: "सुनिए", text: "Gnani Timbre जवाब बोलकर सुनाता है, साथ में चार्ट दिखते हैं। आख़िर में एक छोटा सवाल पूछकर देखा जाता है कि बात समझ आई या नहीं।" },
    ],

    pipelineTitle: { before: "आवाज़ से आवाज़ तक: ", em: "पाइपलाइन", after: "" } as Heading,
    pipelineLead: "किसी भी पड़ाव पर टैप करें या कीबोर्ड से चुनें। सुनहरा बिंदु दिखाता है कि बात कैसे आगे बढ़ती है।",
    pipelineStatus: "चुने हुए पड़ाव की जानकारी",

    yearTitle: { before: "साल की ", em: "कहानी", after: "" } as Heading,
    yearLead: "रामू की डायरी पढ़िए, फिर स्लाइडर से कमाई घटाइए। डायरी और चार्ट साथ बदलते हैं। हर संख्या गणित इंजन से आती है।",
    yearTag: "डेमो किसान · काल्पनिक, असली किसान नहीं",
    yearHeading: "रामू की साल की कहानी",

    teachTitle: { before: "समझे या नहीं? ", em: "समझ की जाँच", after: "" } as Heading,
    teachLead: "समझाने के बाद कुबेरकेत एक छोटा सवाल पूछता है। जवाब गलत हो तो डाँटता नहीं, एक आसान मिसाल से फिर समझाता है।",

    chatTitle: { before: "बातचीत, ", em: "आपकी", after: " भाषा में" } as Heading,
    chatLead: "कुबेरकेत सिर्फ़ वही पूछता है जो कम है, हर रकम दोहराकर पक्का करता है, और तभी हिसाब बनाता है। हिंदी और अंग्रेज़ी में।",

    trustLabel: "भरोसा और सीमाएँ",
    trustStrip: ["शिक्षा के लिए है, बैंक की सलाह नहीं", "आधार, पैन, पासवर्ड या पिन कभी नहीं माँगते", "डेमो डेटा काल्पनिक है"],
    footerLine: "यह शिक्षा के लिए है, बैंक की सलाह नहीं।",
    footerSmall: "रामू एक काल्पनिक डेमो किसान है। सभी संख्याएँ नमूना हैं और किसी असली व्यक्ति का डेटा नहीं हैं। कर्ज़ की शर्तें हमेशा अपने बैंक या ऋणदाता से पक्की करें।",

    hero: {
      label: "एक किसान फ़ोन पर कुबेरकेत की बात सुन रहा है और तुरंत लोन का शोर मचाते एजेंटों को अनसुना कर रहा है",
      exchanges: [
        { shout: "तुरंत लोन!", reply: "जल्दी नहीं। पहले किस्त देखिए।" },
        { shout: "कोई कागज़ नहीं!", reply: "शर्तें लिखित में माँगिए।" },
        { shout: "कम ब्याज!", reply: "कितना? कुल ब्याज पूछिए।" },
        { shout: "आज ही साइन करो!", reply: "फसल से पहले किस्त कैसे भरेंगे?" },
      ],
    },

    teach: {
      tag: "समझ की जाँच",
      answerGroup: "अपना जवाब चुनिए",
      yes: "हाँ, देनी होगी",
      no: "नहीं, माफ़ हो जाएगी",
      again: "फिर से देखें",
    },

    diary: {
      wait: "रामू की डायरी खुल रही है…",
      stripLabel: "रामू के साल के 12 महीने",
      tones: { save: "बचत से", harvest: "कमाई", ok: "ठीक", short: "पैसा कम" },
      chapter: (n: number) => `अध्याय ${n}`,
      loanTitle: "कर्ज़ लिया",
      kistNote: "हर महीने की किस्त",
      loanLine: (price: string | null, down: string | null, loan: string, rate: number | null, tenure: number | null) =>
        `${price && down ? `${price} का उपकरण, ${down} पहले दिए। ` : ""}बाकी ${loan} कर्ज़${rate !== null ? `, ${rate}% ब्याज` : ""}${tenure !== null ? `, ${tenure} साल` : ""}।`,
      beforeTitle: "फसल से पहले",
      beforeNote: (months: number) => `${months} महीने, कमाई नहीं`,
      beforeLine: (months: number, kist: string, other: string) =>
        `यह पैसा बचत से जाएगा: ${months} किस्तें ${kist} और घर-खेती का खर्च ${other}। फसल से पहले इतना जुटाकर रखना होगा।`,
      harvestTitle: "फसल आई",
      harvestNote: (months: string) => `${months} में`,
      monthJoin: " और ",
      harvestLine: (drop: number) => `${drop > 0 ? `कमाई ${drop}% कम मानकर। ` : ""}साल की पूरी कमाई इन्हीं महीनों में आती है, किस्त हर महीने जाती है।`,
      endTitle: "साल का अंत",
      endNote: (up: boolean) => (up ? "शुरुआत से ज़्यादा" : "शुरुआत से कम"),
      endLine: (shortMonths: number) =>
        shortMonths === 0 ? "फसल का पैसा पूरे साल चलता है।" : `फसल के बाद ${shortMonths} महीने हाथ में शुरुआत से कम पैसा रहता है।`,
    },

    thread: {
      name: "कुबेरकेत",
      sub: "आवाज़ से बातचीत · नमूना",
      langGroup: "बातचीत की भाषा",
      listLabel: "बातचीत का नमूना",
      foot: "बीच के कुछ सवाल छोड़े गए · डेमो डेटा",
    },
  },

  en: {
    skipLink: "Skip to main content",
    brandLabel: "KuberKet, back to the top of the story",
    navLabel: "Story sections",
    nav: { how: "How it works", pipeline: "Pipeline", year: "Year story", teach: "Understanding check" },
    languageLabel: "Language",
    skip: "Skip",
    openApp: "Open the app",
    badge: "Built on Gnani Prisma + Timbre",
    heroTitle: { before: "", em: "Understand", after: " the instalment before the loan" } as Heading,
    heroLead: "Speak in your own language. KuberKet works out the instalment and explains it to you in a simple voice.",
    startVoice: "Start by speaking",
    seeDemo: "See the demo farmer",
    scrollCue: "Scroll down to the story",

    trustTitle: { before: "Why you can ", em: "trust", after: " it" } as Heading,
    ledgerHead: ["No.", "Point", "Entry"],
    ledger: (testCount: number) => [
      { what: "Every amount", detail: "The instalment, interest and month-by-month figures come from the maths engine. AI never makes up a number.", entry: "Maths engine" },
      { what: "Language", detail: "Explanations in Hindi and English. You can also speak in Hinglish.", entry: "Hindi · English" },
      { what: "Your details", detail: "We never ask for Aadhaar, PAN, passwords, PINs or bank logins.", entry: "Never" },
      { what: "Checks", detail: "Automatic tests check the maths and the wording on every change.", entry: testCount > 0 ? `${testCount}+ tests` : "Automatic tests" },
      { what: "Demo farmer", detail: "Ramu is made up. All numbers are samples.", entry: "Made up" },
    ],
    stamp: "Checked",

    howTitle: { before: "How it ", em: "works", after: "" } as Heading,
    steps: [
      { title: "Speak", text: "Speak in your own language. Gnani Prisma turns your voice into text, and KuberKet repeats every amount back to check it is right." },
      { title: "Calculate", text: "The instalment, total interest and what happens if income falls are all worked out by the maths engine. No AI guesses." },
      { title: "Listen", text: "Gnani Timbre speaks the answer while the charts appear. At the end, one short question checks that it made sense." },
    ],

    pipelineTitle: { before: "Voice in, voice out: the ", em: "pipeline", after: "" } as Heading,
    pipelineLead: "Tap any stage or choose it with the keyboard. The gold dot shows how your words move through the app.",
    pipelineStatus: "About the selected stage",

    yearTitle: { before: "A year, ", em: "month by month", after: "" } as Heading,
    yearLead: "Read Ramu's diary, then lower his income with the slider. The diary and the chart change together. Every number comes from the maths engine.",
    yearTag: "Demo farmer · made up, not a real farmer",
    yearHeading: "Ramu's year",

    teachTitle: { before: "Did it make sense? ", em: "Understanding check", after: "" } as Heading,
    teachLead: "After explaining, KuberKet asks one short question. A wrong answer is never scolded; it explains again with a simple example.",

    chatTitle: { before: "A conversation in ", em: "your", after: " language" } as Heading,
    chatLead: "KuberKet asks only for what is missing, repeats every amount to confirm it, and only then does the maths. In Hindi and English.",

    trustLabel: "Trust and limits",
    trustStrip: ["For learning, not bank advice", "Never asks for Aadhaar, PAN, passwords or PINs", "Demo data is made up"],
    footerLine: "This is for learning, not bank advice.",
    footerSmall: "Ramu is a made-up demo farmer. All numbers are samples and are not anyone's real data. Always confirm loan terms with your bank or lender.",

    hero: {
      label: "A farmer listens to KuberKet on his phone and ignores loan agents shouting instant-loan offers",
      exchanges: [
        { shout: "Instant loan!", reply: "No rush. Check the instalment first." },
        { shout: "No paperwork!", reply: "Ask for the terms in writing." },
        { shout: "Low interest!", reply: "How low? Ask for the total interest." },
        { shout: "Sign today!", reply: "How will you pay before harvest?" },
      ],
    },

    teach: {
      tag: "Understanding check",
      answerGroup: "Choose your answer",
      yes: "Yes, it is still due",
      no: "No, it is waived",
      again: "Try again",
    },

    diary: {
      wait: "Opening Ramu's diary…",
      stripLabel: "The 12 months of Ramu's year",
      tones: { save: "From savings", harvest: "Income", ok: "Fine", short: "Short" },
      chapter: (n: number) => `Chapter ${n}`,
      loanTitle: "Took the loan",
      kistNote: "instalment every month",
      loanLine: (price: string | null, down: string | null, loan: string, rate: number | null, tenure: number | null) =>
        `${price && down ? `Equipment worth ${price}, ${down} paid upfront. ` : ""}The remaining ${loan} is a loan${rate !== null ? ` at ${rate}% interest` : ""}${tenure !== null ? ` for ${tenure} years` : ""}.`,
      beforeTitle: "Before harvest",
      beforeNote: (months: number) => `${months} months, no income`,
      beforeLine: (months: number, kist: string, other: string) =>
        `This comes from savings: ${months} instalments, ${kist} in total, and ${other} of household and farm costs. Keep this much ready before harvest.`,
      harvestTitle: "Harvest comes in",
      harvestNote: (months: string) => `in ${months}`,
      monthJoin: " and ",
      harvestLine: (drop: number) => `${drop > 0 ? `With income ${drop}% lower. ` : ""}The whole year's income arrives in these months; the instalment is due every month.`,
      endTitle: "End of the year",
      endNote: (up: boolean) => (up ? "more than at the start" : "less than at the start"),
      endLine: (shortMonths: number) =>
        shortMonths === 0
          ? "The harvest money lasts the whole year."
          : `After harvest, there is less money in hand than at the start for ${shortMonths} month${shortMonths === 1 ? "" : "s"}.`,
    },

    thread: {
      name: "KuberKet",
      sub: "Voice conversation · sample",
      langGroup: "Conversation language",
      listLabel: "Sample conversation",
      foot: "Some questions skipped · demo data",
    },
  },
};
