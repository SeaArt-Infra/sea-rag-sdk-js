# sea-rag-sdk-js

ESM SDK for SeaArt RAG. It wraps RAGFlow REST APIs for Node.js services through the SeaArt gateway, covering dataset ingestion, document and chunk management, retrieval, and chat completion.

## Available Resources

| Client resource | Function |
| --- | --- |
| `client.datasets` | Create, list, get, update, and delete datasets |
| `client.documents` | Upload, list, update, parse, stop, delete, and download documents |
| `client.chunks` | Start or cancel parsing and manage chunks |
| `client.retrieval` | Retrieve grounded chunks from datasets |
| `client.chat` | Manage chat assistants and run JSON or streaming completions |
| `client.raw` | Call a RAGFlow endpoint not yet represented by a helper |

## Gateway Routing

Pass only the SeaArt gateway base URL. The SDK appends `/rag` once and resources append `/api/v1`.

| Input endpoint | Request example |
| --- | --- |
| `https://gateway.example.com` | `https://gateway.example.com/rag/api/v1/retrieval` |
| `https://gateway.example.com/rag` | `https://gateway.example.com/rag/api/v1/retrieval` |
| `https://gateway.example.com/team-a` | `https://gateway.example.com/team-a/rag/api/v1/retrieval` |

OpenResty removes `/rag` while proxying to RAGFlow. Do not add `/api/v1` to the client's `endpoint`.

## Install

```bash
npm install sea-rag-sdk-js
```

The package is ESM-only and requires Node.js 18.17 or newer. It has no runtime dependency beyond Node's built-in Fetch, FormData, Blob, and streaming APIs.

## Quick Start

```js
import { SeaRAGClient } from "sea-rag-sdk-js";

const client = new SeaRAGClient({
  endpoint: process.env.SEAART_GATEWAY_BASE_URL,
  apiKey: process.env.SEAART_RAG_API_KEY,
  headers: { "X-Project-ID": process.env.RAGFLOW_PROJECT_ID },
});

const result = await client.retrieval.search({
  dataset_ids: ["dataset-id"],
  question: "What does the handbook say about leave?",
  top_k: 20,
});

console.log(result);
```

The client sends `Authorization: Bearer <apiKey>` unless `headers` already contains Authorization. This project-scoped RAGFlow deployment requires `headers["X-Project-ID"]`; the SDK mirrors it into `project_id` in JSON and multipart request bodies. Conversely, a JSON or multipart `project_id` sends the same header. The header wins if both differ.

## Ingest A Document

RAGFlow expects a repeated multipart form field named `file`. Each element passed to `client.documents.upload()` has `name`, `content`, and optional `type`; content can be a `Blob`, `ArrayBuffer`, typed array, or string. Read files into a `Uint8Array` with `node:fs/promises` when running on Node.js. Every JSON resource method returns `RAGResponse<T>` with `code`, `message`, `success`, and typed `data`.

```js
import { readFile } from "node:fs/promises";

const datasetId = process.env.RAGFLOW_DATASET_ID;

const uploaded = await client.documents.upload(datasetId, [
  {
    name: "handbook.pdf",
    content: await readFile("handbook.pdf"),
    type: "application/pdf",
  },
]);
if (uploaded.data.length === 0) {
  throw new Error("RAGFlow upload returned no document");
}
const documentId = uploaded.data[0].id;

await client.chunks.startParsing(datasetId, [documentId]);
await client.documents.waitForParsing(datasetId, documentId);
```

Use `client.documents.parse()` and `client.documents.stop()` for newer document parse endpoints. Use `client.chunks.startParsing()` and `client.chunks.cancelParsing()` for compatible chunk parse routes.

Parsing is asynchronous. Call `client.documents.waitForParsing()` before retrieval; it polls every second by default and waits for up to 15 minutes. It returns a typed `Document` on `DONE`, rejects with `ParsingFailedError` on `CANCEL` or `FAIL`, and rejects with `ParsingTimeoutError` on timeout. `onProgress` receives every observed document state.

## Retrieve And Curate Chunks

Pass the RAGFlow retrieval body directly to `client.retrieval.search()`. The payload supports `dataset_ids`, `document_ids`, `question`, `similarity_threshold`, `vector_similarity_weight`, `top_k`, `rerank_id`, metadata conditions, and graph retrieval options.

```js
const result = await client.retrieval.search({
  dataset_ids: ["dataset-id"],
  question: "How are expenses approved?",
  similarity_threshold: 0.2,
  vector_similarity_weight: 0.3,
  top_k: 20,
  highlight: true,
});
```

Use `client.chunks.list()`, `get()`, `create()`, `update()`, and `delete()` for manual curation. The SDK URL-escapes resource identifiers.

## Chat Completion And Streaming

Use `client.chat.complete()` for JSON responses. `client.chat.stream()` forces `stream: true` and passes UTF-8-safe raw SSE text to its callback. Parse events at the application boundary because RAGFlow's streamed event body depends on chat configuration.

```js
await client.chat.stream(
  { chat_id: "chat-assistant-id", question: "Summarize the leave policy." },
  (chunk) => process.stdout.write(chunk),
);
```

## Errors And Unsupported APIs

`APIError` represents HTTP failures and RAGFlow envelopes whose `code` is non-zero. Inspect `statusCode`, `code`, and `message` when handling an error. `waitForParsing()` additionally rejects with `ParsingFailedError` and `ParsingTimeoutError` for terminal parse outcomes.

For a RAGFlow endpoint outside the core resources, use a full RAGFlow path:

```js
const models = await client.raw.request("GET", "/api/v1/models");
```

## Verify

```bash
npm test
```

Keep API keys out of browser code, source control, logs, and telemetry. Avoid logging raw customer documents, prompts, and retrieved chunks.

<script
  type="text/plain"
  data-doc-skill
  data-doc-skill-id="sea-rag-sdk-js"
  data-doc-skill-label="SeaRAG JavaScript SDK"
  data-doc-skill-filename="sea-rag-sdk-js-SKILL.md"
  data-doc-skill-version="1"
>
---
name: sea-rag-sdk-js
description: Integrate Node.js services with SeaArt RAG and RAGFlow through the official sea-rag-sdk-js package. Use for dataset creation, document upload and parsing, parsing-status waits, chunk management, retrieval, chat completion, or RAGFlow API access in ESM applications.
---

# SeaRAG JavaScript SDK

Use `sea-rag-sdk-js` in Node.js services instead of hand-written RAGFlow HTTP calls.

## Workflow

1. Install the ESM package with `npm install sea-rag-sdk-js`.
2. Create one `SeaRAGClient` with the SeaArt gateway base URL and API key.
3. Pass the gateway base URL only. The SDK appends `/rag` once and resource methods add `/api/v1`.
4. Resource methods return `RAGResponse<T>` objects; read typed payloads from `response.data`.
5. Call `client.documents.waitForParsing()` after starting parsing and before retrieval.
6. Run `npm test` after changing the integration.

The client adds `Authorization: Bearer <apiKey>` unless global headers supply Authorization. This project-scoped RAGFlow deployment requires `headers["X-Project-ID"]`; the SDK mirrors it into `project_id` in JSON and multipart request bodies. Conversely, a JSON or multipart `project_id` sends the same header. The header wins if both differ. Do not include `/rag` or `/api/v1` in normal endpoint configuration, and never expose the key to browsers.

## Shortest Runnable Flow

Set `SEAART_GATEWAY_BASE_URL`, `SEAART_RAG_API_KEY`, `RAGFLOW_PROJECT_ID`, and `RAGFLOW_DATASET_ID`, then run this beside `handbook.pdf`:

```js
import { readFile } from "node:fs/promises";
import { SeaRAGClient } from "sea-rag-sdk-js";

const datasetId = process.env.RAGFLOW_DATASET_ID;
const projectId = process.env.RAGFLOW_PROJECT_ID;
if (!datasetId || !projectId) {
  throw new Error("RAGFLOW_DATASET_ID and RAGFLOW_PROJECT_ID are required");
}
const client = new SeaRAGClient({
  endpoint: process.env.SEAART_GATEWAY_BASE_URL,
  apiKey: process.env.SEAART_RAG_API_KEY,
  headers: { "X-Project-ID": projectId },
});

const uploaded = await client.documents.upload(datasetId, [{
  name: "handbook.pdf",
  content: await readFile("handbook.pdf"),
  type: "application/pdf",
}]);
if (uploaded.data.length === 0) {
  throw new Error("RAGFlow upload returned no document");
}

const documentId = uploaded.data[0].id;
await client.chunks.startParsing(datasetId, [documentId]);
await client.documents.waitForParsing(datasetId, documentId, {
  onProgress(document) {
    console.log(document.parsingStatus, `${Math.round(document.progress * 100)}%`);
  },
});

const result = await client.retrieval.search({
  dataset_ids: [datasetId],
  document_ids: [documentId],
  question: "What does the handbook say about leave?",
  top_k: 5,
});
console.log(`retrieved ${result.data.chunks.length} chunks`);
```

`waitForParsing()` polls every second by default for up to 15 minutes. It returns a typed `Document` on `DONE`, invokes `onProgress` for every observed document state, rejects with `ParsingFailedError` for `CANCEL` or `FAIL`, and rejects with `ParsingTimeoutError` on timeout. RAGFlow state is normalized to `UNSTART`, `RUNNING`, `CANCEL`, `DONE`, or `FAIL`.

## Other Resources

Use `client.documents.parse()` and `stop()` for newer document parse endpoints. Use `client.chunks.cancelParsing()` to cancel compatible parsing and its chunk CRUD helpers for curation. Use `client.chat.complete()` or `stream()` for configured chat assistants, and `client.raw.request(method, "/api/v1/...", { query, body })` for an uncovered RAGFlow API.

## Safety

`APIError` represents HTTP failures and RAGFlow envelopes whose `code` is non-zero. Keep API keys, customer documents, prompts, and raw retrieval output out of source control and logs.
</script>
