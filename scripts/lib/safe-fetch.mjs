const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function fetchTextWithPolicy(url, options = {}, policy = {}) {
  const {
    timeoutMs = 20_000,
    maxBytes = 5 * 1024 * 1024,
    maxRedirects = 3,
    allowedOrigins = [],
    allowedHostnames = [],
    allowedHostnameSuffixes = [],
  } = policy;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`Request timed out after ${timeoutMs}ms.`)),
    timeoutMs,
  );
  const externalSignal = options.signal;
  const signal = externalSignal
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;
  const requestOptions = { ...options };
  delete requestOptions.signal;

  try {
    let currentUrl = validateUrl(url, {
      allowedOrigins,
      allowedHostnames,
      allowedHostnameSuffixes,
    });
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
          throw new Error(`Too many redirects while requesting ${url}.`);
        }

        const location = response.headers.get("location");
        if (!location) {
          await response.body?.cancel().catch(() => {});
          throw new Error(
            `Redirect response from ${currentUrl.origin} omitted Location.`,
          );
        }

        const nextUrl = validateUrl(new URL(location, currentUrl), {
          allowedOrigins,
          allowedHostnames,
          allowedHostnameSuffixes,
        });
        await response.body?.cancel().catch(() => {});

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
        throw new Error(
          `${currentUrl.origin} responded with ${response.status} ${response.statusText}`,
        );
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
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
