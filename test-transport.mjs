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

  const client = new SeaRAGClient({ endpoint: "https://gateway.example", apiKey: "api-key" });
  const result = await client.documents.upload("kb_1", [{ name: "notes.txt", content: "rag content" }]);

  assert.ok(result instanceof RAGResponse);
  assert.equal(result.code, 0);
  assert.ok(result.success);
  assert.ok(result.data[0] instanceof Document);
  assert.equal(result.data[0].parsingStatus, "RUNNING");
  assert.equal(captured.url, "https://gateway.example/rag/api/v1/datasets/kb_1/documents");
  assert.equal(captured.options.headers.authorization, "Bearer api-key");
  const file = captured.options.body.get("file");
  assert.equal(file.name, "notes.txt");
  assert.equal(await file.text(), "rag content");
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
