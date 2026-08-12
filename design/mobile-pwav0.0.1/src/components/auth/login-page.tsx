import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { ArrowRightIcon, ArrowUpRightIcon, MailIcon, MoonIcon, SunIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { orgPath } from "../mobile/mobile-nav";
import {
  CODE_COOLDOWN_SECONDS,
  hasOnboarded,
  isValidEmail,
  safeRedirect,
  useAuthStore,
} from "../../state/auth-store";
import { loadConsoleState } from "../../state/console-store";

/**
 * Sign-in and sign-up are the same passwordless screen, mirrored from multica's
 * LoginPage (packages/views/auth/login-page.tsx): an email step, then a 6-digit
 * code that auto-submits once complete, with a resend cooldown. The code is
 * fake — any 6 digits pass — and the screen says so.
 */
export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("demo@hermes.local");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  // An authenticated visit to /login goes straight back into the app.
  if (user) return <Navigate to="/" replace />;

  const handleSendCode = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!isValidEmail(email)) {
      setError("Entrez une adresse email valide.");
      return;
    }
    useAuthStore.getState().sendCode(email);
    setError("");
    setCode("");
    setCooldown(CODE_COOLDOWN_SECONDS);
    setStep("code");
  };

  const handleVerify = (value: string) => {
    if (value.length !== 6) return;
    const signedIn = useAuthStore.getState().verifyCode(email, value);
    if (!signedIn) {
      setError("Code invalide ou expiré");
      setCode("");
      return;
    }
    const state = useAuthStore.getState();
    if (!hasOnboarded(state)) {
      navigate("/onboarding", { replace: true });
      return;
    }
    const redirect = safeRedirect(
      new URLSearchParams(location.search).get("redirect") ?? undefined,
    );
    navigate(
      redirect ?? orgPath(loadConsoleState().activeWorkspaceId, "/inbox"),
      { replace: true },
    );
  };

  const handleResend = () => {
    if (cooldown > 0) return;
    useAuthStore.getState().sendCode(email);
    setError("");
    setCooldown(CODE_COOLDOWN_SECONDS);
  };

  return (
    <main className="grid min-h-dvh grid-cols-1 bg-[var(--background)] lg:grid-cols-[minmax(26rem,42%)_1fr]">
      <div className="flex flex-col justify-between gap-12 p-6 sm:p-10 lg:p-12 xl:p-16">
        <div className="flex items-center justify-between gap-4">
          <a href="/" aria-label="Hermes Console" className="w-fit rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
            <img src="/hermesbot-favicon.png" alt="" aria-hidden className="size-9 rounded-lg object-cover" />
          </a>
          <LoginThemeToggle />
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-col motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
          <p className="font-mono text-caption-1-medium tracking-[0.14em] text-[var(--primary)] uppercase">Connexion</p>
          {step === "email" ? (
            <>
              <h1 className="mt-3 text-display-4-semibold tracking-[-0.02em] text-balance text-[var(--foreground)]">De retour au travail.</h1>
              <p className="mt-3 text-body-regular text-pretty text-[var(--muted-foreground)]">Vos espaces, missions et décisions vous attendent là où vous les avez laissés.</p>
            </>
          ) : (
            <>
              <h1 className="mt-3 text-display-4-semibold tracking-[-0.02em] text-balance text-[var(--foreground)]">Vérifiez votre email.</h1>
              <p className="mt-3 text-body-regular text-pretty text-[var(--muted-foreground)]">Saisissez le code envoyé à <span className="text-[var(--foreground)]">{email}</span>.</p>
            </>
          )}

          {step === "email" ? (
            <form onSubmit={handleSendCode} className="mt-8 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="login-email" className="text-sm font-medium text-[var(--foreground)]">Email</label>
                <div className="relative">
                  <MailIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="vous@entreprise.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-11 pl-9"
                    autoFocus
                    required
                  />
                </div>
              </div>
              {error && <p className="text-sm text-[var(--state-neg-fg)]">{error}</p>}
              <Button type="submit" size="lg" className="mt-1 h-11 w-full" disabled={!email}>
                Continuer
                <ArrowRightIcon aria-hidden className="size-4" />
              </Button>
            </form>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleVerify(code);
              }}
              className="mt-8 flex flex-col gap-4"
            >
              <CodeInput
                value={code}
                onChange={(value) => {
                  setCode(value);
                  setError("");
                }}
              />
              {error && <p className="text-sm text-[var(--state-neg-fg)]">{error}</p>}
              <p className="text-body-regular text-[var(--muted-foreground)]">Démo locale : n'importe quel code à 6 chiffres est accepté.</p>
              <Button type="submit" size="lg" className="mt-1 h-11 w-full" disabled={code.length !== 6}>
                Vérifier et se connecter
                <ArrowRightIcon aria-hidden className="size-4" />
              </Button>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setCode("");
                    setError("");
                  }}
                  className="rounded-md text-caption-1-medium text-[var(--muted-foreground)] underline-offset-4 outline-none hover:text-[var(--foreground)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  Retour
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={cooldown > 0}
                  className="rounded-md border border-[var(--border-control)] bg-[var(--card)] px-3 py-2 text-caption-1-medium text-[var(--foreground)] shadow-[var(--shadow-xs)] transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cooldown > 0 ? `Renvoyer dans ${cooldown}s` : "Renvoyer le code"}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="font-mono text-caption-1-medium uppercase text-[var(--muted-foreground)]">FR · Démo locale</p>
      </div>

      <LoginShowcase />
    </main>
  );
}

function LoginThemeToggle() {
  const [dark, setDark] = useState(() => localStorage.getItem("boardui:theme") === "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("boardui:theme", dark ? "dark" : "light");
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", dark ? "#121212" : "#f3f3f4");
  }, [dark]);

  return (
    <button
      type="button"
      aria-label={`Activer le thème ${dark ? "clair" : "sombre"}`}
      aria-pressed={dark}
      onClick={() => setDark((value) => !value)}
      className="inline-flex min-h-11 items-center gap-1 rounded-full border border-[var(--border-control)] bg-[var(--theme-toggle-background)] p-1 text-[var(--muted-foreground)] shadow-[var(--shadow-xs)]"
    >
      <span className={`grid size-8 place-items-center rounded-full transition-colors ${!dark ? "bg-[var(--theme-toggle-selected)] text-[var(--foreground)] shadow-[var(--shadow-xs)]" : ""}`}>
        <SunIcon aria-hidden className="size-4" />
      </span>
      <span className={`grid size-8 place-items-center rounded-full transition-colors ${dark ? "bg-[var(--theme-toggle-selected)] text-[var(--foreground)] shadow-[var(--shadow-xs)]" : ""}`}>
        <MoonIcon aria-hidden className="size-4" />
      </span>
    </button>
  );
}

function LoginShowcase() {
  const stats = [
    ["Missions restantes", "12", "+3"],
    ["Membres actifs", "3", "—"],
    ["Activité mensuelle", "72%", "+4%"],
  ];
  const activity = [
    ["Noah a rejoint l’espace produit", "2 min"],
    ["La mission onboarding est terminée", "1 h"],
    ["3 décisions ont été enregistrées", "3 h"],
  ];

  return (
    <aside className="relative isolate m-4 hidden overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-12 shadow-[var(--shadow-xs)] lg:flex lg:flex-col lg:justify-between xl:p-16">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-20" style={{ background: "radial-gradient(circle at 86% 6%, color-mix(in srgb, var(--primary) 70%, transparent), transparent 32%), radial-gradient(circle at 20% 88%, color-mix(in srgb, var(--primary) 20%, transparent), transparent 34%)" }} />
      <div aria-hidden className="pointer-events-none absolute -top-40 -right-32 -z-10 size-[36rem] rounded-full opacity-25 blur-3xl" style={{ background: "radial-gradient(circle, var(--primary), transparent 70%)" }} />

      <p className="font-mono text-caption-1-medium tracking-[0.14em] text-[var(--muted-foreground)] uppercase">Ce qui vous attend</p>

      <div className="flex w-full max-w-xl flex-col gap-4">
        <article className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-xs)]">
          <dl className="divide-y divide-[var(--border)]">
            {stats.map(([label, value, delta]) => (
              <div key={label} className="flex items-baseline justify-between gap-6 py-3 first:pt-0 last:pb-0">
                <dt className="text-sm text-[var(--muted-foreground)]">{label}</dt>
                <dd className="flex items-baseline gap-3">
                  <span className="text-2xl font-semibold tracking-tight tabular-nums text-[var(--foreground)]">{value}</span>
                  <span className={`font-mono text-caption-1-medium tabular-nums ${delta === "—" ? "text-[var(--muted-foreground)]" : "text-[var(--state-pos-fg)]"}`}>{delta}</span>
                </dd>
              </div>
            ))}
          </dl>
        </article>

        <article className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--shadow-xs)]">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Activité récente</h2>
          <ul className="mt-4 space-y-3">
            {activity.map(([message, at]) => (
              <li key={message} className="flex items-center justify-between gap-4">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
                  <span className="truncate text-sm text-[var(--foreground)]">{message}</span>
                </span>
                <span className="shrink-0 font-mono text-caption-1-regular text-[var(--muted-foreground)]">{at}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <div className="flex flex-col gap-3">
        <p className="max-w-md text-title-3-medium tracking-[-0.01em] text-balance text-[var(--foreground)]"><ArrowUpRightIcon aria-hidden className="mr-1 mb-1 inline size-5 text-[var(--primary)]" />Une console opérationnelle, lisible et prête à décider.</p>
        <p className="text-caption-1-regular text-[var(--muted-foreground)]">Données illustratives — votre espace se charge après connexion.</p>
      </div>
    </aside>
  );
}

/**
 * Six visual slots over one invisible input, the same interaction as multica's
 * InputOTP: one focus target, paste works, auto-advance is free.
 */
function CodeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.split("");
  return (
    <div className="relative" onClick={() => inputRef.current?.focus()}>
      <input
        ref={inputRef}
        autoFocus
        value={value}
        onChange={(event) =>
          onChange(event.target.value.replace(/\D/g, "").slice(0, 6))
        }
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="Code de vérification à 6 chiffres"
        className="absolute inset-0 cursor-default opacity-0"
      />
      <div aria-hidden className="pointer-events-none flex gap-2">
        {Array.from({ length: 6 }, (_, index) => {
          const active = focused && index === Math.min(digits.length, 5);
          return (
            <span
              key={index}
              className={`flex h-11 w-9 items-center justify-center rounded-md border text-base font-semibold text-foreground ${
                active
                  ? "border-ring ring-[3px] ring-ring/50"
                  : "border-[var(--border-control)]"
              } bg-[var(--card)]`}
            >
              {digits[index] ?? ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
