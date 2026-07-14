/**
 * Strip anything that looks like a credential out of a string before it is
 * returned to a caller or written to logs. Defence-in-depth: callers must also
 * avoid serializing raw error objects (whose request config carries the token).
 */
export function scrubSecrets(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/gi, "Bearer [REDACTED]")
    .replace(/Basic\s+[A-Za-z0-9._\-+/=]+/gi, "Basic [REDACTED]")
    .replace(
      /("?(?:authorization|cookie|set-cookie|access_token|refresh_token|client_secret|id_token)"?\s*[:=]\s*"?)[^",}\s]+/gi,
      "$1[REDACTED]",
    );
}

/**
 * Format error messages in a user-friendly way without leaking credentials.
 *
 * IMPORTANT: never serialize the error object itself. An Axios-style error's
 * `config.headers.authorization` holds a live Bearer token, and both
 * `JSON.stringify(error)` (via AxiosError.toJSON) and console logging of the
 * raw error would expose it. We only ever read the response body.
 */
export function formatError(error: unknown): string {
  // Duck-type the error rather than using `instanceof AxiosError`: xero-node
  // bundles its own axios, so its rejected errors are not instances of the
  // axios package we import here.
  const response = (
    error as {
      response?: { status?: number; statusCode?: number; data?: unknown };
    }
  )?.response;
  const status = response?.status ?? response?.statusCode;

  if (status) {
    switch (status) {
      case 401:
        return "Authentication failed. Please check your Xero credentials.";
      case 403:
        return "You don't have permission to access this resource in Xero.";
      case 404:
        return "The requested resource was not found in Xero.";
      case 429:
        return "Too many requests to Xero. Please try again in a moment.";
      default: {
        const data = response?.data as { Detail?: string } | undefined;
        const detail =
          typeof data?.Detail === "string" ? data.Detail : undefined;
        let body: string | undefined;
        try {
          body = JSON.stringify(response?.data);
        } catch {
          body = undefined;
        }
        return scrubSecrets(
          detail || `Xero API error (${status}): ${body ?? "no details"}`,
        );
      }
    }
  }

  return scrubSecrets(
    error instanceof Error ? error.message : "An unexpected error occurred.",
  );
}
