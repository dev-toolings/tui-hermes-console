import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  AssistantRuntimeProvider,
  AttachmentPrimitive,
  ComposerPrimitive,
  useAui,
  useAuiState,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FileIcon,
  MenuIcon,
  MessageSquarePlusIcon,
  PanelLeftCloseIcon,
  PlusIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import {
  advanceAssistantStream,
  createSession,
  loadAssistantState,
  saveAssistantState,
  sendAssistantMessage,
  stopAssistantStream,
  updateDraft,
  type AssistantAttachment,
  type AssistantMessage,
  type AssistantSession,
} from "./assistant-state";
import {
  assistantAttachmentAdapter,
  addAcceptedAttachments,
  attachmentsFromAppendMessage,
  hydrateAssistantComposerOnce,
  openAssistantAttachmentPicker,
  toAssistantAttachments,
} from "./composer-attachments";
import { truncateFileName } from "../ui/file-name";
import { orgPath } from "../mobile/mobile-nav";
import {
  DEFAULT_DRAWER_WIDTH,
  DRAWER_EDGE_SIZE,
  clampDrawerProgress,
  drawerFocusable,
  getDrawerSwipeAxis,
  shouldOpenDrawer,
  shouldRestoreDrawerTriggerFocus,
} from "../mobile/drawer";
import "./assistant.css";

// Re-exported for the existing unit tests, which cover the drawer maths here.
export {
  clampDrawerProgress,
  getDrawerSwipeAxis,
  shouldOpenDrawer,
  shouldRestoreDrawerTriggerFocus,
};

/**
 * No composer control may take the focus off the textarea: the blur closes the
 * virtual keyboard, the shell grows back under the finger, and the tap lands on
 * whatever slid into place instead of the button.
 *
 * Bound to `mousedown`, not `pointerdown`. The spec says preventing the default
 * on `pointerdown` suppresses the compatibility mouse events and therefore the
 * focus, and Chrome honours it, but WebKit still moves the focus and closes the
 * keyboard. `mousedown` is the event iOS actually derives the focus from, and
 * both engines still fire the click afterwards.
 */
const keepComposerFocus = (event: MouseEvent<HTMLButtonElement>) =>
  event.preventDefault();

export function shouldFollowThreadResize(
  pinned: boolean,
  composer: Pick<Node, "contains"> | null,
  activeElement: Node | null,
) {
  return pinned && !composer?.contains(activeElement);
}

type DrawerSwipe = {
  axis: "pending" | "horizontal" | "vertical";
  drawerWidth: number;
  pointerId: number;
  startProgress: number;
  startTime: number;
  startX: number;
  startY: number;
};

/** Local assistant surface with a runtime scoped to the active session. */
export function AssistantPage() {
  const { org = "", sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState(loadAssistantState);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerDragging, setDrawerDragging] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const pageRef = useRef<HTMLElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerWasOpenRef = useRef(drawerOpen);
  const drawerProgressRef = useRef(0);
  const drawerSwipeRef = useRef<DrawerSwipe | null>(null);
  const suppressDrawerClickRef = useRef(false);
  const pinnedRef = useRef(true);
  const sessions = state.sessions;
  const activeSession =
    sessions.find((session) => session.id === sessionId) ?? sessions[0];

  useEffect(() => saveAssistantState(state), [state]);

  useEffect(() => {
    if (!activeSession || !activeSession.messages.some((message) => message.streaming)) return;
    const interval = window.setInterval(
      () => setState((current) => advanceAssistantStream(current, activeSession.id)),
      55,
    );
    return () => window.clearInterval(interval);
  }, [activeSession?.id, activeSession?.messages]);

  useEffect(() => {
    const element = threadRef.current;
    if (!element) return;
    const onScroll = () => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
      pinnedRef.current = distance <= 96;
      setShowJump(distance > 96);
    };
    onScroll();
    element.addEventListener("scroll", onScroll, { passive: true });
    // The keyboard shrinks the thread instead of scrolling it, so a reader
    // sitting at the latest turn would silently lose it behind the composer.
    const observer = new ResizeObserver(() => {
      const composer = element.parentElement?.querySelector(".assistant-composer") ?? null;
      if (shouldFollowThreadResize(pinnedRef.current, composer, document.activeElement)) {
        element.scrollTop = element.scrollHeight;
      }
    });
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [activeSession?.id, activeSession?.messages.length]);

  useEffect(() => {
    const wasOpen = drawerWasOpenRef.current;
    drawerWasOpenRef.current = drawerOpen;
    if (shouldRestoreDrawerTriggerFocus(wasOpen, drawerOpen)) {
      drawerTriggerRef.current?.focus();
    }
  }, [drawerOpen]);

  const sessionPath = (id: string) => ({
    pathname: orgPath(org, `/hermes/${encodeURIComponent(id)}`),
    search: location.search,
  });
  const selectSession = (id: string) => {
    settleDrawer(false);
    navigate(sessionPath(id));
  };
  const addSession = () => {
    const next = createSession(state);
    const created = next.sessions[0];
    setState(next);
    navigate(sessionPath(created.id));
    settleDrawer(false);
  };
  const jumpToLatest = () => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  const setDrawerVisualProgress = (progress: number, width?: number) => {
    const nextProgress = clampDrawerProgress(progress);
    const drawerWidth =
      width ?? drawerRef.current?.getBoundingClientRect().width ?? DEFAULT_DRAWER_WIDTH;
    drawerProgressRef.current = nextProgress;
    pageRef.current?.style.setProperty(
      "--assistant-drawer-progress",
      String(nextProgress),
    );
    pageRef.current?.style.setProperty(
      "--assistant-drawer-x",
      `${Math.round(nextProgress * drawerWidth)}px`,
    );
  };
  const settleDrawer = (open: boolean) => {
    setDrawerDragging(false);
    setDrawerOpen(open);
    window.requestAnimationFrame(() => {
      setDrawerVisualProgress(open ? 1 : 0);
    });
  };
  const isMobileDrawer = () => window.matchMedia("(max-width: 1023px)").matches;
  const onDrawerPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!isMobileDrawer() || event.pointerType === "mouse") return;
    if (!drawerOpen && event.clientX > DRAWER_EDGE_SIZE) return;
    const drawerWidth = drawerRef.current?.getBoundingClientRect().width || DEFAULT_DRAWER_WIDTH;
    drawerSwipeRef.current = {
      axis: "pending",
      drawerWidth,
      pointerId: event.pointerId,
      startProgress: drawerProgressRef.current,
      startTime: event.timeStamp,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onDrawerPointerMove = (event: PointerEvent<HTMLElement>) => {
    const swipe = drawerSwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId || swipe.axis === "vertical") return;
    const distanceX = event.clientX - swipe.startX;
    const distanceY = event.clientY - swipe.startY;
    if (swipe.axis === "pending") {
      const axis = getDrawerSwipeAxis(distanceX, distanceY);
      if (axis === "pending") return;
      if (axis === "vertical") {
        swipe.axis = "vertical";
        return;
      }
      if ((!drawerOpen && distanceX < 0) || (drawerOpen && distanceX > 0)) {
        swipe.axis = "vertical";
        return;
      }
      swipe.axis = "horizontal";
      setDrawerDragging(true);
    }
    event.preventDefault();
    suppressDrawerClickRef.current = true;
    setDrawerVisualProgress(
      swipe.startProgress + distanceX / swipe.drawerWidth,
      swipe.drawerWidth,
    );
  };
  const finishDrawerSwipe = (event: PointerEvent<HTMLElement>) => {
    const swipe = drawerSwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    drawerSwipeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (swipe.axis !== "horizontal") return;
    const distanceX = event.clientX - swipe.startX;
    const elapsed = Math.max(1, event.timeStamp - swipe.startTime);
    const progress = clampDrawerProgress(swipe.startProgress + distanceX / swipe.drawerWidth);
    settleDrawer(shouldOpenDrawer(progress, distanceX / elapsed));
    window.setTimeout(() => {
      suppressDrawerClickRef.current = false;
    }, 0);
  };
  const cancelDrawerSwipe = (event: PointerEvent<HTMLElement>) => {
    const swipe = drawerSwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    drawerSwipeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    suppressDrawerClickRef.current = false;
    settleDrawer(drawerOpen);
  };
  const onDrawerClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (!suppressDrawerClickRef.current) return;
    suppressDrawerClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };
  const drawerVisible = drawerOpen || drawerDragging;

  if (!activeSession) return null;

  return (
    <section
      ref={pageRef}
      className="assistant-page"
      aria-label="Assistant Hermes"
      data-drawer-dragging={drawerDragging || undefined}
      onPointerDown={onDrawerPointerDown}
      onPointerMove={onDrawerPointerMove}
      onPointerUp={finishDrawerSwipe}
      onPointerCancel={cancelDrawerSwipe}
      onLostPointerCapture={cancelDrawerSwipe}
      onClickCapture={onDrawerClickCapture}
    >
      {!drawerVisible ? <div className="assistant-drawer-edge" aria-hidden="true" /> : null}
      <SessionSidebar
        panelRef={drawerRef}
        sessions={sessions}
        activeId={activeSession.id}
        onSelect={selectSession}
        onNew={addSession}
        mobileOpen={drawerOpen}
        visible={drawerVisible}
        onClose={() => settleDrawer(false)}
      />
      <button
        type="button"
        className={`assistant-drawer-backdrop ${drawerOpen ? "is-open" : ""}`}
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => settleDrawer(false)}
      />
      <div
        className={`assistant-page__conversation ${drawerVisible ? "is-shifted" : ""}`}
        inert={drawerOpen ? true : undefined}
      >
        <button
          ref={drawerTriggerRef}
          type="button"
          className="assistant-page__menu"
          aria-label="Ouvrir les conversations"
          aria-expanded={drawerOpen}
          onClick={() => settleDrawer(true)}
        >
          <MenuIcon aria-hidden="true" size={20} />
        </button>
        <header className="assistant-page__header">
          <div className="assistant-page__identity">
            <p className="assistant-page__eyebrow">Hermes</p>
            <h1>{activeSession.title}</h1>
          </div>
          <button type="button" className="assistant-page__new" onClick={addSession}>
            <MessageSquarePlusIcon aria-hidden="true" size={17} />
            <span>Nouvelle conversation</span>
          </button>
        </header>
        <div className="assistant-page__thread" ref={threadRef}>
          <div className="assistant-page__thread-inner">
            {activeSession.messages.length === 0 ? <EmptyState /> : null}
            {activeSession.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>
        </div>
        <div className="assistant-page__composer-wrap">
          {showJump ? (
            <button type="button" className="assistant-page__jump" onClick={jumpToLatest}>
              <ArrowDownIcon aria-hidden="true" size={16} /> Dernier message
            </button>
          ) : null}
          <Composer
            session={activeSession}
            onChange={(draft, attachments) =>
              setState((current) => updateDraft(current, activeSession.id, draft, attachments))
            }
            onSend={(draft, attachments) => {
              setState((current) =>
                sendAssistantMessage(
                  updateDraft(current, activeSession.id, draft, attachments),
                  activeSession.id,
                ),
              );
              window.requestAnimationFrame(jumpToLatest);
            }}
            onStop={() => setState((current) => stopAssistantStream(current, activeSession.id))}
          />
          <p className="assistant-page__disclaimer">
            Maquette locale, messages et fichiers restent dans ce navigateur.
          </p>
        </div>
      </div>
    </section>
  );
}

function SessionSidebar({
  panelRef,
  sessions,
  activeId,
  onSelect,
  onNew,
  mobileOpen,
  visible,
  onClose,
}: {
  panelRef: React.RefObject<HTMLElement | null>;
  sessions: AssistantSession[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  mobileOpen: boolean;
  visible: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [mobileOpen]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!mobileOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = drawerFocusable(panelRef.current);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <aside
        ref={panelRef}
        className={`assistant-sidebar ${mobileOpen ? "is-open" : ""} ${visible ? "is-visible" : ""}`}
        aria-label="Conversations"
        aria-modal={mobileOpen ? "true" : undefined}
        role={mobileOpen ? "dialog" : undefined}
        onKeyDown={handleKeyDown}
      >
        <header className="assistant-sidebar__header">
          <strong>Conversations</strong>
          <button ref={closeRef} type="button" className="assistant-icon-button assistant-sidebar__close" onClick={onClose} aria-label="Fermer les conversations">
            <XIcon aria-hidden="true" size={20} />
          </button>
        </header>
        <button type="button" className="assistant-sidebar__new" onClick={onNew}>
          <MessageSquarePlusIcon aria-hidden="true" size={17} /> Nouvelle conversation
        </button>
        <nav className="assistant-sidebar__list" aria-label="Sessions Hermes">
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className={session.id === activeId ? "is-active" : ""}
              aria-current={session.id === activeId ? "page" : undefined}
              onClick={() => onSelect(session.id)}
            >
              <span>{session.title}</span>
              <small>{formatSessionTime(session.updatedAt)}</small>
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}

function Composer({
  session,
  onChange,
  onSend,
  onStop,
}: {
  session: AssistantSession;
  onChange: (draft: string, attachments: AssistantAttachment[]) => void;
  onSend: (draft: string, attachments: AssistantAttachment[]) => void;
  onStop: () => void;
}) {
  return (
    <AssistantComposerRuntime
      key={session.id}
      session={session}
      onChange={onChange}
      onSend={onSend}
      onStop={onStop}
    />
  );
}

function AssistantComposerRuntime({
  session,
  onChange,
  onSend,
  onStop,
}: {
  session: AssistantSession;
  onChange: (draft: string, attachments: AssistantAttachment[]) => void;
  onSend: (draft: string, attachments: AssistantAttachment[]) => void;
  onStop: () => void;
}) {
  const streaming = session.messages.some((message) => message.streaming);
  const runtime = useExternalStoreRuntime({
    messages: [] as ThreadMessageLike[],
    convertMessage: (message: ThreadMessageLike) => message,
    isRunning: streaming,
    onNew: async (message: AppendMessage) => {
      onSend(
        message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n"),
        attachmentsFromAppendMessage(message, session.attachments),
      );
    },
    onCancel: async () => onStop(),
    adapters: { attachments: assistantAttachmentAdapter },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <RuntimeComposer session={session} onChange={onChange} streaming={streaming} />
    </AssistantRuntimeProvider>
  );
}

function RuntimeComposer({
  session,
  onChange,
  streaming,
}: {
  session: AssistantSession;
  onChange: (draft: string, attachments: AssistantAttachment[]) => void;
  streaming: boolean;
}) {
  const aui = useAui();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerCleanupRef = useRef<() => void>(() => {});
  const hydrationRef = useRef<Promise<void> | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const draft = useAuiState((state) => state.composer.text);
  const attachments = useAuiState((state) => state.composer.attachments);
  const canSend = useAuiState((state) => state.composer.canSend);
  const persistedAttachments = toAssistantAttachments(attachments, session.attachments);
  const attachmentKey = persistedAttachments
    .map((attachment) => `${attachment.id}:${attachment.name}:${attachment.size}`)
    .join("|");

  useEffect(() => {
    let mounted = true;
    void hydrateAssistantComposerOnce(
      hydrationRef,
      aui.composer,
      session.draft,
    ).then(() => {
      if (mounted) setHydrated(true);
    });
    return () => {
      mounted = false;
    };
  }, [session.id]);

  useEffect(() => {
    if (!hydrated) return;
    onChange(draft, persistedAttachments);
  }, [attachmentKey, draft, hydrated]);

  useEffect(() => () => pickerCleanupRef.current(), []);

  return (
    <ComposerPrimitive.Root className="assistant-composer">
      <div className="assistant-composer__attachments" aria-label="Pièces jointes sélectionnées">
        <ComposerPrimitive.Attachments>{() => <ComposerAttachment />}</ComposerPrimitive.Attachments>
      </div>
      <ComposerPrimitive.Input
        ref={textareaRef}
        // assistant-ui ≥0.15 gates every built-in focus restore (mount, run
        // start, thread switch) behind this opt-in.
        autoFocus
        rows={1}
        maxLength={10_000}
        placeholder="Message… (@ agents, / commandes)"
        aria-label="Message à Hermes"
        enterKeyHint="send"
        submitMode="ctrlEnter"
        addAttachmentOnPaste={false}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData.files);
          if (!files.length) return;
          event.preventDefault();
          void addAcceptedAttachments(aui.composer, files);
        }}
      />
      <footer>
        <button
          type="button"
          className="assistant-icon-button"
          onMouseDown={keepComposerFocus}
          onClick={() => {
            pickerCleanupRef.current();
            pickerCleanupRef.current = openAssistantAttachmentPicker({
              composer: aui.composer,
            });
          }}
          aria-label="Ajouter une pièce jointe"
        >
          <PlusIcon aria-hidden="true" size={22} />
        </button>
        {streaming ? (
          <ComposerPrimitive.Cancel asChild>
            <button type="button" className="assistant-composer__send is-stop" onMouseDown={keepComposerFocus} aria-label="Arrêter la réponse">
              <SquareIcon aria-hidden="true" size={15} fill="currentColor" />
            </button>
          </ComposerPrimitive.Cancel>
        ) : (
          <ComposerPrimitive.Send asChild>
            <button type="submit" className="assistant-composer__send" onMouseDown={keepComposerFocus} disabled={!canSend} aria-label="Envoyer le message">
              <ArrowUpIcon aria-hidden="true" size={19} />
            </button>
          </ComposerPrimitive.Send>
        )}
      </footer>
    </ComposerPrimitive.Root>
  );
}

function ComposerAttachment() {
  const name = useAuiState((state) => state.attachment.name);
  const contentType = useAuiState((state) => state.attachment.contentType);
  const file = useAuiState((state) => state.attachment.file);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (
      typeof File === "undefined" ||
      !(file instanceof File) ||
      !file.type.startsWith("image/")
    ) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <AttachmentPrimitive.Root className="assistant-composer__attachment" title={name}>
      <div className="assistant-composer__attachment-preview" aria-hidden="true">
        {previewUrl ? <img src={previewUrl} alt="" /> : <FileIcon size={18} />}
      </div>
      <div className="assistant-composer__attachment-meta">
        <span className="assistant-composer__attachment-name"><AttachmentPrimitive.Name /></span>
        <span className="assistant-composer__attachment-type">{attachmentTypeLabel(contentType)}</span>
      </div>
      <AttachmentPrimitive.Remove asChild>
        <button
          type="button"
          onMouseDown={keepComposerFocus}
          aria-label={`Retirer ${name}`}
        >
          <XIcon aria-hidden="true" size={15} />
        </button>
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
}

function attachmentTypeLabel(contentType?: string) {
  if (contentType?.startsWith("image/")) return "Image";
  if (contentType === "application/pdf") return "PDF";
  if (contentType?.startsWith("text/")) return "Texte";
  return "Fichier";
}

function MessageBubble({ message }: { message: AssistantMessage }) {
  return (
    <article className={`assistant-message assistant-message--${message.role}`}>
      {message.role === "assistant" ? <p className="assistant-message__author">Hermes</p> : null}
      {message.attachments?.length ? (
        <ul className="assistant-message__attachments" aria-label="Fichiers joints">
          {message.attachments.map((attachment) => (
            <li key={attachment.id}><FileIcon aria-hidden="true" size={14} /><span title={attachment.name}>{truncateFileName(attachment.name)}</span></li>
          ))}
        </ul>
      ) : null}
      {message.content ? <MarkdownText value={message.content} /> : null}
      {message.streaming ? <span className="assistant-message__cursor" aria-label="Hermes rédige" /> : null}
      <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
    </article>
  );
}

function MarkdownText({ value }: { value: string }) {
  const parts = useMemo(() => value.split(/(```[\s\S]*?```)/g), [value]);
  return (
    <div className="assistant-markdown">
      {parts.map((part, index) =>
        part.startsWith("```") && part.endsWith("```") ? (
          <pre key={index}><code>{part.slice(3, -3).trim()}</code></pre>
        ) : (
          <p key={index}>{part}</p>
        ),
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="assistant-empty-state">
      <PanelLeftCloseIcon aria-hidden="true" size={24} />
      <h2>Une conversation, une intention vérifiable</h2>
      <p>Décris le résultat attendu, les contraintes et la preuve qui permettra de conclure.</p>
    </div>
  );
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatSessionTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(value));
}

export default AssistantPage;
