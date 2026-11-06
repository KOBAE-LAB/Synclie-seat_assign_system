"use client";

import { useId, useState } from "react";

type Props = {
  label: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  minLength?: number;
  maxLength?: number;
  value?: string;
  onChange?: (value: string) => void;
  error?: string | null;
};

/** 表示・非表示を切り替えられるパスワード欄 */
export function PasswordInput({ label, name, autoComplete, hint, minLength, maxLength, value, onChange, error }: Props) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="password-input">
        <input
          id={id}
          className="input"
          type={visible ? "text" : "password"}
          name={name}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={maxLength}
          required
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          autoCapitalize="none"
          spellCheck={false}
        />
        <button
          type="button"
          className="password-input__toggle"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-controls={id}
        >
          {visible ? "隠す" : "表示"}
        </button>
      </div>
      {hint && (
        <span id={hintId} className="field__hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="field__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
