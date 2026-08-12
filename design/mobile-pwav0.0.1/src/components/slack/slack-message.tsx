import {
  EllipsisIcon,
  MessageSquareTextIcon,
  PaperclipIcon,
  PinIcon,
  SmilePlusIcon,
} from "lucide-react";
import type { SlackChannelMessage } from "./types";
import { formatLastReply, initialsOf, type ThreadSummary } from "./thread-summary";
import { useLongPress } from "../mobile/use-long-press";

const FACEPILE_LIMIT = 4;

export type SlackMessageProps = {
  message: SlackChannelMessage;
  grouped?: boolean;
  isPinned?: boolean;
  thread?: ThreadSummary;
  onOpenThread?: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onReply?: (messageId: string) => void;
  onTogglePin?: (messageId: string) => void;
  onMore?: (messageId: string) => void;
};

export function SlackMessage({
  message,
  grouped = false,
  isPinned = false,
  thread,
  onOpenThread,
  onToggleReaction,
  onReply,
  onTogglePin,
  onMore,
}: SlackMessageProps) {
  const initials = initialsOf(message.author);
  const hasToolbar = Boolean(onToggleReaction || onReply || onTogglePin || onMore);
  const longPress = useLongPress(onMore ? () => onMore(message.id) : undefined);
  const lastReply = thread ? formatLastReply(thread.lastReplyAt, Date.now()) : "";

  return (
    <article className={`slack-message ${grouped ? "slack-message--grouped" : ""}`} aria-label={`Message de ${message.author}`} {...longPress}>
      {grouped ? (
        <time className="slack-message__group-time" dateTime={asDateTime(message.createdAt)}>{formatMessageTime(message.createdAt)}</time>
      ) : <span className="slack-message__avatar" aria-hidden="true">{initials}</span>}
      <div className="slack-message__body">
        {!grouped ? <header className="slack-message__meta">
          <strong>{message.author}</strong>
          <time dateTime={asDateTime(message.createdAt)}>{formatMessageTime(message.createdAt)}</time>
          {message.editedAt ? <span>modifié</span> : null}
          {isPinned ? <span className="slack-message__pinned"><PinIcon size={12} /> Épinglé</span> : null}
        </header> : null}
        {message.body ? <p className="slack-message__text">{message.body}</p> : null}
        {message.attachments?.length ? (
          <ul className="slack-message__attachments" aria-label="Pièces jointes">
            {message.attachments.map((attachment) => (
              <li key={attachment.id}><PaperclipIcon size={14} aria-hidden="true" /><span>{attachment.name}</span>{attachment.size ? <small>{formatAttachmentSize(attachment.size)}</small> : null}</li>
            ))}
          </ul>
        ) : null}
        {message.reactions?.length ? (
          <div className="slack-message__reactions" aria-label="Réactions">
            {message.reactions.map((reaction) => (
              <button key={reaction.emoji} type="button" onClick={() => onToggleReaction?.(message.id, reaction.emoji)} disabled={!onToggleReaction}>
                <span>{reaction.emoji}</span><span>{reaction.reactors.length}</span>
              </button>
            ))}
          </div>
        ) : null}
        {thread && onOpenThread ? (
          <button type="button" className="slack-message__replies" onClick={() => onOpenThread(message.id)}>
            <span className="slack-message__facepile" aria-hidden="true">
              {thread.authors.slice(0, FACEPILE_LIMIT).map((author) => (
                <span key={author}>{initialsOf(author)}</span>
              ))}
            </span>
            <span className="slack-message__reply-count">
              {thread.count} {thread.count === 1 ? "réponse" : "réponses"}
            </span>
            {lastReply ? (
              <span className="slack-message__reply-last">Dernière réponse {lastReply}</span>
            ) : null}
          </button>
        ) : null}
      </div>
      {hasToolbar ? (
        <div className="slack-message__toolbar" aria-label="Actions du message">
          {onToggleReaction ? <MessageAction label="Ajouter une réaction" onClick={() => onToggleReaction(message.id, "👍")}><SmilePlusIcon size={16} /></MessageAction> : null}
          {onReply ? <MessageAction label="Répondre dans un fil" onClick={() => onReply(message.id)}><MessageSquareTextIcon size={16} /></MessageAction> : null}
          {onTogglePin ? <MessageAction label={isPinned ? "Désépingler" : "Épingler"} onClick={() => onTogglePin(message.id)}><PinIcon size={16} /></MessageAction> : null}
          {onMore ? <MessageAction label="Plus d’actions" action="more" onClick={() => onMore(message.id)}><EllipsisIcon size={16} /></MessageAction> : null}
        </div>
      ) : null}
    </article>
  );
}

function MessageAction({ label, onClick, action, children }: { label: string; onClick: () => void; action?: string; children: React.ReactNode }) {
  return <button type="button" className="slack-icon-button" data-action={action} aria-label={label} onClick={onClick}>{children}</button>;
}

export function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function asDateTime(value: string) {
  return Number.isNaN(new Date(value).getTime()) ? undefined : value;
}

function formatAttachmentSize(size: number) {
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}
