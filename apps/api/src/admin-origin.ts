import type { FastifyRequest } from "fastify";

type OriginRequest = Pick<FastifyRequest, "headers">;

function forbiddenOrigin(): Error & { statusCode: number } {
  return Object.assign(new Error("不允許的 Origin"), { statusCode: 403 });
}

export function requireAdminOrigin(request: OriginRequest, adminAppUrl?: string): void {
  if (!adminAppUrl) {
    throw Object.assign(new Error("Admin Origin 尚未設定"), { statusCode: 500 });
  }

  let configuredOrigin: string;
  try {
    configuredOrigin = new URL(adminAppUrl).origin;
  } catch {
    throw Object.assign(new Error("Admin Origin 設定無效"), { statusCode: 500 });
  }

  const origin = request.headers.origin;
  if (typeof origin !== "string") throw forbiddenOrigin();

  try {
    const parsed = new URL(origin);
    if (origin !== parsed.origin || parsed.origin !== configuredOrigin) throw forbiddenOrigin();
  } catch (error) {
    if (typeof error === "object" && error !== null && "statusCode" in error) throw error;
    throw forbiddenOrigin();
  }
}
