"use client";

import { useRef, useState } from "react";

interface ContactSuggestion {
  name: string;
  email: string;
}

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  contacts?: ContactSuggestion[];
}

export default function EmailChipInput({ values, onChange, placeholder, contacts = [] }: Props) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = input.trim().toLowerCase();
  const suggestions = q.length >= 1
    ? contacts.filter(
        (c) =>
          (c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) &&
          !values.includes(c.email)
      ).slice(0, 6)
    : [];

  function addChip(email: string) {
    const trimmed = email.trim();
    if (!trimmed.includes("@")) return;
    if (!values.includes(trimmed)) onChange([...values, trimmed]);
    setInput("");
    setOpen(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (val.endsWith(",") || val.endsWith(" ")) {
      addChip(val.slice(0, -1));
    } else {
      setInput(val);
      setOpen(true);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && suggestions.length > 0) {
        addChip(suggestions[0].email);
      } else if (input.includes("@")) {
        addChip(input);
      }
    } else if (e.key === "Tab" && input.includes("@")) {
      e.preventDefault();
      addChip(input);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !input && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  function handleBlur() {
    // 드롭다운 클릭 처리를 위해 약간 지연
    setTimeout(() => {
      if (input.includes("@")) addChip(input);
      setOpen(false);
    }, 150);
  }

  return (
    <div className="relative flex-1">
      <div
        className="flex flex-wrap gap-1 px-4 py-2 min-h-[38px] cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((email, i) => (
          <span key={i} className="flex items-center gap-1 bg-zinc-100 text-zinc-800 text-xs rounded-full px-2.5 py-1">
            {email}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(values.filter((_, j) => j !== i)); }}
              className="text-zinc-400 hover:text-zinc-600 leading-none"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={() => setOpen(true)}
          placeholder={values.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[140px] text-sm text-black placeholder-zinc-400 outline-none bg-transparent py-0.5"
        />
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-50 bg-white border border-zinc-200 rounded-lg shadow-lg overflow-hidden">
          {suggestions.map((c, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addChip(c.email)}
                className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-50 flex items-center gap-2"
              >
                <span className="font-medium text-zinc-900">{c.name}</span>
                <span className="text-zinc-400 text-xs">{c.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
