import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-sunken p-6">
      <div className="w-full max-w-md rounded-3xl bg-panel p-8 text-center shadow-board-elevated">
        <span className="font-mono text-xs font-semibold text-primary">404</span>
        <h1 className="mt-3 text-xl font-semibold">Page introuvable</h1>
        <p className="mt-2 text-[0.8125rem] text-muted-foreground">
          Cette surface n’existe pas dans Hermes Console.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-9 items-center rounded-[10px] bg-[image:var(--gradient-primary)] px-4 text-[0.8125rem] font-medium text-primary-foreground shadow-[var(--shadow-xs)]"
        >
          Revenir à l’aperçu
        </Link>
      </div>
    </main>
  );
}
