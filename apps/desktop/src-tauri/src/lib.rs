use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// Démarre le serveur Console en sidecar et attend qu'il soit joignable.
///
/// C'est le cœur du choix d'architecture : plutôt que réécrire en Rust le
/// runner SSE, le tunnel SSH (`ssh2`), le chiffrement AES-256-GCM et la
/// réconciliation — trois phases déjà validées et testées — on embarque le
/// serveur Node tel quel. La migration vers Rust reste possible morceau par
/// morceau, sans big-bang.
fn spawn_console_server(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let (mut rx, _child) = app
        .shell()
        .sidecar("hermes-server")?
        // Boucle locale uniquement : le serveur ne doit jamais être joignable
        // depuis le réseau, il détient les secrets runtime déchiffrés.
        .env("CONSOLE_SERVER_HOST", "127.0.0.1")
        .env("CONSOLE_SERVER_PORT", "3170")
        .spawn()?;

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                    eprintln!("[server] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[server] arrêt du sidecar : {:?}", payload.code);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if let Err(error) = spawn_console_server(app.handle()) {
                // Sans serveur, l'UI n'a aucune donnée : mieux vaut le dire
                // clairement dans les logs que d'afficher une coquille vide.
                eprintln!("[tauri] démarrage du serveur Console impossible : {error}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Hermes Console");
}
