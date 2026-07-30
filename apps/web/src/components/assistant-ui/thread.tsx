"use client";

import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { HermesAssistantMessage } from "@/components/run/assistant-message";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AuiIf,
  type AssistantState,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import { ArrowDownIcon, ArrowUpIcon, BrainIcon, SquareIcon } from "lucide-react";
import {
  createContext,
  useContext,
  type ComponentType,
  type FC,
} from "react";

export type ThreadComponents = {
  AssistantMessage?: ComponentType | undefined;
  Welcome?: ComponentType | undefined;
};

export type HermesThreadProps = {
  components?: ThreadComponents | undefined;
  showComposer?: boolean;
  loading?: boolean;
  /** `xulux` : ViewportFooter sticky composer (v1-xulux pattern). */
  layout?: "default" | "xulux";
};

const EMPTY_COMPONENTS: ThreadComponents = {};

const ThreadComponentsContext = createContext<ThreadComponents>(EMPTY_COMPONENTS);
const ThreadComposerContext = createContext(true);
const ThreadLoadingContext = createContext(false);
const ThreadLayoutContext = createContext<"default" | "xulux">("default");

const isNewChatView = (s: AssistantState) =>
  s.thread.messages.length === 0 && (!s.thread.isLoading || s.threads.isLoading);

export const HermesThread: FC<HermesThreadProps> = ({
  components = EMPTY_COMPONENTS,
  showComposer = true,
  loading = false,
  layout = "default",
}) => {
  const isEmpty = useAuiState(isNewChatView);

  return (
    <ThreadLayoutContext.Provider value={layout}>
      <ThreadComposerContext.Provider value={showComposer}>
        <ThreadLoadingContext.Provider value={loading}>
          <ThreadComponentsContext.Provider value={components}>
            <ThreadRoot isEmpty={isEmpty} />
          </ThreadComponentsContext.Provider>
        </ThreadLoadingContext.Provider>
      </ThreadComposerContext.Provider>
    </ThreadLayoutContext.Provider>
  );
};

const threadColumnClass = "mx-auto flex w-full max-w-(--thread-max-width) flex-col";
const threadGutterClass = "px-4 sm:px-6";

const threadTokens = {
  ["--thread-max-width" as string]: "44rem",
  ["--composer-bg" as string]:
    "color-mix(in oklab, var(--color-muted) 30%, var(--color-background))",
  ["--composer-radius" as string]: "1.5rem",
  ["--composer-padding" as string]: "8px",
};

const ThreadRoot: FC<{ isEmpty: boolean }> = ({ isEmpty }) => {
  const { Welcome = ThreadWelcome } = useContext(ThreadComponentsContext);
  const showComposer = useContext(ThreadComposerContext);
  const loading = useContext(ThreadLoadingContext);
  const layout = useContext(ThreadLayoutContext);

  if (layout === "xulux") {
    return (
      <ThreadPrimitive.Root
        className="aui-root aui-thread-root flex h-full min-h-0 flex-col bg-background"
        style={threadTokens}
      >
        <ThreadPrimitive.Viewport
          turnAnchor="top"
          autoScroll
          data-slot="aui_thread-viewport"
          className={cn(
            "relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-scroll overscroll-contain scroll-smooth px-4 pt-4",
            isEmpty && !loading && "justify-center",
          )}
        >
          {!loading && isEmpty ? <Welcome /> : null}
          {loading ? (
            <div className={cn(threadColumnClass, "flex-1")}>
              <ThreadSkeleton />
            </div>
          ) : (
            <div
              data-slot="aui_message-group"
              className="mx-auto mb-14 flex w-full max-w-(--thread-max-width) flex-col gap-y-6 empty:hidden"
            >
              <ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
            </div>
          )}

          <ThreadPrimitive.ViewportFooter
            className={cn(
              "aui-thread-viewport-footer mx-auto flex w-full max-w-(--thread-max-width) flex-col gap-4 overflow-visible bg-background pb-4 md:pb-6",
              !isEmpty && !loading && "sticky bottom-0 mt-auto rounded-t-(--composer-radius)",
            )}
          >
            <ThreadScrollToBottom />
            {showComposer ? <Composer /> : null}
          </ThreadPrimitive.ViewportFooter>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
    );
  }

  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root flex h-full min-h-0 flex-col bg-ai-secondary"
      style={threadTokens}
    >
      {loading ? (
        <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", threadGutterClass)}>
          <div className={cn(threadColumnClass, "flex-1")}>
            <ThreadSkeleton />
          </div>
        </div>
      ) : isEmpty && showComposer ? (
        <div className={cn("flex min-h-0 flex-1 flex-col", threadGutterClass)}>
          <div className={cn(threadColumnClass, "min-h-0 flex-1 gap-10")}>
            <div className="flex flex-1 flex-col items-center justify-center overflow-hidden">
              <Welcome />
            </div>
            <div className="shrink-0 pb-4 md:pb-6">
              <Composer />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <ThreadPrimitive.Viewport
            turnAnchor="top"
            autoScroll
            data-slot="aui_thread-viewport"
            className="relative flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-scroll overscroll-contain scroll-smooth px-4 pt-4"
          >
            <div
              data-slot="aui_message-group"
              className="flex w-full flex-col gap-y-6 pb-4"
            >
              <ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
            </div>
          </ThreadPrimitive.Viewport>

          <div className={cn(threadColumnClass, "relative shrink-0 px-4 pb-4 md:pb-6")}>
            <ThreadScrollToBottom />
            {showComposer ? <Composer /> : null}
          </div>
        </div>
      )}
    </ThreadPrimitive.Root>
  );
};

const ThreadScrollToBottom: FC = () => (
  <ThreadPrimitive.ScrollToBottom asChild>
    <TooltipIconButton
      tooltip="Revenir en bas"
      variant="outline"
      className="absolute -top-12 left-1/2 z-10 size-8 -translate-x-1/2 rounded-full border-ai-separator bg-background p-0 shadow-board-xs disabled:invisible"
    >
      <ArrowDownIcon className="size-4" />
    </TooltipIconButton>
  </ThreadPrimitive.ScrollToBottom>
);

const ThreadSkeleton: FC = () => (
  <div aria-hidden className="mt-auto flex w-full flex-col gap-6 pb-4">
    <div className="ms-auto h-12 w-[min(72%,18rem)] animate-pulse rounded-2xl bg-muted" />
    <div className="h-24 w-[min(88%,28rem)] animate-pulse rounded-2xl bg-muted" />
    <div className="h-10 w-40 animate-pulse rounded-full bg-muted" />
  </div>
);

const ThreadMessage: FC = () => {
  const { AssistantMessage: AssistantMessageComponent = HermesAssistantMessage } =
    useContext(ThreadComponentsContext);
  const role = useAuiState((s) => s.message.role);
  if (role === "user") return <UserMessage />;
  return <AssistantMessageComponent />;
};

const ThreadWelcome: FC = () => (
  <div className="aui-thread-welcome-root mx-auto mb-6 flex w-full max-w-(--thread-max-width) flex-col items-center gap-2 px-4 text-center">
    <span className="flex size-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
      <BrainIcon className="size-5" />
    </span>
    <h1 className="aui-thread-welcome-message text-sm font-medium">Conversation Hermes</h1>
    <p className="max-w-sm text-[0.8125rem] text-muted-foreground">
      Outils, raisonnement et réponses s&apos;affichent ici dans l&apos;ordre du stream.
    </p>
  </div>
);

const Composer: FC = () => (
  <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
    <div
      data-slot="aui_composer-shell"
      className="flex w-full flex-col gap-2 rounded-(--composer-radius) border border-ai-separator bg-(--composer-bg) p-(--composer-padding) shadow-board-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20"
    >
      <ComposerPrimitive.Input
        placeholder="Écrire à l'agent Hermes"
        className="aui-composer-input max-h-32 min-h-10 w-full resize-none bg-transparent px-2.5 py-1 text-[0.875rem] text-foreground outline-none placeholder:text-muted-foreground scrollbar-subtle"
        rows={1}
        enterKeyHint="send"
        aria-label="Message"
      />
      <ComposerAction />
    </div>
  </ComposerPrimitive.Root>
);

const ComposerAction: FC = () => (
  <div className="aui-composer-action-wrapper relative flex w-full items-center justify-end">
    <AuiIf condition={(s) => !s.thread.isRunning}>
      <ComposerPrimitive.Send asChild>
        <TooltipIconButton
          tooltip="Envoyer"
          type="button"
          variant="default"
          size="icon"
          className="aui-composer-send size-9 shrink-0 rounded-full"
          aria-label="Envoyer le message"
        >
          <ArrowUpIcon className="size-4" strokeWidth={2.25} />
        </TooltipIconButton>
      </ComposerPrimitive.Send>
    </AuiIf>
    <AuiIf condition={(s) => s.thread.isRunning}>
      <ComposerPrimitive.Cancel asChild>
        <Button
          type="button"
          variant="default"
          size="icon"
          className="aui-composer-cancel size-9 shrink-0 rounded-full"
          aria-label="Arrêter la réponse"
        >
          <SquareIcon className="size-3 fill-current" />
        </Button>
      </ComposerPrimitive.Cancel>
    </AuiIf>
  </div>
);

const UserMessage: FC = () => (
  <MessagePrimitive.Root
    data-slot="aui_user-message-root"
    className="fade-in slide-in-from-bottom-1 animate-in mx-auto w-full max-w-(--thread-max-width) px-2 duration-150"
    data-role="user"
  >
    <div className="aui-user-message-content-wrapper relative min-w-0">
      <div className="aui-user-message-content ms-auto w-fit max-w-[88%] rounded-xl bg-muted px-3 py-[11px] text-foreground empty:hidden">
        <MessagePrimitive.Parts
          components={{
            Text: ({ text }) => (
              <span className="whitespace-pre-wrap wrap-break-word">{text}</span>
            ),
          }}
        />
      </div>
    </div>
  </MessagePrimitive.Root>
);

/** @deprecated Utiliser `HermesAssistantMessage` — conservé pour override registry. */
export const AssistantMessage = HermesAssistantMessage;
