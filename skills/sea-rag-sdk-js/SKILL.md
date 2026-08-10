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
