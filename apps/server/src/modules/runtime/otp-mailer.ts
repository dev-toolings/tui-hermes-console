import { HermesRuntimeError } from "./hermes-adapter";
import { renderHermesEmail } from "./hermes-email-template";

type MailerEnvironment = Record<string, string | undefined>;

function configuredProvider(env: MailerEnvironment = process.env) {
  return (env.CONSOLE_EMAIL_PROVIDER?.trim().toLowerCase() ||
    (env.NODE_ENV === "development" ? "mailpit" : "resend"));
}

function sender(env: MailerEnvironment) {
  const value = env.CONSOLE_EMAIL_FROM?.trim();
  if (!value) {
    throw new HermesRuntimeError(
      "Configurez CONSOLE_EMAIL_FROM pour envoyer les codes OTP.",
      503,
      "OTP_EMAIL_NOT_CONFIGURED",
    );
  }
  return value;
}

function mailpitSender(value: string) {
  const match = value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  return match ? { Email: match[2], Name: match[1] || undefined } : { Email: value };
}

export async function sendRuntimeOtpEmail(
  to: string,
  code: string,
  env: MailerEnvironment = process.env,
) {
  const provider = configuredProvider(env);
  const from = sender(env);
  const subject = "Votre code de vérification Hermes Console";
  const message = renderHermesEmail({
    preheader: "Votre code de vérification Hermes Console est prêt.",
    eyebrow: "Sécurité du compte",
    title: "Confirmez votre demande",
    paragraphs: ["Une demande de révélation du token Hermes a été effectuée dans Hermes Console."],
    code: { label: "Code de vérification", value: code },
    note: "Ce code expire dans 5 minutes et ne peut être utilisé qu’une seule fois. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail et vérifiez votre session.",
  });

  if (provider === "mailpit") {
    await sendJson(
      env.CONSOLE_MAILPIT_URL?.trim() || "http://127.0.0.1:8025/api/v1/send",
      {
        From: mailpitSender(from),
        To: [{ Email: to }],
        Subject: subject,
        Text: message.text,
        HTML: message.html,
      },
      "Mailpit",
    );
    return;
  }

  if (provider === "resend") {
    const apiKey = env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      throw new HermesRuntimeError(
        "Configurez RESEND_API_KEY pour envoyer les codes OTP.",
        503,
        "OTP_EMAIL_NOT_CONFIGURED",
      );
    }
    await sendJson(
      "https://api.resend.com/emails",
      { from, to: [to], subject, text: message.text, html: message.html },
      "Resend",
      { Authorization: `Bearer ${apiKey}` },
    );
    return;
  }

  throw new HermesRuntimeError(
    "CONSOLE_EMAIL_PROVIDER doit être mailpit ou resend.",
    503,
    "OTP_EMAIL_PROVIDER_UNSUPPORTED",
  );
}

async function sendJson(
  url: string,
  body: Record<string, unknown>,
  provider: string,
  extraHeaders: Record<string, string> = {},
) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    });
  } catch {
    throw new HermesRuntimeError(
      `Le fournisseur e-mail ${provider} est injoignable.`,
      503,
      "OTP_EMAIL_SEND_FAILED",
    );
  }
  if (response.ok) return;
  // Ne jamais recopier le corps du fournisseur dans les logs ou la réponse API.
  throw new HermesRuntimeError(
    `Le fournisseur e-mail ${provider} a refusé l’envoi du code OTP.`,
    503,
    "OTP_EMAIL_SEND_FAILED",
  );
}

export function maskEmail(value: string) {
  const [local = "", domain = ""] = value.trim().toLowerCase().split("@", 2);
  if (!local || !domain) return "votre adresse e-mail";
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(3, Math.min(6, local.length)))}@${domain}`;
}
