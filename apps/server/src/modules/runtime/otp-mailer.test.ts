import { afterEach, describe, expect, test } from "bun:test";
import { maskEmail, sendRuntimeOtpEmail } from "./otp-mailer";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("runtime OTP mailer", () => {
  test("masks the recipient without exposing the full local part", () => {
    expect(maskEmail("operator@example.com")).toBe("op••••••@example.com");
    expect(maskEmail("a@example.com")).toBe("a•••@example.com");
  });

  test("sends a Mailpit message without returning the OTP", async () => {
    let request: Request | undefined;
    globalThis.fetch = Object.assign(async (input: URL | RequestInfo, init?: RequestInit) => {
      request = new Request(input, init);
      return new Response(null, { status: 202 });
    }, { preconnect: () => undefined }) as typeof fetch;

    await sendRuntimeOtpEmail("operator@example.com", "123456", {
      NODE_ENV: "development",
      CONSOLE_EMAIL_PROVIDER: "mailpit",
      CONSOLE_EMAIL_FROM: "Hermes Console <console@localhost>",
      CONSOLE_MAILPIT_URL: "http://127.0.0.1:8025/api/v1/send",
    });

    expect(request?.url).toBe("http://127.0.0.1:8025/api/v1/send");
    const body = JSON.parse(await request!.text()) as { To: Array<{ Email: string }>; Text: string };
    expect(body.To[0]?.Email).toBe("operator@example.com");
    expect(body.Text).toContain("123456");
  });

  test("fails closed when Resend is selected without its API key", async () => {
    await expect(
      sendRuntimeOtpEmail("operator@example.com", "123456", {
        NODE_ENV: "production",
        CONSOLE_EMAIL_PROVIDER: "resend",
        CONSOLE_EMAIL_FROM: "Hermes Console <console@example.com>",
      }),
    ).rejects.toMatchObject({ code: "OTP_EMAIL_NOT_CONFIGURED", status: 503 });
  });
});
