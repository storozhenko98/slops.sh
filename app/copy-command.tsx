"use client";

import { useState } from "react";

type CopyCommandProps = {
  command: string;
  meta: string;
  ariaLabel: string;
};

export function CopyCommand({ command, meta, ariaLabel }: CopyCommandProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(command);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1_200);
        return;
      } catch {
        // Fall through to the selection-based clipboard path.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = command;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_200);
  }

  return (
    <button
      type="button"
      className="command copy-command"
      onClick={copy}
      aria-label={ariaLabel}
    >
      <span className="command-text">{command}</span>
      <span className="command-meta">{copied ? "copied" : meta}</span>
    </button>
  );
}
