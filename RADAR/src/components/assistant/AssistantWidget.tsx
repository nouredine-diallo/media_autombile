"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mascot, type MascotState } from "./Mascot";
import { IconClose, IconArrowUp, IconRefresh } from "@/components/icons";
import "./assistant.css";

interface Fiche {
  id: string;
  title: string;
  description: string;
  steps?: string[];
  tips?: string[];
  link?: { label: string; href: string; external?: boolean; hint?: string };
  related?: string[];
}

interface RelatedRef {
  id: string;
  title: string;
}

interface Reply {
  match: Fiche | null;
  matchRelated: RelatedRef[];
  suggestions: Fiche[];
  directory: string[];
  confidence: number;
}

interface AssistantResponse {
  success: boolean;
  reply: Reply;
  error?: string;
}

interface StartersResponse {
  success: boolean;
  starters: Fiche[];
  error?: string;
}

interface ChatMessage {
  role: "user" | "assistant" | "welcome";
  text?: string;
  reply?: Reply;
  starters?: Fiche[];
}

const GREETING =
  "Salut ! Je suis l'assistante du Média Automobile. Pose-moi une question sur l'outil : créer un post, valider un article, planifier une campagne, comprendre le pipeline… Je t'explique tout, pas à pas.";

export function AssistantWidget({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mascot, setMascot] = useState<MascotState>("idle");
  const bodyRef = useRef<HTMLDivElement>(null);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/assistant")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: StartersResponse) => {
        if (!cancelled) {
          setMessages([{ role: "welcome", text: GREETING, starters: data.starters }]);
          scrollDown();
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessages([{ role: "welcome", text: GREETING }]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [scrollDown]);

  useEffect(() => {
    scrollDown();
  }, [messages, busy, scrollDown]);

  const send = useCallback(
    async (raw?: string) => {
      const q = (raw ?? input).trim();
      if (!q || busy) return;
      setInput("");
      setMessages((prev) => [...prev, { role: "user", text: q }]);
      setBusy(true);
      setMascot("thinking");

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const data: AssistantResponse = await res.json();
        setMascot(data.reply.match ? "happy" : "perplexed");
        setMessages((prev) => [...prev, { role: "assistant", reply: data.reply }]);
      } catch {
        setMascot("perplexed");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            reply: { match: null, matchRelated: [], suggestions: [], directory: [], confidence: 0 },
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, input],
  );

  /**
   * Résolution directe par id (clic sur une chip "starter" ou "en lien") —
   * jamais une nouvelle recherche floue pour un choix déjà connu (bug corrigé
   * le 2026-08-28 : le clic renvoyait l'id brut de la fiche dans la question,
   * et le libellé du bouton affichait cet id technique au lieu du titre).
   */
  const loadById = useCallback(
    async (id: string, title: string) => {
      if (busy) return;
      setMessages((prev) => [...prev, { role: "user", text: title }]);
      setBusy(true);
      setMascot("thinking");
      try {
        const res = await fetch(`/api/assistant?id=${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data: AssistantResponse = await res.json();
        setMascot("happy");
        setMessages((prev) => [...prev, { role: "assistant", reply: data.reply }]);
      } catch {
        setMascot("perplexed");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            reply: { match: null, matchRelated: [], suggestions: [], directory: [], confidence: 0 },
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const reset = useCallback(() => {
    fetch("/api/assistant")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: StartersResponse) => {
        setMessages([{ role: "welcome", text: GREETING, starters: data.starters }]);
      })
      .catch(() => {
        setMessages([{ role: "welcome", text: GREETING }]);
      });
    setMascot("idle");
  }, []);

  return (
    <div className="lma-panel" role="dialog" aria-label="Assistante de l'outil">
      <div className="lma-panel-header">
        <div className="lma-avatar">
          <Mascot state={mascot} />
        </div>
        <div>
          <div className="lma-header-title">LMA — l&apos;assistante</div>
          <div className="lma-header-status">
            {busy ? "réfléchit…" : mascot === "happy" ? "prête à t'aider" : "ta question, je t'explique"}
          </div>
        </div>
        <button className="lma-close" onClick={onClose} aria-label="Fermer l'assistante">
          <IconClose size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="lma-body" ref={bodyRef}>
        {messages.map((m, i) => (
          <div key={i}>
            {m.role === "welcome" && (
              <div className="lma-msg lma-msg--assistant">
                <div style={{ width: 40, height: 40, flex: "none" }}>
                  <Mascot state="happy" variant="face" />
                </div>
                <div className="lma-bubble">
                  {m.text}
                  {m.starters && m.starters.length > 0 && (
                    <div className="lma-related" style={{ marginTop: 10 }}>
                      {m.starters.map((f) => (
                        <button
                          key={f.id}
                          className="lma-chip"
                          onClick={() => loadById(f.id, f.title)}
                        >
                          {f.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {m.role === "user" && (
              <div className="lma-msg lma-msg--user">
                <div className="lma-bubble">{m.text}</div>
              </div>
            )}
            {m.role === "assistant" && m.reply && (
              <div className="lma-msg lma-msg--assistant">
                <div style={{ width: 40, height: 40, flex: "none" }}>
                  <Mascot state="idle" variant="face" />
                </div>
                <div className="lma-bubble" style={{ padding: 8 }}>
                  <AssistantCard reply={m.reply} onAskById={loadById} />
                </div>
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="lma-msg lma-msg--assistant">
            <div style={{ width: 40, height: 40, flex: "none" }}>
              <Mascot state="thinking" variant="face" />
            </div>
            <div className="lma-bubble">
              <div className="lma-typing" aria-label="L'assistante réfléchit">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}

        {messages.length > 1 && (
          <button className="lma-chip lma-suggestion" onClick={reset}>
            <IconRefresh size={12} strokeWidth={2} />
            Recommencer la conversation
          </button>
        )}
      </div>

      <div className="lma-footer">
        <input
          className="lma-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
            if (e.key === "Escape") onClose();
          }}
          placeholder="Demande-moi quelque chose…"
          aria-label="Ta question"
        />
        <button
          className="lma-send"
          onClick={() => send()}
          disabled={!input.trim() || busy}
          aria-label="Envoyer"
        >
          <IconArrowUp size={18} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}

function AssistantCard({
  reply,
  onAskById,
}: {
  reply: Reply;
  onAskById: (id: string, title: string) => void;
}) {
  if (reply.match) {
    const f = reply.match;
    return (
      <div className="lma-card">
        <div className="lma-card-title">{f.title}</div>
        {f.description && <div className="lma-card-desc">{f.description}</div>}
        {f.steps && f.steps.length > 0 && (
          <>
            <h4>Comment faire</h4>
            <ol className="lma-steps">
              {f.steps.map((s, i) => (
                <li key={i}>
                  <span className="lma-step-num">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </>
        )}
        {f.tips && f.tips.length > 0 && (
          <>
            <h4>À plein potentiel</h4>
            <ul className="lma-tips">
              {f.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </>
        )}
        {f.link && (
          <a
            className="lma-cta"
            href={f.link.href}
            target={f.link.external ? "_blank" : undefined}
            rel={f.link.external ? "noopener noreferrer" : undefined}
          >
            {f.link.label}
            {f.link.external ? " ↗" : " →"}
          </a>
        )}
        {reply.matchRelated.length > 0 && (
          <div className="lma-related">
            {reply.matchRelated.map((r) => (
              <button key={r.id} className="lma-chip" onClick={() => onAskById(r.id, r.title)}>
                {r.title}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="lma-card">
      <div className="lma-card-title">Je n&apos;ai pas compris — mais je peux t&apos;aider</div>
      <div className="lma-fallback">
        Reformule ta question ou choisis une suggestion ci-dessous.
      </div>
      {reply.suggestions.length > 0 && (
        <div className="lma-related">
          {reply.suggestions.map((s) => (
            <button key={s.id} className="lma-chip" onClick={() => onAskById(s.id, s.title)}>
              {s.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
