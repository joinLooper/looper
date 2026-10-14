import {
  createRemoteJWKSet,
  jwtVerify,
  errors,
  type JWTVerifyGetKey,
} from "jose";

export const googleAuthError = (code: string, statusCode = 401) =>
  Object.assign(new Error(code), { code, errorCode: code, statusCode });

export class GoogleMerchantVerifier {
  private readonly key: JWTVerifyGetKey;
  constructor(
    readonly clientId: string,
    testKey?: JWTVerifyGetKey,
  ) {
    if (!clientId.trim()) throw new Error("GOOGLE_MERCHANT_CLIENT_ID required");
    this.key =
      testKey ??
      createRemoteJWKSet(
        new URL("https://www.googleapis.com/oauth2/v3/certs"),
        {
          timeoutDuration: 5000,
          cooldownDuration: 30000,
          cacheMaxAge: 3600000,
        },
      );
  }

  async verify(
    credential: string,
  ): Promise<{ subject: string; nonce: string }> {
    try {
      const { payload } = await jwtVerify(credential, this.key, {
        algorithms: ["RS256"],
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: this.clientId,
        requiredClaims: ["sub", "exp", "iat", "nonce"],
        clockTolerance: 0,
      });
      if (
        typeof payload.sub !== "string" ||
        !payload.sub.trim() ||
        payload.sub.length > 255 ||
        typeof payload.nonce !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(payload.nonce) ||
        typeof payload.iat !== "number" ||
        payload.iat > Date.now() / 1000 + 30 ||
        (payload.azp !== undefined && payload.azp !== this.clientId)
      )
        throw googleAuthError("GOOGLE_INVALID_TOKEN");
      return { subject: payload.sub, nonce: payload.nonce };
    } catch (error) {
      if (
        error instanceof errors.JWKSTimeout ||
        error instanceof TypeError ||
        (error instanceof Error && error.message.includes("Expected 200 OK"))
      ) {
        throw googleAuthError("GOOGLE_PROVIDER_UNAVAILABLE", 503);
      }
      throw googleAuthError("GOOGLE_INVALID_TOKEN");
    }
  }
}
