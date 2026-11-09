import { useCallback, useEffect, useRef, useState } from "react";

import { loadSession, updateSession } from "./api";
import type { AppSection, Language } from "./api";
import Home from "./home/Home";
import SchemesPage from "./schemes/SchemesPage";
import SpeechPlayer from "./SpeechPlayer";
import MyNumbers from "./MyNumbers";
import VoiceOrb from "./VoiceOrb";
import Landing from "./story/Landing";
import useVoiceController from "./useVoiceController";
import type { Crop } from "./api";

type UserFacingSection = Exclude<AppSection, "documents">;

const STORY_SEEN_KEY = "kuberket-story-seen";
/** Automatic tests in this project (Python + frontend). Shown on the landing page as "N+": keep it at or below the real count. */
/** Counted from the test files at build time (see vite.config.ts), rounded down to a multiple of 10. */
const AUTOMATIC_TEST_COUNT = Math.floor(__TEST_COUNT__ / 10) * 10;

function storySeen(): boolean {
  try {
    return sessionStorage.getItem(STORY_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberStorySeen() {
  try {
    sessionStorage.setItem(STORY_SEEN_KEY, "1");
  } catch {
    /* private mode: the story simply shows again next time */
  }
}

const userFacingSections: UserFacingSection[] = ["home", "numbers", "schemes"];

const pageNames: Record<Language, Record<UserFacingSection, string>> = {
  hi: { home: "होम", numbers: "मेरा हिसाब", schemes: "योजनाएँ" },
  en: { home: "Home", numbers: "My numbers", schemes: "Schemes" },
};

const sectionIcons: Record<UserFacingSection, string> = { home: "◉", numbers: "↗", schemes: "✳" };

const appText = {
  hi: {
    brandLine: "आपकी बात। आपका हिसाब।",
    language: "भाषा",
    privacy: "निजी जानकारी नहीं माँगते",
    trust: "यह शिक्षा के लिए है, बैंक की सलाह नहीं। अपनी किस्त की शर्तें बैंक से पूछें।",
    connectionError: "सेवा से संपर्क नहीं हो पाया। कृपया सर्वर चालू है या नहीं जाँचें।",
    loading: "KuberKet तैयार हो रहा है…",
    retry: "फिर कोशिश करें",
  },
  en: {
    brandLine: "Your voice. Your numbers.",
    language: "Language",
    privacy: "We don't ask for private information",
    trust: "For education, not bank advice. Confirm instalment terms with your lender.",
    connectionError: "Could not reach the service. Check that the server is running.",
    loading: "KuberKet is getting ready…",
    retry: "Try again",
  },
} as const;

export default function App() {
  const [session, setSession] = useState<import("./api").SessionSnapshot | null>(null);
  const [pageError, setPageError] = useState("");
  const [listen, setListen] = useState(false);
  const voice = useVoiceController({
    session,
    setSession,
    listenAfterSpeech: listen && session?.section === "home",
  });
  // The story is the first screen of every new visit; leaving it is remembered for the tab.
  const [showStory, setShowStory] = useState(() => !storySeen());
  const startVoiceAfterStory = useRef(false);

  const leaveStory = useCallback((startVoice: boolean) => {
    rememberStorySeen();
    startVoiceAfterStory.current = startVoice;
    setShowStory(false);
    window.scrollTo?.(0, 0);
  }, []);

  const language: Language = session?.language ?? "hi";
  const text = appText[language];

  useEffect(() => {
    let active = true;
    loadSession()
      .then(async (loaded) => {
        const restored = loaded.section === "documents"
          ? await updateSession(loaded.session_id, { section: "home" })
          : loaded;
        if (active) setSession(restored);
      })
      .catch((caught: unknown) => {
        if (active) setPageError(caught instanceof Error ? caught.message : appText.hi.connectionError);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (showStory || !session || !startVoiceAfterStory.current) return;
    startVoiceAfterStory.current = false;
    if (session.conversation_state === "not_started") void voice.beginConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStory, session]);

  const changeSection = useCallback(
    async (section: UserFacingSection) => {
      if (!session || session.section === section) return;
      setPageError("");
      try {
        setSession(await updateSession(session.session_id, { section }));
      } catch (caught) {
        setPageError(caught instanceof Error ? caught.message : text.connectionError);
      }
    },
    [session, text.connectionError],
  );

  const changeLanguage = async (nextLanguage: Language) => {
    if (!session || nextLanguage === session.language) return;
    setPageError("");
    try {
      setSession(await updateSession(session.session_id, { language: nextLanguage }));
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : text.connectionError);
    }
  };

  // The story page can open before the session has loaded, so it keeps its own copy of the language.
  const [storyLanguage, setStoryLanguage] = useState<Language>(() => {
    try {
      return localStorage.getItem("kuberket-language") === "en" ? "en" : "hi";
    } catch {
      return "hi";
    }
  });
  useEffect(() => {
    if (session) setStoryLanguage(session.language);
  }, [session?.language]); // eslint-disable-line react-hooks/exhaustive-deps
  const changeStoryLanguage = (nextLanguage: Language) => {
    setStoryLanguage(nextLanguage);
    try {
      localStorage.setItem("kuberket-language", nextLanguage);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    void changeLanguage(nextLanguage);
  };

  const changeCrop = async (crop: Crop) => {
    if (!session || crop === (session.crop ?? "paddy")) return;
    setPageError("");
    try {
      setSession(await updateSession(session.session_id, { crop }));
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : text.connectionError);
    }
  };

  if (showStory) {
    return (
      <Landing
        testCount={AUTOMATIC_TEST_COUNT}
        language={storyLanguage}
        onLanguageChange={changeStoryLanguage}
        onOpenApp={() => leaveStory(false)}
        onStartVoice={() => leaveStory(true)}
        onSkip={() => leaveStory(false)}
      />
    );
  }

  if (!session) {
    return (
      <main className="boot-screen">
        <div className="boot-mark" aria-hidden="true">K</div>
        <p>{pageError || text.loading}</p>
        {pageError && (
          <button className="outline-button" type="button" onClick={() => window.location.reload()}>
            {text.retry}
          </button>
        )}
      </main>
    );
  }

  const activeSection: UserFacingSection = session.section === "documents" ? "home" : session.section;

  return (
    <main className={`app-shell voice-${voice.status}`}>
      <header className="topbar">
        <a
          className="brand"
          href="#home"
          onClick={(event) => {
            event.preventDefault();
            void changeSection("home");
          }}
          aria-label={language === "hi" ? "कुबेरकेत होम" : "KuberKet home"}
        >
          <BrandMark language={language} />
          <span>
            <strong>KuberKet</strong>
            <small>{text.brandLine}</small>
          </span>
        </a>

        <nav className="primary-nav" aria-label={language === "hi" ? "मुख्य नेविगेशन" : "Main navigation"}>
          <button
            className="nav-item"
            type="button"
            onClick={() => {
              window.scrollTo?.(0, 0);
              setShowStory(true);
            }}
          >
            <span className="nav-icon" aria-hidden="true">✦</span>
            <span>{language === "hi" ? "कहानी" : "Story"}</span>
          </button>
          {userFacingSections.map((section) => (
            <button
              className={`nav-item ${activeSection === section ? "active" : ""}`}
              key={section}
              type="button"
              onClick={() => void changeSection(section)}
              aria-current={activeSection === section ? "page" : undefined}
            >
              <span className="nav-icon" aria-hidden="true">{sectionIcons[section]}</span>
              <span>{pageNames[language][section]}</span>
            </button>
          ))}
        </nav>

        <label className="language-control">
          <span>{text.language}</span>
          <select
            aria-label={text.language}
            value={language}
            onChange={(event) => void changeLanguage(event.target.value as Language)}
          >
            <option value="hi">हिन्दी</option>
            <option value="en">English</option>
          </select>
        </label>
      </header>

      {pageError && <div className="global-error" role="alert">{pageError}</div>}

      {activeSection === "home" ? (
        <section className="home-experience">
          <div className="ambient ambient-left" aria-hidden="true" />
          <div className="ambient ambient-right" aria-hidden="true" />
          <div className="home-topline">
            <span className="live-indicator"><i /> {text.brandLine}</span>
            <span className="privacy-label">● {text.privacy}</span>
          </div>
          <Home
            session={session}
            setSession={setSession}
            voice={voice}
            onError={setPageError}
            onListenChange={setListen}
            onOpenSection={(section) => void changeSection(section)}
          />
          <footer className="home-footer">
            <span>{text.trust}</span>
            <span className="powered-label">{language === "hi" ? "Gnani Prisma और Timbre पर बना" : "POWERED BY GNANI PRISMA & TIMBRE"}</span>
          </footer>
        </section>
      ) : (
        <>
          {activeSection === "numbers" ? (
            <MyNumbers
              session={session}
              language={language}
              setSession={(update) => setSession((current) => {
                if (!current) return current;
                return typeof update === "function" ? update(current) : update;
              })}
              voice={voice}
            />
          ) : (
            <SchemesPage
              language={language}
              crop={session.crop ?? "paddy"}
              onCropChange={(next) => void changeCrop(next)}
              slots={session.numbers_workspace_active ? { ...session.slots, ...(session.numbers_inputs ?? {}) } : session.slots}
            />
          )}
          <aside className="companion-dock" aria-label={language === "hi" ? "आवाज़ साथी" : "Voice companion"}>
            <span>{language === "hi" ? "बोलकर पूछें" : "Speak to KuberKet"}</span>
            <div className="compact-orb">
              <VoiceOrb
                status={voice.status}
                level={voice.microphoneLevel}
                error={voice.error}
                activityLabel={voice.activityLabel}
                language={language}
                onStart={voice.startRecording}
                onStopRecording={voice.stopRecording}
                onCancelRecording={voice.cancelRecording}
                onInterrupt={voice.stopSpeech}
                blocked={Boolean(session.chart_context_stale)}
              />
            </div>
            <SpeechPlayer
              clips={voice.speechClips}
              status={voice.status}
              playingClip={voice.playingClip}
              progress={voice.playbackProgress}
              complete={voice.playbackComplete}
              error={voice.speechError}
              language={language}
              onPlay={voice.replaySpeech}
              onStop={voice.stopSpeech}
              onContinue={voice.continuePreviousSpeech}
              hasPausedSpeech={voice.hasPausedSpeech}
              onInterruptAndListen={voice.interruptAndListen}
            />
          </aside>
        </>
      )}
      {voice.diagnosticAudio && window.location.search.includes("debug") && (
        <button
          className="outline-button"
          type="button"
          onClick={() => {
            const audio = voice.diagnosticAudio;
            if (audio) downloadDiagnosticAudio(audio);
          }}
        >
          Download diagnostic audio
        </button>
      )}
    </main>
  );
}

function downloadDiagnosticAudio(audio: Blob) {
  const url = URL.createObjectURL(audio);
  const link = document.createElement("a");
  link.href = url;
  link.download = "kuberket-capture.wav";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function BrandMark({ language }: { language: Language }) {
  return (
    <svg className="brand-mark" viewBox="0 0 48 48" role="img" aria-label={language === "hi" ? "पत्ती और रुपया" : "Leaf and rupee"}>
      <path d="M22 39C9 33 8 19 18 9c9 2 14 8 14 17 0 6-4 11-10 13Z" fill="#1F6B4A" />
      <path d="M16 29c5-6 10-10 17-13" fill="none" stroke="#F6F1E4" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="35" cy="34" r="10" fill="#C9A227" stroke="#0F3D2E" strokeWidth="2" />
      <text x="35" y="38" textAnchor="middle" fontFamily="sans-serif" fontSize="12" fontWeight="700" fill="#0F3D2E">₹</text>
    </svg>
  );
}
