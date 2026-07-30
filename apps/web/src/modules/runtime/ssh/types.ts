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

export type SftpOps = {
  mkdirp(remotePath: string): Promise<void>;
  list(remotePath: string): Promise<string[]>;
  upload(localPath: string, remotePath: string): Promise<void>;
  download(remotePath: string, localPath: string): Promise<void>;
};

/** Une connexion SSH partagée : le port-forward HTTP et le SFTP des artefacts
 *  passent par le même canal, donc une seule authentification. */
export type SshChannel = {
  /** Ouvre (ou réutilise) un forward local et renvoie `http://127.0.0.1:<port>`. */
  forward(remoteHost: string, remotePort: number): Promise<string>;
  sftp(): Promise<SftpOps>;
  /** `sync` : arrêt du process — la fermeture doit aboutir avant de rendre la main. */
  close(sync?: boolean): void;
};
