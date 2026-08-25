"use client";
import { useState } from "react";

export default function PromptModal({
  title,
  description,
  label = "Name",
  initialValue = "",
  placeholder,
  saveLabel = "Save",
  required = false,
  requiredMessage = "This field is required.",
  onCancel,
  onSave,
}: {
  title: string;
  description?: string;
  label?: string;
  initialValue?: string;
  placeholder?: string;
  saveLabel?: string;
  required?: boolean;
  requiredMessage?: string;
  onCancel: () => void;
  onSave: (value: string) => Promise<void> | void;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (required && !value.trim()) return alert(requiredMessage);
    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal">
      <div className="mbox">
        <h3>{title}</h3>
        {description && <div style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 10px" }}>{description}</div>}
        <label>{label}</label>
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />
        <button className="checkout" style={{ background: "var(--teal)" }} disabled={saving} onClick={save}>
          {saving ? "Saving…" : saveLabel}
        </button>
        <button className="btn sec" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
