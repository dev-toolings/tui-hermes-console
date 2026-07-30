import { HermesRuntimeError } from "@/modules/runtime/hermes-adapter";

export function assertSameOriginMutation(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new HermesRuntimeError(
      "Cette action doit être déclenchée depuis la Console.",
      403,
      "CROSS_SITE_MUTATION_REJECTED",
    );
  }

  const origin = request.headers.get("origin");
  if (!origin) return;

  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const allowedOrigins = new Set([
    requestUrl.origin,
    forwardedHost
      ? `${forwardedProtocol || requestUrl.protocol.replace(":", "")}://${forwardedHost}`
      : null,
  ]);
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw rejectedOrigin();
  }
  if (!allowedOrigins.has(parsedOrigin.origin)) {
    throw rejectedOrigin();
  }
}

function rejectedOrigin() {
  return new HermesRuntimeError(
    "Origine de requête refusée.",
    403,
    "ORIGIN_REJECTED",
  );
}
