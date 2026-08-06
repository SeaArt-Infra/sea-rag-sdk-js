import {
  Chat,
  ChatList,
  Chunk,
  ChunkList,
  Dataset,
  Document,
  DocumentList,
  ParsingFailedError,
  ParsingStatus,
  ParsingTimeoutError,
  RetrievalResult,
  normalizeRAGResponse,
} from "./types.js";

const API_PREFIX = "/api/v1";
const DEFAULT_PARSE_POLL_INTERVAL_MS = 1_000;
const DEFAULT_PARSE_WAIT_TIMEOUT_MS = 15 * 60_000;

class Resource {
  constructor(transport) {
    this.transport = transport;
  }

  request(method, path, { query, body, headers, signal } = {}) {
    return this.transport.requestJSON(method, `${API_PREFIX}${path}`, { query, body, headers, signal });
  }
}

export class DatasetsResource extends Resource {
  async create(payload) {
    return response(await this.request("POST", "/datasets", { body: payload }), (value) => new Dataset(value));
  }

  async list(options = {}) {
    return response(await this.request("GET", "/datasets", { query: options }), (value) => objectArray(value).map((item) => new Dataset(item)));
  }

  async get(datasetId) {
    return response(await this.request("GET", `/datasets/${pathSegment(datasetId)}`), (value) => new Dataset(value));
  }

  async update(datasetId, payload) {
    return response(await this.request("PUT", `/datasets/${pathSegment(datasetId)}`, { body: payload }), (value) => new Dataset(value));
  }

  async delete(ids, { deleteAll = false } = {}) {
    const body = { delete_all: deleteAll };
    if (ids?.length) {
      body.ids = [...ids];
    }
    return response(await this.request("DELETE", "/datasets", { body }));
  }
}

export class DocumentsResource extends Resource {
  async upload(datasetId, files, { fields, signal } = {}) {
    const raw = await this.transport.postMultipart(
      `${API_PREFIX}/datasets/${pathSegment(datasetId)}/documents`,
      files,
      fields,
      { signal },
    );
    return response(raw, (value) => objectArray(value).map((item) => new Document(item)));
  }

  async list(datasetId, options = {}, { signal } = {}) {
    return response(
      await this.request("GET", `/datasets/${pathSegment(datasetId)}/documents`, { query: options, signal }),
      (value) => new DocumentList(value),
    );
  }

  async update(datasetId, documentId, payload) {
    return response(
      await this.request(
        "PATCH",
        `/datasets/${pathSegment(datasetId)}/documents/${pathSegment(documentId)}`,
        { body: payload },
      ),
      (value) => new Document(value),
    );
  }

  async delete(datasetId, ids, { deleteAll = false } = {}) {
    const body = { delete_all: deleteAll };
    if (ids?.length) {
      body.ids = [...ids];
    }
    return response(await this.request("DELETE", `/datasets/${pathSegment(datasetId)}/documents`, { body }));
  }

  async parse(datasetId, documentIds) {
    return response(await this.request("POST", `/datasets/${pathSegment(datasetId)}/documents/parse`, {
      body: { document_ids: [...documentIds] },
    }));
  }

  async stop(datasetId, documentIds) {
    return response(await this.request("POST", `/datasets/${pathSegment(datasetId)}/documents/stop`, {
      body: { document_ids: [...documentIds] },
    }));
  }

  async download(datasetId, documentId, options) {
    return this.transport.download(
      `${API_PREFIX}/datasets/${pathSegment(datasetId)}/documents/${pathSegment(documentId)}`,
      options,
    );
  }

  async waitForParsing(datasetId, documentId, {
    pollIntervalMs = DEFAULT_PARSE_POLL_INTERVAL_MS,
    timeoutMs = DEFAULT_PARSE_WAIT_TIMEOUT_MS,
    onProgress,
    signal,
  } = {}) {
    if (typeof datasetId !== "string" || !datasetId.trim() || typeof documentId !== "string" || !documentId.trim()) {
      throw new TypeError("datasetId and documentId are required");
    }
    if (onProgress !== undefined && typeof onProgress !== "function") {
      throw new TypeError("onProgress must be a function");
    }
    const interval = positiveMilliseconds(pollIntervalMs, DEFAULT_PARSE_POLL_INTERVAL_MS, "pollIntervalMs");
    const timeout = positiveMilliseconds(timeoutMs, DEFAULT_PARSE_WAIT_TIMEOUT_MS, "timeoutMs");
    const deadline = Date.now() + timeout;
    let lastDocument;

    while (true) {
      throwIfAborted(signal);
      const listed = await this.list(datasetId, { id: documentId, page: 1, page_size: 1 }, { signal });
      const document = listed.data.docs[0];
      if (document) {
        lastDocument = document;
        onProgress?.(document);
        if (document.parsingStatus === ParsingStatus.DONE) {
          return document;
        }
        if (document.parsingStatus === ParsingStatus.CANCEL || document.parsingStatus === ParsingStatus.FAIL) {
          throw new ParsingFailedError(document);
        }
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new ParsingTimeoutError(datasetId, documentId, timeout, lastDocument);
      }
      await sleep(Math.min(interval, remaining), signal);
    }
  }
}

export class ChunksResource extends Resource {
  async startParsing(datasetId, documentIds) {
    return response(await this.request("POST", `/datasets/${pathSegment(datasetId)}/chunks`, {
      body: { document_ids: [...documentIds] },
    }));
  }

  async cancelParsing(datasetId, documentIds) {
    return response(await this.request("DELETE", `/datasets/${pathSegment(datasetId)}/chunks`, {
      body: { document_ids: [...documentIds] },
    }));
  }

  async list(datasetId, documentId, options = {}) {
    return response(
      await this.request(
        "GET",
        `/datasets/${pathSegment(datasetId)}/documents/${pathSegment(documentId)}/chunks`,
        { query: options },
      ),
      (value) => new ChunkList(value),
    );
  }

  async get(datasetId, documentId, chunkId) {
    return response(
      await this.request(
        "GET",
        `/datasets/${pathSegment(datasetId)}/documents/${pathSegment(documentId)}/chunks/${pathSegment(chunkId)}`,
      ),
      (value) => new Chunk(value),
    );
  }

  async create(datasetId, documentId, payload) {
    return response(await this.request(
      "POST",
      `/datasets/${pathSegment(datasetId)}/documents/${pathSegment(documentId)}/chunks`,
      { body: payload },
    ));
  }

  async update(datasetId, documentId, chunkId, payload) {
    return response(await this.request(
      "PATCH",
      `/datasets/${pathSegment(datasetId)}/documents/${pathSegment(documentId)}/chunks/${pathSegment(chunkId)}`,
      { body: payload },
    ));
  }

  async delete(datasetId, documentId, chunkIds, { deleteAll = false } = {}) {
    const body = { delete_all: deleteAll };
    if (chunkIds?.length) {
      body.chunk_ids = [...chunkIds];
    }
    return response(await this.request(
      "DELETE",
      `/datasets/${pathSegment(datasetId)}/documents/${pathSegment(documentId)}/chunks`,
      { body },
    ));
  }
}

export class RetrievalResource extends Resource {
  async search(payload) {
    return response(await this.request("POST", "/retrieval", { body: payload }), (value) => new RetrievalResult(value));
  }
}

export class ChatResource extends Resource {
  async create(payload) {
    return response(await this.request("POST", "/chats", { body: payload }), (value) => new Chat(value));
  }

  async list(options = {}) {
    return response(await this.request("GET", "/chats", { query: options }), (value) => new ChatList(value));
  }

  async get(chatId) {
    return response(await this.request("GET", `/chats/${pathSegment(chatId)}`), (value) => new Chat(value));
  }

  async update(chatId, payload) {
    return response(await this.request("PATCH", `/chats/${pathSegment(chatId)}`, { body: payload }));
  }

  async delete(ids, { deleteAll = false } = {}) {
    const body = { delete_all: deleteAll };
    if (ids?.length) {
      body.ids = [...ids];
    }
    return response(await this.request("DELETE", "/chats", { body }));
  }

  async complete(payload) {
    return response(await this.request("POST", "/chat/completions", { body: payload }));
  }

  async stream(payload, onChunk, options = {}) {
    await this.transport.postStream(
      `${API_PREFIX}/chat/completions`,
      { ...payload, stream: true },
      onChunk,
      options,
    );
  }
}

export class RawResource {
  constructor(transport) {
    this.transport = transport;
  }

  async request(method, path, { query, body, headers, signal } = {}) {
    return response(await this.transport.requestJSON(method, path, { query, body, headers, signal }));
  }
}

function response(value, mapData) {
  return normalizeRAGResponse(value, mapData);
}

function objectArray(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) : [];
}

function pathSegment(value) {
  return encodeURIComponent(value);
}

function positiveMilliseconds(value, defaultValue, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return number > 0 ? number : defaultValue;
}

function throwIfAborted(signal) {
  if (!signal?.aborted) {
    return;
  }
  throw signal.reason ?? abortError();
}

function sleep(milliseconds, signal) {
  if (!signal) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, milliseconds);
    function done() {
      signal.removeEventListener("abort", aborted);
      resolve();
    }
    function aborted() {
      clearTimeout(timer);
      signal.removeEventListener("abort", aborted);
      reject(signal.reason ?? abortError());
    }
    signal.addEventListener("abort", aborted, { once: true });
  });
}

function abortError() {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}
