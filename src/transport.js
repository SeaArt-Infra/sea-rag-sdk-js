const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;

export class APIError extends Error {
  constructor(message, { statusCode, code } = {}) {
    const prefix = code !== undefined
      ? `RAG API error ${code}`
      : statusCode !== undefined
        ? `HTTP ${statusCode}`
        : "RAG API error";
    super(`${prefix}: ${message}`);
    this.name = "APIError";
    this.statusCode = statusCode;
    this.code = code;
    this.message = message;
  }
}

export class SeaRAGTransport {
  constructor(endpoint, apiKey, headers = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
    if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
      throw new TypeError("timeoutMs must be a non-negative finite number");
    }
    this.endpoint = normalizeRAGEndpoint(endpoint);
    this.apiKey = apiKey;
    this.headers = withProjectIDHeader(headers, projectIDFromHeaders(headers));
    this.timeoutMs = timeoutMs;
  }

  async get(path, query) {
    return this.requestJSON("GET", path, { query });
  }

  async post(path, body) {
    return this.requestJSON("POST", path, { body });
  }

  async put(path, body) {
    return this.requestJSON("PUT", path, { body });
  }

  async patch(path, body) {
    return this.requestJSON("PATCH", path, { body });
  }

  async delete(path, body) {
    return this.requestJSON("DELETE", path, { body });
  }

  async requestJSON(method, path, { query, body, headers, signal } = {}) {
    const url = this.buildURL(path, query);
    const response = await this.request(method, url, body, "application/json", headers, signal, true);
    const text = await response.text();
    if (!response.ok) {
      throw httpError(response.status, text);
    }
    if (!text) {
      return null;
    }
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error(`expected JSON response from ${url}, got: ${responsePreview(text)}`);
    }
    throwForRAGResponse(value);
    return value;
  }

  async postMultipart(path, files, fields = {}, { signal } = {}) {
    const projectContext = multipartProjectContext(fields, this.headers);
    const form = new FormData();
    for (const [key, value] of Object.entries(projectContext.fields)) {
      form.append(key, String(value));
    }
    for (const file of files) {
      if (!file?.name || file.content === undefined || file.content === null) {
        throw new TypeError("each upload file requires name and content");
      }
      form.append("file", uploadBlob(file), file.name);
    }

    const url = this.buildURL(path);
    const response = await this.request(
      "POST",
      url,
      form,
      "application/json",
      projectContext.headers,
      signal,
      false,
    );
    const text = await response.text();
    if (!response.ok) {
      throw httpError(response.status, text);
    }
    if (!text) {
      return null;
    }
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error(`expected JSON response from ${url}, got: ${responsePreview(text)}`);
    }
    throwForRAGResponse(value);
    return value;
  }

  async postStream(path, body, onChunk, { headers, signal } = {}) {
    if (typeof onChunk !== "function") {
      throw new TypeError("onChunk must be a function");
    }
    const url = this.buildURL(path);
    const response = await this.request("POST", url, body, "text/event-stream", headers, signal, true, false);
    if (!response.ok) {
      throw httpError(response.status, await response.text());
    }
    if (!response.body) {
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          const rest = decoder.decode();
          if (rest) {
            onChunk(rest);
          }
          return;
        }
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          onChunk(chunk);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async download(path, { signal } = {}) {
    const url = this.buildURL(path);
    const response = await this.request("GET", url, undefined, "*/*", undefined, signal, false);
    if (!response.ok) {
      throw httpError(response.status, await response.text());
    }
    return {
      body: new Uint8Array(await response.arrayBuffer()),
      headers: Object.fromEntries(response.headers.entries()),
    };
  }

  buildURL(path, query) {
    const url = new URL(this.endpoint);
    const basePath = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    const relativePath = String(path).replace(/^\/+/, "");
    url.pathname = `${basePath}${relativePath}`.replace(/\/{2,}/g, "/");
    for (const [key, value] of Object.entries(query ?? {})) {
      if (isZeroValue(value)) {
        continue;
      }
      url.searchParams.delete(key);
      for (const item of queryValues(value)) {
        url.searchParams.append(key, item);
      }
    }
    return url.toString();
  }

  buildHeaders(accept = "*/*", hasBody = false, requestHeaders = {}) {
    const headers = {
      ...(accept ? { accept } : {}),
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...this.headers,
      ...(requestHeaders ?? {}),
    };
    if (this.apiKey && !hasHeader(headers, "authorization")) {
      headers.authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async request(method, url, body, accept, requestHeaders, signal, serializeJSON, applyTimeout = true) {
    const hasBody = body !== undefined;
    let headers = this.buildHeaders(accept, hasBody && serializeJSON, requestHeaders);
    let requestBody = body;
    if (serializeJSON) {
      ({ body: requestBody, headers } = projectJSONContext(body, headers));
    }
    const payload = hasBody && serializeJSON ? JSON.stringify(requestBody) : requestBody;
    if (isDebugEnabled()) {
      console.error(`${method} ${url}`);
    }
    return fetch(url, {
      method,
      headers,
      body: payload,
      signal: signal ?? (applyTimeout && this.timeoutMs > 0 ? AbortSignal.timeout(this.timeoutMs) : undefined),
    });
  }
}

export function normalizeRAGEndpoint(endpoint) {
  if (typeof endpoint !== "string" || endpoint.trim() === "") {
    return endpoint;
  }
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return endpoint;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (!segments.includes("rag")) {
    segments.push("rag");
    url.pathname = `/${segments.join("/")}`;
  }
  return url.toString();
}

export function withProjectIDHeader(headers, projectId) {
  const value = typeof projectId === "string" ? projectId.trim() : "";
  if (!value) {
    return { ...(headers ?? {}) };
  }

  const result = {};
  for (const [key, headerValue] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() !== "x-project-id") {
      result[key] = headerValue;
    }
  }
  result["X-Project-ID"] = value;
  return result;
}

function uploadBlob(file) {
  if (file.content instanceof Blob) {
    return file.content;
  }
  if (file.content instanceof ArrayBuffer) {
    return new Blob([file.content], { type: file.type ?? "application/octet-stream" });
  }
  if (ArrayBuffer.isView(file.content) || typeof file.content === "string") {
    return new Blob([file.content], { type: file.type ?? "application/octet-stream" });
  }
  throw new TypeError("upload file content must be Blob, ArrayBuffer, typed array, or string");
}

function throwForRAGResponse(value) {
  if (value && typeof value === "object" && Number.isInteger(value.code) && value.code !== 0) {
    throw new APIError(String(value.message ?? "RAGFlow request failed"), { code: value.code });
  }
}

function httpError(statusCode, text) {
  let value;
  try {
    value = text ? JSON.parse(text) : undefined;
  } catch {
    value = undefined;
  }
  const message = value && typeof value === "object"
    ? String(value.error ?? value.message ?? text)
    : text;
  return new APIError(message, { statusCode });
}

function isZeroValue(value) {
  return value === undefined
    || value === null
    || value === ""
    || (typeof value === "number" && value === 0);
}

function queryValues(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item) => !isZeroValue(item)).map((item) => String(item));
}

function hasHeader(headers, name) {
  return Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
}

function projectJSONContext(body, headers) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { body, headers };
  }

  const projectId = projectIDFromHeaders(headers) || projectIDFromValue(body.project_id);
  if (!projectId) {
    return { body, headers };
  }
  return {
    body: { ...body, project_id: projectId },
    headers: withProjectIDHeader(headers, projectId),
  };
}

function multipartProjectContext(fields, headers) {
  const projectId = projectIDFromHeaders(headers) || projectIDFromValue(fields?.project_id);
  if (!projectId) {
    return { fields: { ...(fields ?? {}) }, headers: undefined };
  }
  return {
    fields: { ...(fields ?? {}), project_id: projectId },
    headers: withProjectIDHeader({}, projectId),
  };
}

function projectIDFromHeaders(headers) {
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === "x-project-id") {
      return projectIDFromValue(value);
    }
  }
  return "";
}

function projectIDFromValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isDebugEnabled() {
  return process.env.SEARAG_DEBUG === "1";
}

function responsePreview(text) {
  return text.replace(/\s+/g, " ").slice(0, 240);
}
