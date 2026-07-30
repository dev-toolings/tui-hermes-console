import { apiErrorResponse } from "@/modules/api/errors";
import { readSshConfigHosts } from "@/modules/runtime/ssh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hôtes déclarés dans ~/.ssh/config, pour suggestion dans le formulaire.
 *  Lecture seule et sans secret : ni clé, ni passphrase, ni mot de passe. */
export async function GET() {
  try {
    return Response.json({ hosts: await readSshConfigHosts() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
