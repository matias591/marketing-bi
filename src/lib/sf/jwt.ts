/**
 * Salesforce OAuth 2.0 JWT Bearer Flow.
 *
 * Server-to-server auth — no human, no refresh tokens. Each cron run signs a
 * fresh 3-minute JWT with the private key (from env) and exchanges it for an
 * access token at the SF token endpoint.
 *
 * Setup steps live in README §"Salesforce Connected App".
 */
import jwt from "jsonwebtoken";
import { readFile } from "node:fs/promises";

interface AuthorizedConnection {
  accessToken: string;
  instanceUrl: string;
}

let _cached: { token: AuthorizedConnection; expiresAt: number } | null = null;

async function loadPrivateKey(): Promise<string> {
  if (process.env.SF_PRIVATE_KEY) {
    // Vercel: paste the PEM into the env var. Allow either real newlines or
    // literal `\n` escapes (Vercel UI strips real newlines from some inputs).
    return process.env.SF_PRIVATE_KEY.replace(/\\n/g, "\n");
  }
  const path = process.env.SF_PRIVATE_KEY_PATH;
  if (!path) {
    throw new Error(
      "SF_PRIVATE_KEY (preferred) or SF_PRIVATE_KEY_PATH must be set for JWT signing.",
    );
  }
  return await readFile(path, "utf8");
}

export async function getSalesforceConnection(): Promise<AuthorizedConnection> {
  const now = Date.now();
  if (_cached && _cached.expiresAt > now + 60_000) {
    return _cached.token;
  }

  const clientId = process.env.SF_CLIENT_ID;
  const username = process.env.SF_USERNAME;
  const loginUrl = process.env.SF_LOGIN_URL ?? "https://login.salesforce.com";
  if (!clientId || !username) {
    throw new Error("SF_CLIENT_ID and SF_USERNAME must be set.");
  }

  const privateKey = await loadPrivateKey();

  const assertion = jwt.sign(
    {
      iss: clientId,
      sub: username,
      aud: loginUrl, // login.salesforce.com or test.salesforce.com — never the My Domain URL
      exp: Math.floor(Date.now() / 1000) + 180, // 3 min
    },
    privateKey,
    { algorithm: "RS256" },
  );

  const params = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const res = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Salesforce JWT exchange failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { access_token: string; instance_url: string };
  _cached = {
    token: { accessToken: data.access_token, instanceUrl: data.instance_url },
    expiresAt: now + 25 * 60 * 1000, // SF tokens are usually 30min for JWT; refresh slightly early
  };
  return _cached.token;
}

/**
 * jsforce-compatible Connection. The cron handler creates one of these per
 * run and passes it to per-object sync functions.
 */
export async function getJsforceConnection() {
  const { accessToken, instanceUrl } = await getSalesforceConnection();
  // Lazy import — keeps `@jsforce/jsforce-node` out of the auth-only path.
  const { Connection } = await import("@jsforce/jsforce-node");
  return new Connection({ accessToken, instanceUrl });
}
