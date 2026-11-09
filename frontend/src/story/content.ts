// Hindi copy for the landing story.
//
// The Teach-Back and conversation lines below are copied from
// explanation_engine.py (the strings the real app speaks). The Python test
// tests/test_story_content.py fails if they ever drift apart.

/** Teach-Back lines exactly as the app says them (explanation_engine.py). Checked by a Python test. */
export const teachBack = {
  question: "अगर फसल कम हुई, तो क्या कर्ज़ की किस्त फिर भी देनी होगी?",
  retry:
    "कोई बात नहीं। जैसे दुकान में बिक्री कम हो, तब भी दुकान का किराया देना पड़ता है। वैसे ही फसल कम हो, तब भी किस्त की तारीख पर किस्त देनी होती है।",
  retryQuestion: "क्या फसल कम होने पर भी किस्त देनी होगी?",
  finish: "कोई बात नहीं। यह बात बैंक से भी पूछ सकते हैं।",
  pass: "सही, खराब फसल से किस्त अपने-आप माफ़ नहीं होती।",
} as const;

export const teachBackEn = {
  question: "If the harvest is poor, will the loan instalment still need to be paid?",
  retry:
    "That is okay. If a shop has fewer sales, its rent still needs to be paid. In the same way, the instalment is due on its date even if the harvest is small.",
  retryQuestion: "If the harvest is poor, is the instalment still due?",
  finish: "That is okay. You can also ask the lender about this.",
  pass: "Correct. A poor harvest does not automatically cancel the instalment.",
} as const;

/** Hindi transcript. Each AI line is exactly what conversation_agent.py says (checked by a Python test). */
export const conversation = {
  welcome: "हम खेती के कर्ज़ और उसकी किस्त समझेंगे।",
  firstQuestion: "उपकरण (जैसे ट्रैक्टर) की कीमत कितनी है? रुपये में बताइए।",
  readback: "आपने बताया: उपकरण (जैसे ट्रैक्टर) की कीमत 6,00,000 रुपये। सही है?",
  nextQuestion: "आप शुरू में कितने रुपये देंगे?",
  resultTail: "बैंक से किस्त और तारीख पक्की कर लें।",
} as const;

/** The same opening in English, also exactly what the agent says. */
export const conversationEn = {
  welcome: "Let's understand your farm loan and its instalment.",
  firstQuestion: "What is the price of the equipment, in rupees?",
  readback: "I understood: price of the equipment 6,00,000 rupees. Is that correct?",
  nextQuestion: "How much will you pay upfront, in rupees?",
  resultTail: "Confirm the exact instalment and its date with the lender.",
} as const;

export type PipelineNode = {
  id: string;
  title: string;
  sub: string;
  kind: "io" | "gnani" | "agent" | "engine";
  line: string;
};

export const pipelineNodes: PipelineNode[] = [
  { id: "voice", title: "किसान की आवाज़", sub: "हिंदी, हिंग्लिश, अंग्रेज़ी", kind: "io",
    line: "किसान अपनी भाषा में बोलता है, कोई फ़ॉर्म नहीं भरना पड़ता।" },
  { id: "prisma", title: "Gnani Prisma", sub: "आवाज़ से लिखे शब्द", kind: "gnani",
    line: "Gnani Prisma बोली हुई बात को लिखे हुए शब्दों में बदलता है।" },
  { id: "agent", title: "कुबेरकेत एजेंट", sub: "नियमों पर चलता है", kind: "agent",
    line: "सिर्फ़ वही पूछता है जो कम है, और हर रकम दोहराकर पक्का करता है।" },
  { id: "engine", title: "गणित इंजन", sub: "रकम यहीं बनती है, एआई से नहीं", kind: "engine",
    line: "रकम यहीं बनती है, एआई से नहीं। किस्त, कुल ब्याज और महीने-दर-महीने का हिसाब यहीं होता है।" },
  { id: "timbre", title: "Gnani Timbre", sub: "लिखे शब्दों से आवाज़", kind: "gnani",
    line: "Gnani Timbre जवाब को सरल आवाज़ में बोलकर सुनाता है।" },
  { id: "output", title: "आवाज़ + चार्ट", sub: "और समझ की जाँच का सवाल", kind: "io",
    line: "किसान सुनता है, चार्ट देखता है, फिर एक सवाल से अपनी समझ जाँचता है।" },
];

export const pipelineNodesEn: PipelineNode[] = [
  { id: "voice", title: "Farmer's voice", sub: "Hindi, Hinglish, English", kind: "io",
    line: "The farmer speaks in their own language. There is no form to fill." },
  { id: "prisma", title: "Gnani Prisma", sub: "Voice to text", kind: "gnani",
    line: "Gnani Prisma turns the spoken words into written text." },
  { id: "agent", title: "KuberKet agent", sub: "Follows fixed rules", kind: "agent",
    line: "It asks only for what is missing and repeats every amount to confirm it." },
  { id: "engine", title: "Maths engine", sub: "Numbers are made here, not by AI", kind: "engine",
    line: "Numbers are made here, not by AI. The instalment, total interest and month-by-month figures are all worked out here." },
  { id: "timbre", title: "Gnani Timbre", sub: "Text to voice", kind: "gnani",
    line: "Gnani Timbre speaks the answer in a simple voice." },
  { id: "output", title: "Voice + charts", sub: "and an understanding check", kind: "io",
    line: "The farmer listens, sees the charts, then checks their understanding with one question." },
];

