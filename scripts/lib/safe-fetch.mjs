const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const TRANSIENT_RESPONSE_STATUSES = new Set([
  408,
  425,
  429,
  500,
  502,
  503,
  504,
]);
const TRANSIENT_NETWORK_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);
const MAX_ALLOWED_RETRIES = 3;
const MAX_RETRY_DELAY_MS = 5_000;

class HttpResponseError extends Error {
  constructor(url, response) {
    super(
      `${url.origin} responded with ${response.status} ${response.statusText}`,
    );
    this.status = response.status;
    this.retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
  }
}

class RequestTimeoutError extends Error {}

export async function fetchTextWithPolicy(url, options = {}, policy = {}) {
  const {
    timeoutMs = 20_000,
    maxBytes = 5 * 1024 * 1024,
    maxRedirects = 3,
    maxRetries = 2,
    retryBaseDelayMs = 500,
    allowedOrigins = [],
    allowedHostnames = [],
    allowedHostnameSuffixes = [],
  } = policy;

  validateRetryPolicy(maxRetries, retryBaseDelayMs);

  const initialUrl = validateUrl(url, {
    allowedOrigins,
    allowedHostnames,
    allowedHostnameSuffixes,
  });
  const requestOptions = { ...options };
  const externalSignal = requestOptions.signal;
  delete requestOptions.signal;
  const initialMethod = String(requestOptions.method ?? "GET").toUpperCase();
  const canRetry = initialMethod === "GET" || initialMethod === "HEAD";

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchTextAttempt(initialUrl, requestOptions, externalSignal, {
        timeoutMs,
        maxBytes,
        maxRedirects,
        allowedOrigins,
        allowedHostnames,
        allowedHostnameSuffixes,
      });
    } catch (error) {
      if (
        externalSignal?.aborted ||
        !canRetry ||
        attempt >= maxRetries ||
        !isTransientFailure(error)
      ) {
        throw error;
      }

      const backoffMs = Math.min(
        retryBaseDelayMs * 2 ** attempt,
        MAX_RETRY_DELAY_MS,
      );
      const delayMs = Math.min(
        Math.max(backoffMs, error.retryAfterMs ?? 0),
        MAX_RETRY_DELAY_MS,
      );
      await waitForRetry(delayMs, externalSignal);
    }
  }
}

async function fetchTextAttempt(
  initialUrl,
  requestOptions,
  externalSignal,
  {
    timeoutMs,
    maxBytes,
    maxRedirects,
    allowedOrigins,
    allowedHostnames,
    allowedHostnameSuffixes,
  },
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`Request timed out after ${timeoutMs}ms.`)),
    timeoutMs,
  );
  const signal = externalSignal
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;

  try {
    let currentUrl = new URL(initialUrl);
    let method = String(requestOptions.method ?? "GET").toUpperCase();
    let body = requestOptions.body;
    const headers = new Headers(requestOptions.headers ?? {});

    for (let redirectCount = 0; ; redirectCount += 1) {
      const response = await fetch(currentUrl, {
        ...requestOptions,
        method,
        body,
        headers,
        redirect: "manual",
        signal,
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        if (redirectCount >= maxRedirects) {
          await response.body?.cancel().catch(() => {});
          throw new Error(
            `Too many redirects while requesting ${initialUrl.toString()}.`,
          );
        }

        const location = response.headers.get("location");
        if (!location) {
          await response.body?.cancel().catch(() => {});
          throw new Error(
            `Redirect response from ${currentUrl.origin} omitted Location.`,
          );
        }

        await response.body?.cancel().catch(() => {});
        const nextUrl = validateUrl(new URL(location, currentUrl), {
          allowedOrigins,
          allowedHostnames,
          allowedHostnameSuffixes,
        });

        if (nextUrl.origin !== currentUrl.origin) {
          headers.delete("authorization");
          headers.delete("cookie");
          headers.delete("proxy-authorization");
        }

        if (
          response.status === 303 ||
          ((response.status === 301 || response.status === 302) &&
            method === "POST")
        ) {
          method = "GET";
          body = undefined;
          headers.delete("content-length");
          headers.delete("content-type");
        }

        currentUrl = nextUrl;
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new HttpResponseError(currentUrl, response);
      }

      const text = await readTextWithLimit(response, maxBytes);
      return {
        text,
        finalUrl: currentUrl.toString(),
        status: response.status,
        headers: response.headers,
      };
    }
  } catch (error) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new RequestTimeoutError(
        `Request timed out after ${timeoutMs}ms: ${initialUrl.toString()}`,
        {
          cause: error,
        },
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function validateRetryPolicy(maxRetries, retryBaseDelayMs) {
  if (
    !Number.isSafeInteger(maxRetries) ||
    maxRetries < 0 ||
    maxRetries > MAX_ALLOWED_RETRIES
  ) {
    throw new Error(
      `maxRetries must be an integer between 0 and ${MAX_ALLOWED_RETRIES}.`,
    );
  }
  if (
    !Number.isSafeInteger(retryBaseDelayMs) ||
    retryBaseDelayMs < 0 ||
    retryBaseDelayMs > MAX_RETRY_DELAY_MS
  ) {
    throw new Error(
      `retryBaseDelayMs must be an integer between 0 and ${MAX_RETRY_DELAY_MS}.`,
    );
  }
}

function isTransientFailure(error) {
  if (error instanceof RequestTimeoutError) {
    return true;
  }
  if (error instanceof HttpResponseError) {
    return TRANSIENT_RESPONSE_STATUSES.has(error.status);
  }

  let current = error;
  for (let depth = 0; current && depth < 6; depth += 1) {
    if (TRANSIENT_NETWORK_CODES.has(String(current.code ?? ""))) {
      return true;
    }
    if (
      current === error &&
      current instanceof TypeError &&
      /^(?:fetch failed|failed to fetch)$/i.test(current.message) &&
      !current.cause
    ) {
      return true;
    }
    current = current.cause;
  }

  return false;
}

function parseRetryAfter(value) {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.ceil(seconds * 1_000), MAX_RETRY_DELAY_MS);
  }

  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) {
    return null;
  }
  return Math.min(Math.max(retryAt - Date.now(), 0), MAX_RETRY_DELAY_MS);
}

async function waitForRetry(delayMs, signal) {
  if (signal?.aborted) {
    throw signal.reason ?? new Error("Request aborted.");
  }
  if (delayMs === 0) {
    return;
  }

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal.reason ?? new Error("Request aborted."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function fetchJsonWithPolicy(url, options = {}, policy = {}) {
  const result = await fetchTextWithPolicy(url, options, policy);

  try {
    return {
      ...result,
      json: JSON.parse(result.text),
    };
  } catch (error) {
    throw new Error(`Invalid JSON response from ${result.finalUrl}.`, {
      cause: error,
    });
  }
}

export function validateUrl(
  value,
  {
    allowedOrigins = [],
    allowedHostnames = [],
    allowedHostnameSuffixes = [],
  } = {},
) {
  let url;

  try {
    url = value instanceof URL ? new URL(value) : new URL(String(value));
  } catch (error) {
    throw new Error(`Invalid request URL: ${String(value)}`, { cause: error });
  }

  if (url.protocol !== "https:") {
    throw new Error(`Only HTTPS requests are allowed: ${url.toString()}`);
  }
  if (url.username || url.password) {
    throw new Error(`URL credentials are not allowed: ${url.origin}`);
  }
  if (url.port && url.port !== "443") {
    throw new Error(`Non-standard HTTPS ports are not allowed: ${url.origin}`);
  }

  const hostname = url.hostname.toLowerCase();
  const origins = new Set(
    allowedOrigins.map((origin) => new URL(origin).origin.toLowerCase()),
  );
  const hostnames = new Set(
    allowedHostnames.map((allowed) => String(allowed).toLowerCase()),
  );
  const suffixes = allowedHostnameSuffixes.map((allowed) =>
    String(allowed).toLowerCase().replace(/^\./, ""),
  );
  const permitted =
    origins.has(url.origin.toLowerCase()) ||
    hostnames.has(hostname) ||
    suffixes.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    );

  if (!permitted) {
    throw new Error(`Request origin is not allowlisted: ${url.origin}`);
  }

  return url;
}

async function readTextWithLimit(response, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("maxBytes must be a positive safe integer.");
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new Error(
      `Response exceeds ${maxBytes} bytes (Content-Length: ${declaredLength}).`,
    );
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(`Response exceeds ${maxBytes} bytes.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
