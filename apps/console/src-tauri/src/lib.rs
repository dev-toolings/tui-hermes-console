use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// Nom du fichier de configuration, dans le répertoire de config de l'app.
const CONFIG_FILE: &str = "console.env";

/// Gabarit écrit au premier lancement, quand aucune configuration n'existe.
const CONFIG_TEMPLATE: &str = r#"# Configuration de Hermes Console.
#
# Ce fichier vit dans le répertoire de configuration de l'application, pas dans
# le dépôt : une application installée n'a pas de dépôt à côté d'elle.
#
# Renseignez au moins DATABASE_URL et APP_ENCRYPTION_KEY, puis relancez.

# Postgres joignable depuis cette machine.
DATABASE_URL=postgres://test:test@localhost:5432/hermes_console

# Chiffre le token du runtime au repos. 64 caractères hexadécimaux :
#   openssl rand -hex 32
APP_ENCRYPTION_KEY=

# Volume de travail partagé avec l'hôte Hermes — même chemin des deux côtés.
HERMES_SHARED_WORKDIR=/tmp/hermes-console-work
"#;

/// Les clés sans lesquelles le serveur ne peut rien faire d'utile.
const REQUIRED_KEYS: [&str; 2] = ["DATABASE_URL", "APP_ENCRYPTION_KEY"];

/// Lit un fichier `CLÉ=valeur`.
///
/// Volontairement minimal : pas d'interpolation, pas de `export`, pas de
/// guillemets multi-lignes. Une clé de chiffrement ou une URL Postgres n'en ont
/// pas besoin, et un parseur plus permissif inventerait des façons de mal lire
/// un secret.
fn read_env_file(path: &Path) -> HashMap<String, String> {
    let Ok(contents) = fs::read_to_string(path) else {
        return HashMap::new();
    };

    contents
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let (key, value) = line.split_once('=')?;
            let value = value.trim();
            // Les guillemets encadrants sont tolérés parce que beaucoup d'outils
            // en écrivent, mais ils ne font pas partie de la valeur.
            let value = value
                .strip_prefix('"')
                .and_then(|v| v.strip_suffix('"'))
                .unwrap_or(value);
            Some((key.trim().to_string(), value.to_string()))
        })
        .collect()
}

/// Emplacement du fichier de configuration, en le créant au besoin.
fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let dir = app.path().app_config_dir()?;
    fs::create_dir_all(&dir)?;
    let path = dir.join(CONFIG_FILE);

    if !path.exists() {
        // Écrire le gabarit plutôt que d'échouer en silence : l'utilisateur a
        // alors un fichier à remplir et un chemin à ouvrir.
        fs::write(&path, CONFIG_TEMPLATE)?;
        eprintln!("[tauri] configuration créée : {}", path.display());
    }

    Ok(path)
}

/// Démarre le serveur Console en sidecar.
///
/// C'est le cœur du choix d'architecture : plutôt que réécrire en Rust le
/// runner SSE, le tunnel SSH (`ssh2`), le chiffrement AES-256-GCM et la
/// réconciliation — déjà validés et testés — on embarque le serveur tel quel.
/// La migration vers Rust reste possible morceau par morceau, sans big-bang.
fn spawn_console_server(
    app: &tauri::AppHandle,
    config: &HashMap<String, String>,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut command = app
        .shell()
        .sidecar("hermes-server")?
        // Boucle locale uniquement : le serveur ne doit jamais être joignable
        // depuis le réseau, il détient les secrets runtime déchiffrés.
        .env("CONSOLE_SERVER_HOST", "127.0.0.1")
        .env("CONSOLE_SERVER_PORT", "3170")
        // Ferme l'origine du serveur Vite une fois empaquetée : plus rien ne
        // sert le SPA sur :1420, l'autoriser n'ouvrirait qu'une porte de plus.
        // En `tauri dev`, la fenêtre charge justement depuis :1420 — d'où la
        // distinction, que `cfg!(dev)` fournit (posé par tauri-build).
        .env(
            "NODE_ENV",
            if cfg!(dev) { "development" } else { "production" },
        );

    for (key, value) in config {
        command = command.env(key, value);
    }

    let (mut rx, _child) = command.spawn()?;

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                    eprintln!("[server] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(payload) => {
                    // Un sidecar mort laisse une fenêtre qui ne chargera jamais
                    // rien. Le dire fort : c'est arrivé une fois avec un port
                    // 3170 déjà pris, et l'écran restait simplement vide.
                    eprintln!(
                        "[server] SIDECAR ARRÊTÉ (code {:?}) — la Console n'a plus d'API.",
                        payload.code
                    );
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

fn open_main_window(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("Hermes Console")
        .inner_size(1440.0, 900.0)
        .min_inner_size(320.0, 480.0)
        .resizable(true)
        .build()?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle();

            let config = match config_path(handle) {
                Ok(path) => {
                    let config = read_env_file(&path);
                    let missing: Vec<&str> = REQUIRED_KEYS
                        .iter()
                        .copied()
                        .filter(|key| config.get(*key).is_none_or(|v| v.is_empty()))
                        .collect();

                    if !missing.is_empty() {
                        // Démarrer quand même : le serveur répondra des erreurs
                        // explicites que l'UI affiche, ce qui vaut mieux qu'une
                        // fenêtre qui ne s'ouvre pas.
                        eprintln!(
                            "[tauri] configuration incomplète ({}) — à renseigner dans {}",
                            missing.join(", "),
                            path.display()
                        );
                    }
                    config
                }
                Err(error) => {
                    eprintln!("[tauri] configuration illisible : {error}");
                    HashMap::new()
                }
            };

            if let Err(error) = spawn_console_server(handle, &config) {
                // Sans serveur, l'UI n'a aucune donnée : mieux vaut le dire
                // clairement dans les logs que d'afficher une coquille vide.
                eprintln!("[tauri] démarrage du serveur Console impossible : {error}");
            }

            // La fenêtre s'ouvre tout de suite, sans attendre le sidecar.
            //
            // Elle attendait auparavant que 127.0.0.1:3170 accepte une connexion,
            // parce que les `loader` du SPA partaient trop tôt et affichaient
            // « /api/agents a répondu HTTP 500 ». Mesuré : ce sont ~1,1 s d'écran
            // entièrement vide, avant même qu'une fenêtre n'existe — l'inverse de
            // ce qu'on attend d'une application native. C'est désormais le SPA qui
            // absorbe le démarrage, dans `awaitServerReady` (`src/lib/api.ts`) :
            // la coque s'affiche immédiatement, le contenu se remplit ensuite.
            if let Err(error) = open_main_window(handle) {
                eprintln!("[tauri] impossible d'ouvrir la fenêtre : {error}");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Hermes Console");
}
