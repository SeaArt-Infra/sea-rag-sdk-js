import assert from "node:assert/strict";
import test from "node:test";

import {
  APIError,
  Document,
  ParsingFailedError,
  ParsingTimeoutError,
  RAGResponse,
  SeaRAGClient,
  SeaRAGTransport,
  UploadedFile,
  normalizeRAGEndpoint,
} from "./src/index.js";

const nativeFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = nativeFetch;
});

test("normalizes the gateway endpoint with /rag once", () => {
  assert.equal(normalizeRAGEndpoint("http://127.0.0.1:8080"), "http://127.0.0.1:8080/rag");
  assert.equal(normalizeRAGEndpoint("http://127.0.0.1:8080/"), "http://127.0.0.1:8080/rag");
  assert.equal(normalizeRAGEndpoint("http://127.0.0.1:8080/rag"), "http://127.0.0.1:8080/rag");
  assert.equal(normalizeRAGEndpoint("http://127.0.0.1:8080/rag/"), "http://127.0.0.1:8080/rag/");
  assert.equal(normalizeRAGEndpoint("https://example.com/api?debug=1"), "https://example.com/api/rag?debug=1");
});

test("builds URL and authorization headers", () => {
  const transport = new SeaRAGTransport(
    "https://example.com/base?debug=1",
    "secret",
    { "X-User-ID": "user_1" },
  );
  assert.equal(
    transport.buildURL("/api/v1/datasets/a%2Fb", { ids: ["one", "two"], desc: false, page: 0 }),
    "https://example.com/base/rag/api/v1/datasets/a%2Fb?debug=1&ids=one&ids=two&desc=false",
  );
  const headers = transport.buildHeaders("application/json", true, { authorization: "Bearer custom" });
  assert.equal(headers["X-User-ID"], "user_1");
  assert.equal(headers.authorization, "Bearer custom");
  assert.equal(headers.Authorization, undefined);
});

test("uploads multipart documents through the normalized gateway route", async () => {
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return jsonResponse({ code: 0, data: [{ id: "doc_1", run: "1" }] });
  };

  const client = new SeaRAGClient({
    endpoint: "https://gateway.example",
    apiKey: "api-key",
    headers: { "X-Project-ID": "project_1" },
  });
  const result = await client.documents.upload("kb_1", [{ name: "notes.txt", content: "rag content" }]);

  assert.ok(result instanceof RAGResponse);
  assert.equal(result.code, 0);
  assert.ok(result.success);
  assert.ok(result.data[0] instanceof Document);
  assert.equal(result.data[0].parsingStatus, "RUNNING");
  assert.equal(captured.url, "https://gateway.example/rag/api/v1/datasets/kb_1/documents");
  assert.equal(captured.options.headers.authorization, "Bearer api-key");
  assert.equal(captured.options.headers["X-Project-ID"], "project_1");
  assert.equal(captured.options.body.get("project_id"), "project_1");
  const file = captured.options.body.get("file");
  assert.equal(file.name, "notes.txt");
  assert.equal(await file.text(), "rag content");
});

test("uploads a URL into a dataset with the web import endpoint", async () => {
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return jsonResponse({ code: 0, data: { id: "doc_1", name: "example.pdf", run: "0" } });
  };

  const client = new SeaRAGClient({ endpoint: "https://gateway.example" });
  const result = await client.documents.uploadFromURL(
    "kb_1",
    "example-page",
    "https://example.com/page",
  );

  assert.ok(result.success);
  assert.ok(result.data instanceof Document);
  assert.equal(result.data.id, "doc_1");
  assert.equal(result.data.parsingStatus, "UNSTART");
  assert.equal(captured.url, "https://gateway.example/rag/api/v1/datasets/kb_1/documents?type=web");
  assert.equal(captured.options.body.get("name"), "example-page");
  assert.equal(captured.options.body.get("url"), "https://example.com/page");
  assert.equal(captured.options.body.get("file"), null);
});

test("crawls a URL into an attachment without creating a dataset document", async () => {
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return jsonResponse({ code: 0, data: { id: "file_1", name: "page.pdf", mime_type: "application/pdf" } });
  };

  const client = new SeaRAGClient({ endpoint: "https://gateway.example" });
  const result = await client.documents.uploadInfoFromURL("https://example.com/page");

  assert.ok(result.success);
  assert.ok(result.data instanceof UploadedFile);
  assert.equal(result.data.id, "file_1");
  assert.equal(result.data.mimeType, "application/pdf");
  assert.equal(captured.url, "https://gateway.example/rag/api/v1/documents/upload?url=https%3A%2F%2Fexample.com%2Fpage");
});

test("adds the project id to JSON requests without mutating the caller payload", async () => {
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return jsonResponse({ code: 0, data: { chunks: [] } });
  };

  const payload = { question: "hello" };
  const client = new SeaRAGClient({
    endpoint: "https://gateway.example",
    headers: { "X-Project-ID": "project_1" },
  });
  await client.retrieval.search(payload);

  assert.equal(captured.options.headers["X-Project-ID"], "project_1");
  assert.equal(JSON.parse(captured.options.body).project_id, "project_1");
  assert.equal(payload.project_id, undefined);
});

test("adds the project id header from a JSON payload", async () => {
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return jsonResponse({ code: 0, data: { chunks: [] } });
  };

  const client = new SeaRAGClient({ endpoint: "https://gateway.example" });
  await client.retrieval.search({ question: "hello", project_id: "project_1" });

  assert.equal(captured.options.headers["X-Project-ID"], "project_1");
  assert.equal(JSON.parse(captured.options.body).project_id, "project_1");
});

test("throws APIError for non-zero RAGFlow response code", async () => {
  globalThis.fetch = async () => jsonResponse({ code: 102, message: "dataset_ids is required" });
  const client = new SeaRAGClient({ endpoint: "https://gateway.example" });
  await assert.rejects(client.retrieval.search({}), (error) => {
    assert.ok(error instanceof APIError);
    assert.equal(error.code, 102);
    return true;
  });
});

test("streams raw SSE text with split UTF-8 and forces stream true", async () => {
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return new Response(byteStream(["data: ", "你\n\n"]), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  const chunks = [];
  const client = new SeaRAGClient({ endpoint: "https://gateway.example" });
  await client.chat.stream({ chat_id: "chat_1", question: "hello" }, (chunk) => chunks.push(chunk));

  assert.equal(captured.url, "https://gateway.example/rag/api/v1/chat/completions");
  assert.equal(JSON.parse(captured.options.body).stream, true);
  assert.equal(chunks.join(""), "data: 你\n\n");
});

test("waitForParsing returns a typed document after RUNNING becomes DONE", async () => {
  let polls = 0;
  globalThis.fetch = async (url) => {
    assert.match(url, /\/documents\?id=doc_1/);
    polls += 1;
    return jsonResponse({
      code: 0,
      data: {
        docs: [{ id: "doc_1", run: polls === 1 ? "1" : "DONE", chunk_count: 3 }],
      },
    });
  };

  const progress = [];
  const client = new SeaRAGClient({ endpoint: "https://gateway.example" });
  const document = await client.documents.waitForParsing("kb_1", "doc_1", {
    pollIntervalMs: 1,
    timeoutMs: 1_000,
    onProgress(item) {
      progress.push(item.parsingStatus);
    },
  });

  assert.ok(document instanceof Document);
  assert.equal(document.parsingStatus, "DONE");
  assert.equal(document.chunkCount, 3);
  assert.deepEqual(progress, ["RUNNING", "DONE"]);
});

test("waitForParsing throws ParsingFailedError for terminal failure", async () => {
  globalThis.fetch = async () => jsonResponse({
    code: 0,
    data: { docs: [{ id: "doc_1", run: "4", progress_msg: "invalid file" }] },
  });

  const client = new SeaRAGClient({ endpoint: "https://gateway.example" });
  await assert.rejects(client.documents.waitForParsing("kb_1", "doc_1"), (error) => {
    assert.ok(error instanceof ParsingFailedError);
    assert.equal(error.document.parsingStatus, "FAIL");
    return true;
  });
});

test("waitForParsing throws ParsingTimeoutError with the last document", async () => {
  globalThis.fetch = async () => jsonResponse({
    code: 0,
    data: { docs: [{ id: "doc_1", run: "RUNNING" }] },
  });

  const client = new SeaRAGClient({ endpoint: "https://gateway.example" });
  await assert.rejects(client.documents.waitForParsing("kb_1", "doc_1", {
    pollIntervalMs: 1,
    timeoutMs: 4,
  }), (error) => {
    assert.ok(error instanceof ParsingTimeoutError);
    assert.equal(error.lastDocument.parsingStatus, "RUNNING");
    return true;
  });
});

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function byteStream(parts) {
  const encoder = new TextEncoder();
  const chunks = parts.flatMap((part) => {
    const encoded = encoder.encode(part);
    if (part === "你\n\n") {
      return [encoded.slice(0, 1), encoded.slice(1)];
    }
    return [encoded];
  });
  return new ReadableStream({
    pull(controller) {
      const next = chunks.shift();
      if (next) {
        controller.enqueue(next);
      } else {
        controller.close();
      }
    },
  });
}
