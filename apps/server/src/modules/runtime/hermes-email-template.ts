type HermesEmailCode = {
  label: string;
  value: string;
};

export type HermesEmailTemplateInput = {
  preheader: string;
  eyebrow: string;
  title: string;
  paragraphs: readonly string[];
  code?: HermesEmailCode;
  note?: string;
};

export type HermesEmailTemplateOutput = {
  html: string;
  text: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function htmlParagraph(value: string) {
  return `<p style="margin:0 0 16px;color:#3c4043;font-size:16px;line-height:1.55;">${escapeHtml(value)}</p>`;
}

export function renderHermesEmail(input: HermesEmailTemplateInput): HermesEmailTemplateOutput {
  const paragraphs = input.paragraphs.map(htmlParagraph).join("");
  const code = input.code
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 24px;border-collapse:separate;border-spacing:0;background:#f5f5f7;border-radius:14px;"><tr><td align="center" style="padding:22px 20px 24px;"><p style="margin:0 0 9px;color:#6e6e73;font-size:12px;font-weight:700;letter-spacing:.08em;line-height:1.3;text-transform:uppercase;">${escapeHtml(input.code.label)}</p><p style="margin:0;color:#1d1d1f;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:.22em;line-height:1.2;">${escapeHtml(input.code.value)}</p></td></tr></table>`
    : "";
  const note = input.note
    ? `<p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #e5e5e7;color:#6e6e73;font-size:13px;line-height:1.55;">${escapeHtml(input.note)}</p>`
    : "";
  const textCode = input.code ? `\n${input.code.label}: ${input.code.value}\n` : "";
  const textNote = input.note ? `\n${input.note}\n` : "";

  return {
    html: `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f7;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f5f5f7;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e5e5e7;border-radius:18px;box-shadow:0 8px 30px rgba(0,0,0,.06);">
            <tr>
              <td style="padding:28px 32px 0;">
                <p style="margin:0;color:#1d1d1f;font-size:15px;font-weight:700;letter-spacing:-.01em;">Hermes Console</p>
              </td>
            </tr>
            <tr>
              <td style="padding:40px 32px 34px;">
                <p style="margin:0 0 12px;color:#6e6e73;font-size:12px;font-weight:700;letter-spacing:.1em;line-height:1.3;text-transform:uppercase;">${escapeHtml(input.eyebrow)}</p>
                <h1 style="margin:0 0 22px;color:#1d1d1f;font-size:30px;font-weight:700;letter-spacing:-.035em;line-height:1.12;">${escapeHtml(input.title)}</h1>
                ${paragraphs}
                ${code}
                ${note}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 26px;border-top:1px solid #f0f0f2;">
                <p style="margin:0;color:#86868b;font-size:12px;line-height:1.5;">Message automatique de Hermes Console.<br>Vous pouvez ignorer cet e-mail si vous n’êtes pas à l’origine de cette demande.</p>
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0;color:#86868b;font-size:11px;line-height:1.5;">Hermes Console · Sécurité runtime</p>
        </td>
      </tr>
    </table>
  </body>
</html>`,
    text: [input.title, "", ...input.paragraphs, textCode, textNote, "Hermes Console", "Message automatique de Hermes Console."].join("\n"),
  };
}
