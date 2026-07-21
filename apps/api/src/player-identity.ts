import type { ExternalIdentityProvider } from "@looper/types";

export interface VerifiedPlayerIdentity {
  provider: ExternalIdentityProvider;
  providerSubject: string;
  displayName: string;
}

export interface PlayerIdentityVerifier {
  verifyIdToken(idToken: string): Promise<VerifiedPlayerIdentity>;
}

export type LinePlayerIdentityVerifierOptions = {
  channelId: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
};

type LineVerifyResponse = {
  sub?: string;
  name?: string;
  aud?: string;
  iss?: string;
  exp?: number;
  error?: string;
  error_description?: string;
};

function identityError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode });
}

export class LinePlayerIdentityVerifier implements PlayerIdentityVerifier {
  readonly channelId: string;
  readonly timeoutMs: number;
  readonly fetcher: typeof fetch;

  constructor(options: LinePlayerIdentityVerifierOptions) {
    this.channelId = options.channelId.trim();
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.fetcher = options.fetcher ?? fetch;
    if (!this.channelId) throw new Error("LINE_LOGIN_CHANNEL_ID is required");
  }

  async verifyIdToken(idToken: string): Promise<VerifiedPlayerIdentity> {
    const credential = idToken.trim();
    if (!credential) throw identityError("LINE credential is required", 400);
    const body = new URLSearchParams({ id_token: credential, client_id: this.channelId });
    let response: Response;
    try {
      response = await this.fetcher("https://api.line.me/oauth2/v2.1/verify", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw identityError("LINE identity provider is temporarily unavailable", 503);
    }

    let payload: LineVerifyResponse;
    try {
      payload = await response.json() as LineVerifyResponse;
    } catch {
      throw identityError("LINE identity provider returned an invalid response", 503);
    }
    if (!response.ok) throw identityError("LINE credential is invalid or expired", 401);
    if (payload.aud !== this.channelId || payload.iss !== "https://access.line.me") {
      throw identityError("LINE credential audience or issuer is invalid", 401);
    }
    if (!payload.exp || payload.exp * 1000 <= Date.now()) {
      throw identityError("LINE credential is invalid or expired", 401);
    }
    const providerSubject = payload.sub?.trim();
    if (!providerSubject) throw identityError("LINE credential has no verified subject", 401);
    return {
      provider: "line",
      providerSubject,
      displayName: payload.name?.trim() || "Looper 玩家",
    };
  }
}

export function configuredLinePlayerIdentityVerifier(
  environment: NodeJS.ProcessEnv = process.env,
): PlayerIdentityVerifier | null {
  const channelId = environment.LINE_LOGIN_CHANNEL_ID?.trim();
  return channelId ? new LinePlayerIdentityVerifier({ channelId }) : null;
}
