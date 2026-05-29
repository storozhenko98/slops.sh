export type Session = {
  apiUrl: string;
  token?: string;
  expiresAt?: string;
  recoveryKey?: string;
  user?: {
    id: string;
    username: string;
  };
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; message?: string };

export async function apiRequest<T>(
  apiUrl: string,
  path: string,
  options: {
    method?: "GET" | "POST" | "DELETE";
    token?: string;
    body?: unknown;
  } = {},
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...(options.token
          ? {
              authorization: `Bearer ${options.token}`,
            }
          : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };

    if (!response.ok) {
      return {
        ok: false,
        error: data.error ?? "request_failed",
        message: data.message,
      };
    }

    return { ok: true, data: data as T };
  } catch (error) {
    return {
      ok: false,
      error: "network_error",
      message: error instanceof Error ? error.message : "Request failed.",
    };
  }
}
