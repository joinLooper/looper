import { createHash } from "node:crypto";
import { staffError } from "./merchant-staff-schema.js";
export type VerifiedStaffLineIdentity = {
  subject: string;
  nonceHash: string;
  channelId: string;
};
export interface StaffLineVerifier {
  exchange(
    code: string,
    verifier: string,
    nonceHash: string,
  ): Promise<VerifiedStaffLineIdentity>;
}
export class LineStaffVerifier implements StaffLineVerifier {
  constructor(
    readonly channelId: string,
    private readonly secret: string,
    readonly redirectUri: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!channelId || !secret)
      throw Error("LINE channel configuration required");
  }
  private async post(url: string, body: URLSearchParams) {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
    } catch {
      throw staffError("LINE_PROVIDER_UNAVAILABLE", 503);
    }
    let data: Record<string, unknown>;
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      throw staffError("LINE_PROVIDER_UNAVAILABLE", 503);
    }
    if (!response.ok)
      throw staffError(
        response.status >= 500
          ? "LINE_PROVIDER_UNAVAILABLE"
          : "LINE_INVALID_CREDENTIAL",
        response.status >= 500 ? 503 : 401,
      );
    return data;
  }
  async exchange(
    code: string,
    verifier: string,
    nonceHash: string,
  ): Promise<VerifiedStaffLineIdentity> {
    const tokens = await this.post(
      "https://api.line.me/oauth2/v2.1/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.redirectUri,
        client_id: this.channelId,
        client_secret: this.secret,
        code_verifier: verifier,
      }),
    );
    if (typeof tokens.id_token !== "string" || !tokens.id_token)
      throw staffError("LINE_INVALID_CREDENTIAL", 401);
    // Official provider validation, not unverified JWT decoding.
    const claims = await this.post(
      "https://api.line.me/oauth2/v2.1/verify",
      new URLSearchParams({
        id_token: tokens.id_token,
        client_id: this.channelId,
      }),
    );
    if (
      claims.iss !== "https://access.line.me" ||
      claims.aud !== this.channelId ||
      typeof claims.exp !== "number" ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= Date.now() / 1000 ||
      typeof claims.iat !== "number" ||
      claims.iat > Date.now() / 1000 + 30 ||
      typeof claims.sub !== "string" ||
      !claims.sub.trim() ||
      claims.sub.length > 255 ||
      typeof claims.nonce !== "string" ||
      createHash("sha256").update(claims.nonce).digest("hex") !== nonceHash
    )
      throw staffError("LINE_INVALID_CREDENTIAL", 401);
    return { subject: claims.sub, nonceHash, channelId: this.channelId };
  }
}
