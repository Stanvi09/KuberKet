import { useState } from "react";

import { checkVoice } from "../api";
import type { Language, VoiceCheckResult } from "../api";
import { homeText } from "./copy";

type Browser = { ok: boolean; message: string };

async function checkBrowser(language: Language): Promise<Browser> {
  const t = homeText[language];
  if (!window.isSecureContext) return { ok: false, message: t.micInsecure };
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, message: t.micMissing };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return { ok: true, message: t.micOk };
  } catch {
    return { ok: false, message: t.micDenied };
  }
}

/** One button that names the broken part: the browser microphone, Gnani Timbre (voice) or Gnani Prisma (listening). */
export default function VoiceCheck({ language }: { language: Language }) {
  const t = homeText[language];
  const [busy, setBusy] = useState(false);
  const [browser, setBrowser] = useState<Browser | null>(null);
  const [server, setServer] = useState<VoiceCheckResult | null>(null);
  const [failure, setFailure] = useState("");

  const run = async () => {
    setBusy(true);
    setFailure("");
    setServer(null);
    setBrowser(await checkBrowser(language));
    try {
      setServer(await checkVoice(language));
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : "");
    } finally {
      setBusy(false);
    }
  };

  const rows: { name: string; ok: boolean; message: string }[] = [];
  if (browser) rows.push({ name: t.micBrowser, ok: browser.ok, message: browser.message });
  if (server) {
    rows.push({ name: t.speakPart, ok: server.speech.ok, message: server.speech.message });
    rows.push({ name: t.listenPart, ok: server.listening.ok, message: server.listening.message });
  }
  const allOk = rows.length === 3 && rows.every((row) => row.ok);

  return (
    <div className="hm-check">
      <button type="button" className="hm-ghost" onClick={() => void run()} disabled={busy}>
        {busy ? t.voiceChecking : t.voiceCheck}
      </button>
      {failure && <p className="hm-check-bad" role="alert">{failure}</p>}
      {rows.length > 0 && (
        <ul aria-live="polite">
          {rows.map((row) => (
            <li key={row.name} data-ok={row.ok}>
              <strong>{row.ok ? "✓" : "✕"} {row.name}</strong>
              <span>{row.message}</span>
            </li>
          ))}
          {allOk && <li data-ok="true"><strong>✓ {t.voiceOk}</strong></li>}
        </ul>
      )}
    </div>
  );
}
