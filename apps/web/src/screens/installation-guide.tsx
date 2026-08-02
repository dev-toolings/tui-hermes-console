import {
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUpRight, BookOpen, CheckCircle2, ChevronRight, Download, House } from "lucide-react";
import { Link } from "@/lib/router";

const GUIDE_URL = "/docs/installation-utilisation.md";

const sections = [
  ["Architecture et ports", "architecture-et-ports"],
  ["Prérequis communs", "prerequis-communs"],
  ["Installer la Console", "installer-la-console"],
  ["Local + Hermes système", "1-local-hermes-installe-systeme"],
  ["Local + Hermes Docker", "2-local-hermes-docker"],
  ["Local + VPS natif", "3-local-hermes-natif-sur-un-vps"],
  ["Local + VPS Docker", "4-local-hermes-docker-sur-un-vps"],
  ["Dépannage", "depannage-rapide"],
] as const;

export function InstallationGuideScreen() {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(GUIDE_URL, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Impossible de charger le guide (${response.status}).`);
        return response.text();
      })
      .then((content) => {
        if (active) setMarkdown(content);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Impossible de charger le guide.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const body = useMemo(
    () => markdown?.replace(/^# Installation et utilisation — Hermes Console\s*/u, "") ?? "",
    [markdown],
  );

  return (
    <main className="installation-guide">
      <div className="installation-guide__frame">
        <header className="installation-guide__topbar">
          <Link href="/" className="installation-guide__brand">
            <img src="/brand/hermes-console-logo.png" alt="" width="36" height="36" />
            <span>Hermes Console</span>
          </Link>
          <div className="installation-guide__topbar-actions">
            <a href={GUIDE_URL} download className="installation-guide__text-link">
              <Download aria-hidden="true" />
              Télécharger le Markdown
            </a>
            <Link href="/" className="installation-guide__back-link">
              <House aria-hidden="true" />
              Retour à la Console
            </Link>
          </div>
        </header>

        <section className="installation-guide__hero" aria-labelledby="guide-title">
          <div className="installation-guide__eyebrow">
            <span className="installation-guide__status-dot" aria-hidden="true" />
            Guide opérationnel · quatre topologies
          </div>
          <h1 id="guide-title">Installer et connecter Hermes Console</h1>
          <p>
            Le chemin le plus court pour lancer la Console en local, puis la relier à Hermes sur
            cette machine ou sur un VPS.
          </p>
          <div className="installation-guide__hero-meta">
            <span>
              <CheckCircle2 aria-hidden="true" />
              OAuth avant runtime
            </span>
            <span>
              <BookOpen aria-hidden="true" />
              Source Markdown conservée
            </span>
          </div>
        </section>

        <div className="installation-guide__layout">
          <aside className="installation-guide__toc" aria-label="Sommaire du guide">
            <p className="installation-guide__toc-label">Dans ce guide</p>
            <nav>
              {sections.map(([label, id], index) => (
                <a href={`#${id}`} key={id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {label}
                </a>
              ))}
            </nav>
          </aside>

          <article className="installation-guide__article">
            {error ? (
              <div className="installation-guide__error" role="alert">
                <strong>Le guide n’est pas disponible.</strong>
                <span>{error}</span>
                <a href={GUIDE_URL}>Ouvrir la source Markdown</a>
              </div>
            ) : markdown === null ? (
              <InstallationGuideArticleSkeleton />
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {body}
              </ReactMarkdown>
            )}
          </article>
        </div>

        <footer className="installation-guide__footer">
          <span>Hermes Console · documentation locale</span>
          <a href="#guide-title">
            Revenir en haut <ChevronRight aria-hidden="true" />
          </a>
        </footer>
      </div>
    </main>
  );
}

function InstallationGuideArticleSkeleton() {
  return (
    <div
      className="installation-guide__loading-skeleton"
      role="status"
      aria-live="polite"
      aria-label="Chargement du guide"
    >
      <span className="installation-guide__skeleton-line installation-guide__skeleton-line--eyebrow" />
      <span className="installation-guide__skeleton-line installation-guide__skeleton-line--title" />
      <span className="installation-guide__skeleton-line installation-guide__skeleton-line--wide" />
      <span className="installation-guide__skeleton-line installation-guide__skeleton-line--medium" />
      <div className="installation-guide__skeleton-block" aria-hidden="true">
        <span className="installation-guide__skeleton-line installation-guide__skeleton-line--wide" />
        <span className="installation-guide__skeleton-line installation-guide__skeleton-line--wide" />
        <span className="installation-guide__skeleton-line installation-guide__skeleton-line--short" />
      </div>
    </div>
  );
}

const markdownComponents = {
  h2: ({ children, ...props }: ComponentProps<"h2">) => (
    <h2 id={slugify(children)} {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: ComponentProps<"h3">) => (
    <h3 id={slugify(children)} {...props}>
      {children}
    </h3>
  ),
  a: ({ href, children, ...props }: ComponentProps<"a">) => {
    const external = Boolean(href?.startsWith("http"));
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        {...props}
      >
        {children}
        {external ? <ArrowUpRight aria-hidden="true" className="installation-guide__external-icon" /> : null}
      </a>
    );
  },
  blockquote: ({ children, ...props }: ComponentProps<"blockquote">) => (
    <blockquote {...props}>
      <span className="installation-guide__quote-mark" aria-hidden="true">
        “
      </span>
      {children}
    </blockquote>
  ),
  pre: ({ children, ...props }: ComponentProps<"pre">) => {
    if (isValidElement(children) && children.type === "code") {
      const code = children as ReactElement<ComponentProps<"code">>;
      const language = /language-([\w-]+)/u.exec(code.props.className ?? "")?.[1];
      if (language === "mermaid") {
        return <MermaidDiagram chart={String(code.props.children).replace(/\n$/u, "")} />;
      }
    }

    return (
      <div className="installation-guide__code-wrap">
        <pre {...props}>{children}</pre>
      </div>
    );
  },
};

function MermaidDiagram({ chart }: { chart: string }) {
  const rawId = useId();
  const diagramId = `hermes-mermaid-${rawId.replace(/:/gu, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const dark = document.documentElement.classList.contains("dark");

    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: dark
            ? {
                background: "#171717",
                primaryColor: "#262626",
                primaryTextColor: "#fafafa",
                primaryBorderColor: "#3080ff",
                lineColor: "#8ec5ff",
                secondaryColor: "#1d3155",
                tertiaryColor: "#121212",
                fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              }
            : {
                background: "#f7f7f7",
                primaryColor: "#ffffff",
                primaryTextColor: "#0a0a0a",
                primaryBorderColor: "#155dfc",
                lineColor: "#1447e6",
                secondaryColor: "#eaf1ff",
                tertiaryColor: "#f7f7f7",
                fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              },
        });
        const result = await mermaid.render(diagramId, chart);
        if (active) setSvg(result.svg);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Diagramme indisponible.");
        }
      });

    return () => {
      active = false;
    };
  }, [chart, diagramId]);

  if (error) {
    return (
      <div className="installation-guide__diagram-fallback" role="img" aria-label="Diagramme non rendu">
        <pre>
          <code>{chart}</code>
        </pre>
        <small>{error}</small>
      </div>
    );
  }

  return (
    <figure className="installation-guide__diagram" aria-label="Architecture et ports">
      {svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <p className="installation-guide__diagram-loading">Rendu du diagramme…</p>
      )}
      <figcaption>Architecture locale, proxy web et connexion au runtime Hermes.</figcaption>
    </figure>
  );
}

function slugify(value: ReactNode): string {
  const text = flattenText(value);
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function flattenText(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(flattenText).join("");
  return "";
}
