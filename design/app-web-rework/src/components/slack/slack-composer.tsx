import { useEffect, useRef, useState } from "react";
import {
  BoldIcon,
  CodeIcon,
  ItalicIcon,
  LinkIcon,
  PaperclipIcon,
  SendHorizontalIcon,
  SmilePlusIcon,
  XIcon,
} from "lucide-react";
import type { SlackComposerProps } from "./types";

const MAX_ATTACHMENTS = 8;

export function SlackComposer({
  channelName,
  placeholder,
  disabled = false,
  submitLabel = "Envoyer le message",
  onSend,
  onFormat,
  onOpenEmoji,
  onAttach,
  className,
}: SlackComposerProps) {
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isEmpty = !body.trim() && attachments.length === 0;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [body]);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const next = Array.from(fileList).slice(0, MAX_ATTACHMENTS - attachments.length);
    if (!next.length) return;
    setAttachments((current) => [...current, ...next]);
    onAttach?.(next);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || isEmpty) return;
    await onSend({ body: body.trimEnd(), attachments });
    setBody("");
    setAttachments([]);
  };

  return (
    <form className={`slack-composer ${className ?? ""}`} onSubmit={submit}>
      {attachments.length > 0 ? (
        <ul className="slack-composer__attachments" aria-label="Pièces jointes sélectionnées">
          {attachments.map((file, index) => (
            <li key={`${file.name}-${file.lastModified}-${index}`}>
              <PaperclipIcon aria-hidden="true" size={14} />
              <span>{file.name}</span>
              <button
                type="button"
                onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                aria-label={`Retirer ${file.name}`}
              >
                <XIcon aria-hidden="true" size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <textarea
        ref={textareaRef}
        data-composer-input
        className="slack-composer__textarea"
        disabled={disabled}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          // Touch keyboards have no Shift+Enter affordance, so Enter stays a
          // newline there and the send button is the only way to publish.
          if (window.matchMedia("(pointer: coarse)").matches) return;
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        rows={1}
        maxLength={10_000}
        enterKeyHint="enter"
        inputMode="text"
        autoCapitalize="sentences"
        placeholder={placeholder ?? `Écrire dans #${channelName}`}
        aria-label={`Message dans ${channelName}`}
      />
      <div className="slack-composer__footer">
        <div className="slack-composer__tools" aria-label="Outils de mise en forme">
          {onFormat ? (
            <>
              <ComposerButton label="Gras" onClick={() => onFormat("bold")}><BoldIcon size={15} /></ComposerButton>
              <ComposerButton label="Italique" onClick={() => onFormat("italic")}><ItalicIcon size={15} /></ComposerButton>
              <ComposerButton label="Code" onClick={() => onFormat("code")}><CodeIcon size={15} /></ComposerButton>
              <ComposerButton label="Lien" onClick={() => onFormat("link")}><LinkIcon size={15} /></ComposerButton>
            </>
          ) : null}
          {onAttach ? (
            <>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="sr-only"
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
              <ComposerButton label="Ajouter une pièce jointe" onClick={() => inputRef.current?.click()}><PaperclipIcon size={16} /></ComposerButton>
            </>
          ) : null}
          {onOpenEmoji ? <ComposerButton label="Ajouter un emoji" onClick={onOpenEmoji}><SmilePlusIcon size={16} /></ComposerButton> : null}
        </div>
        <button className="slack-composer__send" type="submit" disabled={disabled || isEmpty} aria-label={submitLabel}>
          <SendHorizontalIcon aria-hidden="true" size={17} />
        </button>
      </div>
      <p className="slack-composer__hint">Entrée pour envoyer · Maj+Entrée pour une ligne</p>
    </form>
  );
}

function ComposerButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className="slack-icon-button" onClick={onClick} aria-label={label}>{children}</button>;
}
