"use client";

import { useActionState } from "react";
import { selectName } from "@/app/actions/auth";

const TEAM_MEMBERS = ["Daniel", "Test"];

export default function SelectNamePage() {
  const [error, action, pending] = useActionState(selectName, undefined);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#982124",
        padding: "1.5rem",
      }}
    >
      {/* Logo */}
      <img
        src="/logo.png"
        alt="Le Média Automobile"
        style={{
          width: 140,
          height: "auto",
          marginBottom: "2rem",
          opacity: 0.95,
        }}
      />

      {/* Carte glass */}
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          borderRadius: 16,
          padding: "2.5rem 2rem",
          background:
            "linear-gradient(135deg, rgba(206,37,38,0.85) 0%, rgba(140,26,28,0.92) 100%)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.15)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1)",
        }}
      >
        <h1
          style={{
            textAlign: "center",
            fontSize: "1.25rem",
            fontWeight: 600,
            color: "#fff",
            marginBottom: "0.25rem",
          }}
        >
          Qui êtes-vous ?
        </h1>
        <p
          style={{
            textAlign: "center",
            fontSize: "0.8rem",
            color: "rgba(255,255,255,0.65)",
            marginBottom: "1.75rem",
          }}
        >
          Sélectionnez votre nom pour cette session
        </p>

        <form action={action} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label
              htmlFor="name"
              style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 500,
                color: "rgba(255,255,255,0.8)",
                marginBottom: "0.35rem",
              }}
            >
              Nom
            </label>
            <select
              id="name"
              name="name"
              required
              autoFocus
              style={{
                width: "100%",
                padding: "0.6rem 0.75rem",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(0,0,0,0.25)",
                color: "#fff",
                fontSize: "0.875rem",
                outline: "none",
                appearance: "none",
                cursor: "pointer",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.45)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)")}
            >
              <option value="" style={{ background: "#8C1A1C", color: "#fff" }}>
                Sélectionner…
              </option>
              {TEAM_MEMBERS.map((name) => (
                <option key={name} value={name} style={{ background: "#8C1A1C", color: "#fff" }}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p
              style={{
                fontSize: "0.8rem",
                color: "#FCA5A5",
                marginTop: "-0.25rem",
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            style={{
              width: "100%",
              padding: "0.65rem",
              borderRadius: 8,
              border: "none",
              background: "rgba(255,255,255,0.95)",
              color: "#8C1A1C",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: pending ? "not-allowed" : "pointer",
              opacity: pending ? 0.6 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {pending ? "Connexion…" : "Continuer"}
          </button>
        </form>
      </div>

      {/* Signature moteur */}
      <p
        style={{
          marginTop: "2rem",
          fontSize: "0.65rem",
          color: "rgba(255,255,255,0.3)",
          textAlign: "center",
        }}
      >
        LAN_D Core Engine — v1.0.0
      </p>
    </div>
  );
}
