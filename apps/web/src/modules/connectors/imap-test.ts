import { connect as tlsConnect, type TLSSocket } from "node:tls";

type ImapTestInput = {
  host: string;
  port: number;
  email: string;
  password: string;
  timeoutMs?: number;
};

export class ImapTestError extends Error {
  constructor(
    readonly code: "IMAP_TIMEOUT" | "IMAP_CONNECT_FAILED" | "IMAP_AUTH_FAILED" | "IMAP_PROTOCOL_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "ImapTestError";
  }
}

/** Minimal IMAP LOGIN probe — no external dependency. */
export async function testImapLogin(input: ImapTestInput): Promise<void> {
  const timeoutMs = input.timeoutMs ?? 12_000;

  return new Promise((resolve, reject) => {
    let socket: TLSSocket | null = null;
    let buffer = "";
    let stage: "greeting" | "login" = "greeting";
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket?.destroy();
      if (error) reject(error);
      else resolve();
    };

    const timer = setTimeout(() => {
      finish(new ImapTestError("IMAP_TIMEOUT", "Délai dépassé lors du test IMAP."));
    }, timeoutMs);

    try {
      socket = tlsConnect(
        {
          host: input.host,
          port: input.port,
          servername: input.host,
          rejectUnauthorized: true,
        },
        () => {
          // wait for greeting
        },
      );
    } catch (error) {
      finish(
        new ImapTestError(
          "IMAP_CONNECT_FAILED",
          error instanceof Error ? error.message : "Connexion IMAP impossible.",
        ),
      );
      return;
    }

    const activeSocket = socket;
    if (!activeSocket) {
      finish(new ImapTestError("IMAP_CONNECT_FAILED", "Connexion IMAP impossible."));
      return;
    }

    activeSocket.on("error", (error) => {
      finish(
        new ImapTestError(
          "IMAP_CONNECT_FAILED",
          error instanceof Error ? error.message : "Connexion IMAP impossible.",
        ),
      );
    });

    activeSocket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");

      if (stage === "greeting") {
        if (!buffer.includes("\r\n")) return;
        if (!/^\* OK/i.test(buffer)) {
          finish(new ImapTestError("IMAP_PROTOCOL_ERROR", "Réponse IMAP inattendue."));
          return;
        }
        stage = "login";
        buffer = "";
        const escapedEmail = escapeImapString(input.email);
        const escapedPassword = escapeImapString(input.password);
        activeSocket?.write(`A1 LOGIN ${escapedEmail} ${escapedPassword}\r\n`);
        return;
      }

      if (buffer.includes("A1 OK")) {
        activeSocket?.write("A2 LOGOUT\r\n");
        finish();
        return;
      }

      if (buffer.includes("A1 NO") || buffer.includes("A1 BAD")) {
        finish(new ImapTestError("IMAP_AUTH_FAILED", "Authentification IMAP refusée."));
      }
    });
  });
}

function escapeImapString(value: string) {
  if (/^[\x20-\x7E]+$/.test(value) && !value.includes('"')) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  const bytes = Buffer.from(value, "utf8");
  return `{${bytes.length}}\r\n${value}`;
}
