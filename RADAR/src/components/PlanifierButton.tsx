"use client";

import { useActionState, useState } from "react";
import { scheduleArticlePublication } from "@/app/actions/calendar";
import { IconCalendarCheck } from "@/components/icons";

export function PlanifierButton({ articleId }: { articleId: number }) {
  const [showPicker, setShowPicker] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (_prev: { success: boolean; error?: string } | undefined, formData: FormData) => {
      const date = formData.get("date") as string;
      const result = await scheduleArticlePublication(articleId, date);
      if (result.success) {
        setShowPicker(false);
      }
      return result;
    },
    undefined
  );

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];

  if (state?.success) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: "0.8rem",
          fontWeight: 500,
          color: "#10b981",
        }}
      >
        <IconCalendarCheck size={14} />
        Planifié
      </span>
    );
  }

  if (!showPicker) {
    return (
      <button
        onClick={() => setShowPicker(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "0.4rem 0.75rem",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.2)",
          background: "rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.9)",
          fontSize: "0.8rem",
          fontWeight: 500,
          cursor: "pointer",
          transition: "background 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.15)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.35)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.08)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
        }}
      >
        <IconCalendarCheck size={14} strokeWidth={1.75} />
        Planifier
      </button>
    );
  }

  return (
    <form
      action={formAction}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0.35rem 0.5rem",
        borderRadius: 8,
        border: "1px solid rgba(139,92,246,0.4)",
        background: "rgba(139,92,246,0.1)",
      }}
    >
      <IconCalendarCheck size={14} strokeWidth={1.75} style={{ color: "#8b5cf6", flexShrink: 0 }} />
      <input
        type="date"
        name="date"
        min={minDate}
        required
        autoFocus
        style={{
          background: "transparent",
          border: "none",
          color: "#fff",
          fontSize: "0.8rem",
          fontFamily: "inherit",
          outline: "none",
          width: 130,
          cursor: "pointer",
          colorScheme: "dark",
        }}
      />
      <button
        type="submit"
        disabled={pending}
        style={{
          padding: "0.25rem 0.6rem",
          borderRadius: 6,
          border: "none",
          background: "#8b5cf6",
          color: "#fff",
          fontSize: "0.75rem",
          fontWeight: 600,
          cursor: pending ? "not-allowed" : "pointer",
          opacity: pending ? 0.6 : 1,
          transition: "opacity 0.15s",
          flexShrink: 0,
        }}
      >
        {pending ? "…" : "OK"}
      </button>
      <button
        type="button"
        onClick={() => { setShowPicker(false); }}
        style={{
          padding: "0.25rem 0.5rem",
          borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.2)",
          background: "transparent",
          color: "rgba(255,255,255,0.6)",
          fontSize: "0.75rem",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Annuler
      </button>
      {state?.error && (
        <span style={{ fontSize: "0.7rem", color: "#FCA5A5" }}>{state.error}</span>
      )}
    </form>
  );
}
