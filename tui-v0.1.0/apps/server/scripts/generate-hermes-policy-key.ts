import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const encode = (key: typeof privateKey, type: "pkcs8" | "spki") =>
  key.export({ format: "der", type }).toString("base64url");

process.stdout.write(
  [
    "# Store these values in the Console server environment only.",
    `HERMES_POLICY_PRIVATE_KEY_B64URL=${encode(privateKey, "pkcs8")}`,
    `HERMES_POLICY_PUBLIC_KEY_B64URL=${encode(publicKey, "spki")}`,
  ].join("\n") + "\n",
);
