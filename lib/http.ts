import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { requireBearerUser } from "./auth";
import { HttpError } from "./errors";

export type AuthedUser = {
  id: string;
  username: string;
};

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function badRequest(error: unknown) {
  if (error instanceof ZodError) {
    return json(
      {
        error: "bad_request",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  return json({ error: "bad_request" }, { status: 400 });
}

export function serverError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown server error.";
  return json({ error: "server_error", message }, { status: 500 });
}

export async function requireUser(request: NextRequest): Promise<AuthedUser> {
  const authHeader = request.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    throw new HttpError(401, "unauthorized", "Missing bearer token.");
  }

  return requireBearerUser(match[1]);
}

export function handleHttpError(error: unknown) {
  if (error instanceof HttpError) {
    return json(
      { error: error.code, message: error.message },
      { status: error.status },
    );
  }

  return serverError(error);
}

export { HttpError };
