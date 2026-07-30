"use client";

import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";

/**
 * Rendu Markdown de la sortie Hermes.
 *
 * BoardUI emploie le même primitive dans son flux `ai-chat`. On garde ici une
 * version sans dépendance de coloration syntaxique : la Console rend fidèlement
 * le contenu reçu, tandis que les blocs de code restent copiables et lisibles.
 */
export function MarkdownText() {
  return (
    <MarkdownTextPrimitive
      className={[
        "aui-md min-w-0 text-[0.9375rem] leading-6 text-foreground",
        "[&>*]:mb-3 [&>*:last-child]:mb-0",
        "[&_p]:mb-3 [&_p:last-child]:mb-0",
        "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4",
        "[&_ul]:list-disc [&_ul]:ps-5 [&_ol]:list-decimal [&_ol]:ps-5",
        "[&_li]:my-1",
        "[&_blockquote]:rounded-xl [&_blockquote]:bg-ai-primary [&_blockquote]:px-4 [&_blockquote]:py-3",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:border [&_pre]:border-ai-separator",
        "[&_pre]:bg-ai-primary [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[0.8125rem]",
        "[&_:not(pre)>code]:rounded-md [&_:not(pre)>code]:bg-ai-tertiary",
        "[&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono",
        "[&_:not(pre)>code]:text-[0.8125rem]",
      ].join(" ")}
    />
  );
}
