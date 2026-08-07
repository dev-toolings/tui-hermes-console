import type { ThreadListItemDto, ThreadSnapshot } from "@console/core/modules/runs/types";

import type { MobileConnection } from "./session-store";

type ApiErrorBody = { error?: { code?: string; message?: string } };

export class ConsoleApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "ConsoleApiError";
  }
}

export class ConsoleApiClient {
  constructor(private readonly connection: MobileConnection) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.connection.apiUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.connection.sessionToken}`,
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
      throw new ConsoleApiError(response.status, body.error?.code ?? "API_ERROR", body.error?.message ?? "La Console n’a pas répondu correctement.");
    }
    return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
  }

  status() {
    return this.request<{ authenticated: boolean; user: { name: string | null; email: string } | null }>("/api/auth");
  }

  listThreads() {
    return this.request<{ threads: ThreadListItemDto[] }>("/api/threads");
  }

  thread(threadId: string) {
    return this.request<{ thread: ThreadSnapshot }>(`/api/threads/${encodeURIComponent(threadId)}`);
  }

  createThread(message: string) {
    return this.request<{ threadId: string; runId: string }>("/api/threads", { method: "POST", body: JSON.stringify({ message }) });
  }

  sendMessage(threadId: string, message: string) {
    return this.request<{ runId: string }>(`/api/threads/${encodeURIComponent(threadId)}/messages`, { method: "POST", body: JSON.stringify({ message }) });
  }

  logout() {
    return this.request<void>("/api/auth?action=logout", { method: "POST" });
  }

  respondApproval(runId: string, choice: "once" | "session" | "always" | "deny", approvalRequestId: string) {
    return this.request<void>(`/api/runs/${encodeURIComponent(runId)}/approval`, {
      method: "POST",
      body: JSON.stringify({ choice, approvalRequestId }),
    });
  }

  cancelRun(runId: string) {
    return this.request<void>(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" });
  }

  retryRun(runId: string) {
    return this.request<{ runId: string }>(`/api/runs/${encodeURIComponent(runId)}/retry`, { method: "POST" });
  }

  async artifactBytes(fileId: string) {
    const response = await fetch(`${this.connection.apiUrl}/api/files/${encodeURIComponent(fileId)}`, {
      headers: { authorization: `Bearer ${this.connection.sessionToken}` },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
      throw new ConsoleApiError(response.status, body.error?.code ?? "ARTIFACT_DOWNLOAD_FAILED", body.error?.message ?? "Téléchargement impossible.");
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}

export async function exchangePairingCode(apiUrl: string, pairingCode: string) {
  const response = await fetch(`${apiUrl.trim().replace(/\/$/, "")}/api/auth/mobile?action=exchange`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ pairingCode: pairingCode.trim() }),
  });
  const body = await response.json() as { sessionToken?: string; error?: { code?: string; message?: string } };
  if (!response.ok || !body.sessionToken) {
    throw new ConsoleApiError(response.status, body.error?.code ?? "MOBILE_PAIRING_FAILED", body.error?.message ?? "Association impossible.");
  }
  return body.sessionToken;
}
