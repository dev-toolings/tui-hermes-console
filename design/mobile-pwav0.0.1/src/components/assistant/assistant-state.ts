export const ASSISTANT_STORAGE_KEY = "hermes-console:assistant:v1";

export type AssistantAttachment = {
  id: string;
  name: string;
  size: number;
};

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  attachments?: AssistantAttachment[];
  streaming?: boolean;
};

export type AssistantSession = {
  id: string;
  title: string;
  updatedAt: string;
  messages: AssistantMessage[];
  draft: string;
  attachments: AssistantAttachment[];
  streamCursor?: number;
};

export type AssistantState = { sessions: AssistantSession[] };

const STREAM_REPLY =
  "Je prépare une réponse vérifiable. Je conserve le contexte de cette session, puis je proposerai les prochaines actions et les preuves attendues.";

const isoNow = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function createAssistantState(): AssistantState {
  const now = isoNow();
  return {
    sessions: [
      {
        id: "session-accueil",
        title: "Préparer la prochaine mission",
        updatedAt: now,
        draft: "",
        attachments: [],
        messages: [
          {
            id: "assistant-welcome",
            role: "assistant",
            createdAt: now,
            content:
              "Bonjour. Décris l'objectif, les contraintes et la preuve attendue. Je garde cette conversation disponible entre les onglets.",
          },
        ],
      },
    ],
  };
}

export function loadAssistantState(): AssistantState {
  try {
    const stored = localStorage.getItem(ASSISTANT_STORAGE_KEY);
    if (!stored) return createAssistantState();
    const value: unknown = JSON.parse(stored);
    if (!isState(value)) return createAssistantState();
    return value;
  } catch {
    return createAssistantState();
  }
}

export function saveAssistantState(state: AssistantState) {
  try {
    localStorage.setItem(ASSISTANT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* The assistant stays usable if storage is unavailable. */
  }
}

export function createSession(state: AssistantState): AssistantState {
  const now = isoNow();
  const session: AssistantSession = {
    id: id("session"),
    title: "Nouvelle conversation",
    updatedAt: now,
    draft: "",
    attachments: [],
    messages: [],
  };
  return { sessions: [session, ...state.sessions] };
}

export function updateDraft(
  state: AssistantState,
  sessionId: string,
  draft: string,
  attachments?: AssistantAttachment[],
): AssistantState {
  return updateSession(state, sessionId, (session) => ({
    ...session,
    draft,
    attachments: attachments ?? session.attachments,
  }));
}

export function sendAssistantMessage(
  state: AssistantState,
  sessionId: string,
): AssistantState {
  return updateSession(state, sessionId, (session) => {
    const content = session.draft.trim();
    if (!content && session.attachments.length === 0) return session;
    const now = isoNow();
    const userMessage: AssistantMessage = {
      id: id("user"),
      role: "user",
      content,
      createdAt: now,
      ...(session.attachments.length ? { attachments: session.attachments } : {}),
    };
    const assistantMessage: AssistantMessage = {
      id: id("assistant"),
      role: "assistant",
      content: "",
      createdAt: now,
      streaming: true,
    };
    return {
      ...session,
      title: session.messages.length ? session.title : content.slice(0, 56) || "Fichiers joints",
      updatedAt: now,
      draft: "",
      attachments: [],
      streamCursor: 0,
      messages: [...session.messages, userMessage, assistantMessage],
    };
  });
}

export function advanceAssistantStream(
  state: AssistantState,
  sessionId: string,
  step = 20,
): AssistantState {
  return updateSession(state, sessionId, (session) => {
    const target = Math.min((session.streamCursor ?? 0) + step, STREAM_REPLY.length);
    const messageIndex = findStreamingMessageIndex(session.messages);
    if (messageIndex < 0) return session;
    const messages = session.messages.map((message, index) =>
      index === messageIndex
        ? { ...message, content: STREAM_REPLY.slice(0, target), streaming: target < STREAM_REPLY.length }
        : message,
    );
    return {
      ...session,
      updatedAt: isoNow(),
      ...(target < STREAM_REPLY.length ? { streamCursor: target } : { streamCursor: undefined }),
      messages,
    };
  });
}

export function stopAssistantStream(state: AssistantState, sessionId: string): AssistantState {
  return updateSession(state, sessionId, (session) => ({
    ...session,
    streamCursor: undefined,
    messages: session.messages.map((message) =>
      message.streaming ? { ...message, streaming: false } : message,
    ),
  }));
}

function updateSession(
  state: AssistantState,
  sessionId: string,
  update: (session: AssistantSession) => AssistantSession,
): AssistantState {
  return {
    sessions: state.sessions.map((session) =>
      session.id === sessionId ? update(session) : session,
    ),
  };
}

function findStreamingMessageIndex(messages: AssistantMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].streaming) return index;
  }
  return -1;
}

function isState(value: unknown): value is AssistantState {
  if (!value || typeof value !== "object" || !Array.isArray((value as AssistantState).sessions)) return false;
  return (value as AssistantState).sessions.every((session) =>
    typeof session.id === "string" &&
    typeof session.title === "string" &&
    typeof session.updatedAt === "string" &&
    typeof session.draft === "string" &&
    Array.isArray(session.attachments) &&
    Array.isArray(session.messages),
  );
}
