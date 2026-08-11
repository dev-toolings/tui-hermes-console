export const DEVELOPMENT_LOGIN_PATH = "/api/auth?action=dev-login";

type DevelopmentLoginFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export async function requestDevelopmentLogin(
  fetcher: DevelopmentLoginFetch = fetch,
) {
  const response = await fetcher(DEVELOPMENT_LOGIN_PATH, {
    method: "POST",
    credentials: "same-origin",
    headers: { "X-Hermes-Toast": "0" },
  });
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  if (!response.ok) {
    throw new Error(body?.error?.message ?? "La connexion locale de développement a échoué.");
  }
}
