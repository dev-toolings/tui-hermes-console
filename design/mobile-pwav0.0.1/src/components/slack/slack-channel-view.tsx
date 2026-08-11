import { useEffect, useMemo, useState } from "react";
import {
  HashIcon,
  InfoIcon,
  LockKeyholeIcon,
  PanelLeftIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
  UsersRoundIcon,
  XIcon,
} from "lucide-react";
import { SlackComposer } from "./slack-composer";
import { SlackMessage } from "./slack-message";
import type {
  SlackChannel,
  SlackChannelMessage,
  SlackChannelTab,
  SlackComposerProps,
  SlackDraft,
} from "./types";
import "../../styles/slack.css";

export type SlackChannelViewProps = {
  channel: SlackChannel;
  messages: SlackChannelMessage[];
  embedded?: boolean;
  activeTab?: SlackChannelTab;
  activeThreadId?: string | null;
  showDetails?: boolean;
  profileName?: string;
  composer?: Partial<Omit<SlackComposerProps, "channelName" | "onSend">>;
  onSendMessage: (draft: SlackDraft) => void | Promise<void>;
  onSendThreadMessage?: (parentMessageId: string, draft: SlackDraft, broadcastToChannel: boolean) => void | Promise<void>;
  onTabChange?: (tab: SlackChannelTab) => void;
  onToggleStar?: () => void;
  onShowMembers?: () => void;
  onSearch?: () => void;
  onOpenDetails?: () => void;
  onUpdateDetails?: (patch: {
    topic: string;
    description: string;
    isPrivate: boolean;
  }) => void;
  onClosePanel?: () => void;
  onOpenThread?: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onTogglePin?: (messageId: string) => void;
  onMoreMessageActions?: (messageId: string) => void;
  onToggleSidebar?: () => void;
};

const TABS: Array<{ id: SlackChannelTab; label: string }> = [
  { id: "messages", label: "Messages" },
  { id: "files", label: "Fichiers" },
  { id: "pins", label: "Épinglés" },
];

export function SlackChannelView({
  channel,
  messages,
  embedded = false,
  activeTab = "messages",
  activeThreadId = null,
  showDetails = false,
  profileName,
  composer,
  onSendMessage,
  onSendThreadMessage,
  onTabChange,
  onToggleStar,
  onShowMembers,
  onSearch,
  onOpenDetails,
  onUpdateDetails,
  onClosePanel,
  onOpenThread,
  onToggleReaction,
  onTogglePin,
  onMoreMessageActions,
  onToggleSidebar,
}: SlackChannelViewProps) {
  const [bookmarkAdded, setBookmarkAdded] = useState(false);
  const rootMessages = useMemo(
    () =>
      messages.filter(
        (message) => !message.parentMessageId || message.broadcastToChannel,
      ),
    [messages],
  );
  const activeThread = activeThreadId ? messages.find((message) => message.id === activeThreadId) ?? null : null;
  const threadReplies = activeThreadId ? messages.filter((message) => message.parentMessageId === activeThreadId) : [];
  const pinnedIds = new Set(channel.pinnedMessageIds ?? []);
  const replyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const message of messages) {
      if (!message.parentMessageId) continue;
      counts.set(
        message.parentMessageId,
        (counts.get(message.parentMessageId) ?? 0) + 1,
      );
    }
    return counts;
  }, [messages]);
  const panel = activeThread ? "thread" : showDetails ? "details" : null;
  const displayMessages = activeTab === "messages"
    ? rootMessages
    : activeTab === "files"
      ? messages.filter((message) => message.attachments?.length)
      : messages.filter((message) => pinnedIds.has(message.id));

  useEffect(() => {
    if (!panel || !onClosePanel) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClosePanel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [panel, onClosePanel]);

  return (
    <section className={`slack-channel-view ${embedded ? "slack-channel-view--embedded" : ""} ${panel ? "slack-channel-view--panel-open" : ""}`} aria-label={`Salon ${channel.name}`}>
      {panel === "thread" && activeThread ? (
        <ThreadPanel
          channel={channel}
          parent={activeThread}
          replies={threadReplies}
          profileName={profileName}
          onClose={onClosePanel}
          onSend={onSendThreadMessage}
          onOpenThread={onOpenThread}
          onToggleReaction={onToggleReaction}
          onTogglePin={onTogglePin}
          onMore={onMoreMessageActions}
        />
      ) : (
        <div className="slack-channel-view__main">
          <ChannelHeader
            channel={channel}
            embedded={embedded}
            onShowMembers={onShowMembers}
            onSearch={onSearch}
            onOpenDetails={onOpenDetails}
            onToggleSidebar={onToggleSidebar}
          />
          <div className="slack-channel-bookmark">
            <button
              type="button"
              aria-pressed={bookmarkAdded}
              onClick={() => setBookmarkAdded((current) => !current)}
            >
              <PlusIcon size={14} aria-hidden="true" />
              {bookmarkAdded ? "Bookmark ajouté" : "Ajouter un bookmark"}
            </button>
          </div>
          <nav className="slack-channel-tabs" aria-label="Contenu du salon">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={activeTab === tab.id ? "is-active" : ""}
                onClick={() => onTabChange?.(tab.id)}
                disabled={!onTabChange}
                aria-current={activeTab === tab.id ? "page" : undefined}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="slack-channel-view__scroll">
            {activeTab === "files" ? (
              <p className="slack-tab-notice">
                Maquette locale : les métadonnées des fichiers sont conservées,
                pas leur contenu binaire.
              </p>
            ) : null}
            <div className="slack-timeline">
              {displayMessages.length ? displayMessages.map((message, index) => {
                const previous = displayMessages[index - 1];
                const grouped = previous ? canGroupMessages(previous, message) : false;
                const showDay = !previous || !isSameDay(previous.createdAt, message.createdAt);
                return (
                  <div key={message.id}>
                    {showDay ? <DayDivider value={message.createdAt} /> : null}
                    <SlackMessage
                      message={message}
                      grouped={grouped}
                      isPinned={pinnedIds.has(message.id)}
                      replyCount={replyCounts.get(message.id) ?? 0}
                      onOpenThread={(messageId) =>
                        onOpenThread?.(message.parentMessageId ?? messageId)
                      }
                      onReply={(messageId) =>
                        onOpenThread?.(message.parentMessageId ?? messageId)
                      }
                      onToggleReaction={onToggleReaction}
                      onTogglePin={onTogglePin}
                      onMore={onMoreMessageActions}
                    />
                  </div>
                );
              }) : <EmptyTab tab={activeTab} />}
            </div>
          </div>
          <div className="slack-channel-view__composer">
            <SlackComposer channelName={channel.name} onSend={onSendMessage} {...composer} />
          </div>
        </div>
      )}
      {panel === "details" ? <ChannelDetails channel={channel} onClose={onClosePanel} onShowMembers={onShowMembers} onUpdateDetails={onUpdateDetails} onToggleStar={onToggleStar} /> : null}
    </section>
  );
}

function ChannelHeader({ channel, embedded = false, onShowMembers, onSearch, onOpenDetails, onToggleSidebar }: Pick<SlackChannelViewProps, "channel" | "onShowMembers" | "onSearch" | "onOpenDetails" | "onToggleSidebar"> & { embedded?: boolean }) {
  const memberCount = channel.memberNames?.length ?? 0;
  return (
    <header className={`slack-channel-header ${embedded ? "slack-channel-header--embedded" : ""}`}>
      {onToggleSidebar ? (
        <button type="button" className="slack-channel-header__sidebar-toggle" aria-label="Afficher ou masquer la sidebar" onClick={onToggleSidebar}>
          <PanelLeftIcon size={16} aria-hidden="true" />
        </button>
      ) : null}
      <div className="slack-channel-header__title">
        {channel.isPrivate ? <LockKeyholeIcon size={19} aria-hidden="true" /> : <HashIcon size={20} aria-hidden="true" />}
        <h1>{channel.name}</h1>
      </div>
      {channel.topic ? <p className="slack-channel-header__topic">{channel.topic}</p> : null}
      <div className="slack-channel-header__actions">
        {onShowMembers && memberCount ? <HeaderButton label={`${memberCount} membres`} onClick={onShowMembers}><UsersRoundIcon size={17} /><span>{memberCount}</span></HeaderButton> : null}
        {onSearch ? <HeaderButton label="Rechercher dans le salon" onClick={onSearch}><SearchIcon size={15} /><span>Rechercher</span></HeaderButton> : null}
        {onOpenDetails ? <HeaderButton label="Informations du salon" onClick={onOpenDetails}><InfoIcon size={16} /><span>Informations</span></HeaderButton> : null}
      </div>
    </header>
  );
}

function ThreadPanel({ channel, parent, replies, profileName, onClose, onSend, onOpenThread, onToggleReaction, onTogglePin, onMore }: {
  channel: SlackChannel;
  parent: SlackChannelMessage;
  replies: SlackChannelMessage[];
  profileName?: string;
  onClose?: () => void;
  onSend?: SlackChannelViewProps["onSendThreadMessage"];
  onOpenThread?: SlackChannelViewProps["onOpenThread"];
  onToggleReaction?: SlackChannelViewProps["onToggleReaction"];
  onTogglePin?: SlackChannelViewProps["onTogglePin"];
  onMore?: SlackChannelViewProps["onMoreMessageActions"];
}) {
  const [broadcast, setBroadcast] = useState(false);
  return (
    <aside className="slack-context-panel slack-context-panel--thread" aria-label={`Fil de discussion dans ${channel.name}`}>
      <header className="slack-context-panel__header">
        <div><h2>Fil de discussion</h2><p>#{channel.name}</p></div>
        {onClose ? <HeaderButton label="Fermer le fil" onClick={onClose}><XIcon size={18} /></HeaderButton> : null}
      </header>
      <div className="slack-context-panel__messages">
        <SlackMessage message={parent} onOpenThread={onOpenThread} onToggleReaction={onToggleReaction} onTogglePin={onTogglePin} onMore={onMore} />
        {replies.map((reply) => <SlackMessage key={reply.id} message={reply} onToggleReaction={onToggleReaction} onTogglePin={onTogglePin} onMore={onMore} />)}
      </div>
      {onSend ? (
        <div className="slack-context-panel__composer">
          <label className="slack-broadcast"><input type="checkbox" checked={broadcast} onChange={(event) => setBroadcast(event.target.checked)} /> Envoyer aussi dans #{channel.name}</label>
          <SlackComposer channelName={channel.name} placeholder="Répondre dans le fil" submitLabel="Envoyer la réponse" onSend={(draft) => onSend(parent.id, draft, broadcast)} />
        </div>
      ) : <p className="slack-context-panel__notice">Lecture seule pour ce fil.</p>}
      {profileName ? <span className="sr-only">Réponse envoyée au nom de {profileName}</span> : null}
    </aside>
  );
}

function ChannelDetails({ channel, onClose, onShowMembers, onUpdateDetails, onToggleStar }: Pick<SlackChannelViewProps, "channel" | "onClosePanel" | "onShowMembers" | "onUpdateDetails" | "onToggleStar"> & { onClose?: () => void }) {
  const [topic, setTopic] = useState(channel.topic ?? "");
  const [description, setDescription] = useState(channel.description ?? "");
  const [isPrivate, setIsPrivate] = useState(Boolean(channel.isPrivate));

  useEffect(() => {
    setTopic(channel.topic ?? "");
    setDescription(channel.description ?? "");
    setIsPrivate(Boolean(channel.isPrivate));
  }, [channel.description, channel.id, channel.isPrivate, channel.topic]);

  return (
    <aside className="slack-context-panel" aria-label={`Informations sur ${channel.name}`}>
      <header className="slack-context-panel__header">
        <div><h2>Informations</h2><p>#{channel.name}</p></div>
        {onClose ? <HeaderButton label="Fermer les informations" onClick={onClose}><XIcon size={18} /></HeaderButton> : null}
      </header>
      <div className="slack-details">
        {onToggleStar ? (
          <section>
            <h3>Favoris</h3>
            <button type="button" onClick={onToggleStar}>
              <StarIcon size={14} fill={channel.starred ? "currentColor" : "none"} />
              {channel.starred ? "Retirer des favoris" : "Ajouter aux favoris"}
            </button>
          </section>
        ) : null}
        {onUpdateDetails ? (
          <form
            className="slack-details__form"
            data-pwa-dirty={
              topic !== (channel.topic ?? "") ||
              description !== (channel.description ?? "") ||
              isPrivate !== Boolean(channel.isPrivate)
                ? "true"
                : undefined
            }
            onSubmit={(event) => {
              event.preventDefault();
              onUpdateDetails({
                topic: topic.trim(),
                description: description.trim(),
                isPrivate,
              });
            }}
          >
            <label>Sujet<input value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={120} /></label>
            <label>Description<textarea data-composer-input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={4} /></label>
            <label className="slack-details__privacy"><input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} /> Limiter aux membres du salon</label>
            <p className="slack-details__local-note">Restriction simulée localement pour la maquette ; ce n’est pas une autorisation serveur.</p>
            <button type="submit">Enregistrer les informations</button>
          </form>
        ) : (
          <>
            <section><h3>Sujet</h3><p>{channel.topic || "Aucun sujet défini."}</p></section>
            <section><h3>À propos de ce salon</h3><p>{channel.description || "Aucune description définie."}</p></section>
          </>
        )}
        <section><h3>Membres</h3><p>{channel.memberNames?.length ?? 0} membre{(channel.memberNames?.length ?? 0) > 1 ? "s" : ""}</p>{onShowMembers ? <button type="button" onClick={onShowMembers}>Voir les membres</button> : null}</section>
      </div>
    </aside>
  );
}

function HeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className="slack-icon-button" aria-label={label} onClick={onClick}>{children}</button>;
}

function EmptyTab({ tab }: { tab: SlackChannelTab }) {
  const label = tab === "messages" ? "Aucun message pour l’instant." : tab === "files" ? "Aucun fichier partagé dans ce salon." : "Aucun message épinglé dans ce salon.";
  return <p className="slack-empty-state">{label}</p>;
}

function isSameDay(left: string, right: string) {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  return !Number.isNaN(leftDate.getTime()) && !Number.isNaN(rightDate.getTime()) &&
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate();
}

function canGroupMessages(previous: SlackChannelMessage, message: SlackChannelMessage) {
  const previousTime = new Date(previous.createdAt).getTime();
  const messageTime = new Date(message.createdAt).getTime();
  return previous.author === message.author &&
    !previous.parentMessageId &&
    !message.parentMessageId &&
    isSameDay(previous.createdAt, message.createdAt) &&
    !Number.isNaN(previousTime) &&
    !Number.isNaN(messageTime) &&
    messageTime - previousTime < 5 * 60 * 1000;
}

function DayDivider({ value }: { value: string }) {
  const date = new Date(value);
  const label = Number.isNaN(date.getTime())
    ? "Messages"
    : new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(date);
  return <div className="slack-day-divider"><span>{label}</span></div>;
}
