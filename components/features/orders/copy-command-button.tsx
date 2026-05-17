"use client";

import { useState } from "react";

type Props = {
  command: string;
};

export function CopyCommandButton({ command }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard izni yoksa sessizce başarısız.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
    >
      {copied ? "Kopyalandı ✓" : "Kopyala"}
    </button>
  );
}
