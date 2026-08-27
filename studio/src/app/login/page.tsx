"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, undefined);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--brand)",
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
            "linear-gradient(135deg, rgba(202,62,62,0.85) 0%, rgba(139,29,29,0.92) 100%)",
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
            letterSpacing: "-0.01em",
          }}
        >
          STUDIO AUTOMOBILE
        </h1>
        <p
          style={{
            textAlign: "center",
            fontSize: "0.8rem",
            color: "rgba(255,255,255,0.65)",
            marginBottom: "1.75rem",
          }}
        >
          Création de visuels
        </p>

        <form action={action} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label
              htmlFor="password"
              style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 500,
                color: "rgba(255,255,255,0.8)",
                marginBottom: "0.35rem",
              }}
            >
              Mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              placeholder="Entrez le mot de passe"
              style={{
                width: "100%",
                padding: "0.6rem 0.75rem",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(0,0,0,0.25)",
                color: "#fff",
                fontSize: "0.875rem",
                outline: "none",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.45)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)")}
            />
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
              color: "var(--brand)",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: pending ? "not-allowed" : "pointer",
              opacity: pending ? 0.6 : 1,
              transition: "opacity 0.15s, transform 0.1s",
            }}
          >
            {pending ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
