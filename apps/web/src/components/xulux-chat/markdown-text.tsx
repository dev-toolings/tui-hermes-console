"use client";

import "@assistant-ui/react-markdown/styles/dot.css";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";

/** Rendu markdown xulux — `aui-md` natif, sans surcouche BoardUI/Hermes. */
export function XuluxMarkdownText() {
  return (
    <MarkdownTextPrimitive className="aui-md text-foreground text-[0.9375rem] leading-relaxed [&_*:last-child]:mb-0" />
  );
}
