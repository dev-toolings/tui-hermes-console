/** Authentification SSH : déléguée au binaire `ssh` (agent/clé/~/.ssh/config)
 *  ou portée par ssh2 avec un mot de passe stocké chiffré. */
export type SshAuth = "agent" | "password";

export type SshTarget = {
  host: string;
  port: number;
  user: string;
  auth: SshAuth;
  /** Uniquement pour auth === "password". */
  password?: string;
};


export type SshExecResult = {
  stdout: string;
  stderr: string;
  code: number;
};

export type SshCommandOutput = {
  stream: "stdout" | "stderr";
  chunk: string;
};

export type SshCommandSession = {
  onOutput(listener: (output: SshCommandOutput) => void): () => void;
  write(input: string): void;
  endInput(): void;
  kill(): void;
  result: Promise<SshExecResult>;
};

/** Une connexion SSH partagée : le port-forward HTTP et le SFTP des artefacts
 *  passent par le même canal, donc une seule authentification. */
export type SshChannel = {
  /** Ouvre (ou réutilise) un forward local et renvoie `http://127.0.0.1:<port>`. */
  forward(remoteHost: string, remotePort: number): Promise<string>;
  /** Exécute une commande produite côté serveur, jamais une chaîne fournie par le navigateur. */
  exec(command: string): Promise<SshExecResult>;
  /** Exécute une commande distante avec flux et entrée facultative, notamment pour les PTY Hermes. */
  start(
    command: string,
    options?: { pseudoTerminal?: boolean },
  ): Promise<SshCommandSession>;
  /** `sync` : arrêt du process — la fermeture doit aboutir avant de rendre la main. */
  close(sync?: boolean): void;
};
