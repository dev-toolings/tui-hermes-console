import type { MessageContent, Usage } from "../../types/domain";
import type { ThreadWorkflow } from "../../types/domain";

export type ProductRunStatus =
  | "pending"
  | "starting"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type ProductEventType =
  | "agent.message"
  | "agent.reasoning"
  | "tool.call"
  | "tool.result"
  | "approval.requested"
  | "approval.responded"
  | "run.completed"
  | "run.error"
  | "system.notice"
  | "raw";

export type ProductEventInput = {
  sequence: number;
  type: ProductEventType;
  payload: Record<string, unknown>;
  occurredAt: Date;
};

export type StoredProductEvent = ProductEventInput & {
  cursor: number;
  runId: string;
};

export type ThreadMessageDto = {
  id: string;
  role: "user" | "assistant";
  content: MessageContent;
  runId: string | null;
  createdAt: string;
};

export type RunDto = {
  id: string;
  status: ProductRunStatus;
  input: string;
  output: string | null;
  usage: Usage | null;
  error: string | null;
  hermesResponseId: string | null;
  runtimeSession: {
    id: string;
    model: string | null;
    reasoningTokens: number | null;
    toolCallCount: number | null;
  } | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  lastEventAt: string | null;
};

export type ArtifactDto = {
  id: string;
  runId: string;
  direction: "input" | "output";
  filename: string;
  mimeType: string | null;
  sizeBytes: number;
  checksumSha256: string;
  createdAt: string;
};

export type ThreadSource = "chat" | "mission";

export type ThreadSnapshot = {
  id: string;
  title: string;
  source: ThreadSource;
  workflow: ThreadWorkflow;
  agentName: string;
  instructions: string;
  provider?: string | null;
  model: string;
  /** Provider résolu au moment de la lecture (settings / agent lié). */
  effectiveProvider?: string | null;
  /** Modèle résolu au moment de la lecture (settings / agent lié). */
  effectiveModel: string;
  createdAt: string;
  updatedAt: string;
  messages: ThreadMessageDto[];
  runs: RunDto[];
  events: StoredProductEvent[];
  artifacts: ArtifactDto[];
  cursor: number;
};

/** Un point du graphique d'activité de l'Aperçu — la forme rendue par
 *  `GET /api/runs/activity`, produite côté serveur et lue côté UI. */
export type RunActivityPoint = {
  /** `YYYY-MM-DD`, en heure locale du serveur. */
  date: string;
  completed: number;
  failed: number;
  tokens: number;
};

/** Une ligne de `GET /api/threads` — la conversation et son dernier run. */
export type ThreadListItemDto = {
  id: string;
  title: string;
  source: ThreadSource;
  workflow: ThreadWorkflow;
  agentName: string;
  provider: string | null;
  model: string;
  updatedAt: string;
  latestRun: RunDto | null;
};
