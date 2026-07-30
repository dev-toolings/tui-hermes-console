import { HermesRuntimeError } from "../hermes-adapter";

/** Traduit une erreur ssh2 en HermesRuntimeError avec un code exploitable par l'UI. */
export function mapSshError(error: unknown): HermesRuntimeError {
  if (error instanceof HermesRuntimeError) return error;

  const level =
    typeof error === "object" && error && "level" in error
      ? String((error as { level?: unknown }).level)
      : "";
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  const message = error instanceof Error ? error.message : String(error);

  if (level === "client-authentication" || /authentication methods failed/i.test(message)) {
    return new HermesRuntimeError(
      "Authentification SSH refusée — vérifiez l’utilisateur et le mot de passe.",
      401,
      "SSH_AUTH_FAILED",
    );
  }

  if (
    ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH", "ETIMEDOUT"].includes(code) ||
    /timed out while waiting for handshake|getaddrinfo/i.test(message)
  ) {
    return new HermesRuntimeError(`Serveur SSH injoignable (${message}).`, 502, "SSH_UNREACHABLE");
  }

  return new HermesRuntimeError(`Tunnel SSH impossible (${message}).`, 502, "SSH_TUNNEL_FAILED");
}

/** Échec d'ouverture de canal côté ssh2. `reason` suit RFC 4254 §5.1 :
 *  1 = interdit par la configuration du serveur, 2 = connexion refusée côté distant. */
export function mapForwardError(error: unknown, remote: string): HermesRuntimeError {
  const reason =
    typeof error === "object" && error && "reason" in error
      ? Number((error as { reason?: unknown }).reason)
      : NaN;

  if (reason === 1) return forwardingDisabled();
  return forwardFailed(remote);
}

/** Traduit la sortie d'erreur du binaire `ssh`. Les motifs viennent d'OpenSSH ;
 *  l'ordre compte — le plus spécifique d'abord. */
export function mapSystemSshStderr(stderr: string, remote: string): HermesRuntimeError {
  const text = stderr.trim();

  if (/administratively prohibited/i.test(text)) return forwardingDisabled();

  if (/open failed: connect failed|channel .*: open failed/i.test(text)) {
    return forwardFailed(remote);
  }

  if (/permission denied \(([^)]*)\)/i.test(text) || /no more authentication methods/i.test(text)) {
    return new HermesRuntimeError(
      "SSH a refusé l’authentification par clé. Vérifiez qu’une clé autorisée sur cet hôte est chargée dans votre agent (`ssh-add -l`), ou basculez sur l’authentification par mot de passe.",
      401,
      "SSH_AGENT_NO_KEY",
    );
  }

  if (/host key verification failed|remote host identification has changed/i.test(text)) {
    return new HermesRuntimeError(
      "Clé d’hôte inconnue ou modifiée. Connectez-vous une fois manuellement (`ssh <hôte>`) pour la valider.",
      502,
      "SSH_HOST_KEY_UNKNOWN",
    );
  }

  if (
    /could not resolve hostname|connection refused|no route to host|host is down|operation timed out|connection timed out|network is unreachable|connection closed by remote host/i.test(
      text,
    )
  ) {
    return new HermesRuntimeError(
      `Serveur SSH injoignable (${firstLine(text)}).`,
      502,
      "SSH_UNREACHABLE",
    );
  }

  if (/address already in use|cannot listen to port/i.test(text)) {
    return new HermesRuntimeError(
      `Le port local du tunnel est déjà pris (${firstLine(text)}).`,
      502,
      "SSH_LOCAL_PORT_BUSY",
    );
  }

  return new HermesRuntimeError(
    `Tunnel SSH impossible (${firstLine(text) || "erreur inconnue"}).`,
    502,
    "SSH_TUNNEL_FAILED",
  );
}

/** Clé d'hôte refusée côté `ssh2` — même code produit que le chemin `agent`,
 *  pour que l'utilisateur voie la même erreur quel que soit le mode d'auth. */
export function sshHostKeyRejected(reason: "unknown_host" | "key_mismatch" | "revoked") {
  const message =
    reason === "key_mismatch"
      ? "La clé d’hôte SSH ne correspond pas à celle enregistrée dans known_hosts. Connexion interrompue : quelqu’un peut intercepter le trafic."
      : reason === "revoked"
        ? "La clé d’hôte SSH de ce serveur est marquée comme révoquée dans known_hosts."
        : "Clé d’hôte inconnue. Connectez-vous une fois manuellement (`ssh <hôte>`) pour la valider avant d’utiliser le tunnel.";
  return new HermesRuntimeError(message, 502, "SSH_HOST_KEY_UNKNOWN");
}

export function sshBinaryMissing() {
  return new HermesRuntimeError(
    "Binaire `ssh` introuvable sur cette machine. Installez OpenSSH ou basculez sur l’authentification par mot de passe.",
    503,
    "SSH_BINARY_MISSING",
  );
}

function forwardingDisabled() {
  return new HermesRuntimeError(
    "Le serveur SSH refuse le port forwarding. Activez `AllowTcpForwarding yes` dans sshd_config côté machine distante.",
    502,
    "SSH_FORWARDING_DISABLED",
  );
}

function forwardFailed(remote: string) {
  return new HermesRuntimeError(
    `Tunnel SSH établi, mais rien n’écoute sur ${remote} côté distant.`,
    502,
    "SSH_FORWARD_FAILED",
  );
}

function firstLine(text: string) {
  return text.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? "";
}
