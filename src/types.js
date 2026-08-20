export const ParsingStatus = Object.freeze({
  UNSTART: "UNSTART",
  RUNNING: "RUNNING",
  CANCEL: "CANCEL",
  DONE: "DONE",
  FAIL: "FAIL",
  SCHEDULE: "SCHEDULE",
});

export class RAGResponse {
  constructor(value = {}) {
    const raw = objectValue(value);
    this.code = numberValue(raw.code);
    this.data = raw.data;
    this.message = textValue(raw.message);
    if (raw.total_datasets !== undefined) {
      this.totalDatasets = numberValue(raw.total_datasets);
    }
  }

  get success() {
    return this.code === 0;
  }
}

export class Dataset {
  constructor(value = {}) {
    const raw = objectValue(value);
    Object.assign(this, raw);
    this.id = textValue(raw.id);
    this.name = textValue(raw.name);
    this.description = textValue(raw.description);
    this.embeddingModel = textValue(raw.embedding_model ?? raw.embeddingModel);
    this.permission = textValue(raw.permission);
    this.chunkMethod = textValue(raw.chunk_method ?? raw.chunkMethod);
    this.documentCount = numberValue(raw.document_count ?? raw.documentCount);
    this.chunkCount = numberValue(raw.chunk_count ?? raw.chunkCount);
  }
}

export class Document {
  constructor(value = {}) {
    const raw = objectValue(value);
    Object.assign(this, raw);
    this.id = textValue(raw.id);
    this.name = textValue(raw.name);
    this.datasetId = textValue(raw.dataset_id ?? raw.datasetId);
    this.run = normalizeParsingStatus(raw.run) || ParsingStatus.UNSTART;
    this.progress = numberValue(raw.progress);
    this.progressMsg = textValue(raw.progress_msg ?? raw.progressMsg);
    this.status = textValue(raw.status);
    this.chunkCount = numberValue(raw.chunk_count ?? raw.chunkCount);
    this.tokenCount = numberValue(raw.token_count ?? raw.tokenCount);
  }

  get parsingStatus() {
    return normalizeParsingStatus(this.run);
  }
}

export class UploadedFile {
  constructor(value = {}) {
    const raw = objectValue(value);
    Object.assign(this, raw);
    this.id = textValue(raw.id);
    this.name = textValue(raw.name);
    this.size = numberValue(raw.size);
    this.extension = textValue(raw.extension);
    this.mimeType = textValue(raw.mime_type ?? raw.mimeType);
    this.createdBy = textValue(raw.created_by ?? raw.createdBy);
    this.createdAt = numberValue(raw.created_at ?? raw.createdAt);
    this.previewUrl = textValue(raw.preview_url ?? raw.previewUrl);
  }
}

export class DocumentList {
  constructor(value = {}) {
    const raw = objectValue(value);
    Object.assign(this, raw);
    this.total = numberValue(raw.total);
    this.docs = objectArray(raw.docs).map((item) => new Document(item));
  }
}

export class Chunk {
  constructor(value = {}) {
    const raw = objectValue(value);
    Object.assign(this, raw);
    this.id = textValue(raw.id);
    this.content = textValue(raw.content);
    this.datasetId = textValue(raw.dataset_id ?? raw.datasetId);
    this.documentId = textValue(raw.document_id ?? raw.documentId);
    this.documentName = textValue(raw.document_name ?? raw.documentName);
    this.documentKeyword = textValue(raw.document_keyword ?? raw.documentKeyword);
    this.importantKeywords = textArray(raw.important_keywords ?? raw.importantKeywords);
    this.questions = textArray(raw.questions);
    this.tagKeywords = textArray(raw.tag_kwd ?? raw.tagKeywords);
    this.similarity = numberValue(raw.similarity);
    this.vectorSimilarity = numberValue(raw.vector_similarity ?? raw.vectorSimilarity);
    this.termSimilarity = numberValue(raw.term_similarity ?? raw.termSimilarity);
    this.available = Boolean(raw.available);
  }
}

export class ChunkList {
  constructor(value = {}) {
    const raw = objectValue(value);
    Object.assign(this, raw);
    this.total = numberValue(raw.total);
    this.chunks = objectArray(raw.chunks).map((item) => new Chunk(item));
  }
}

export class DocumentAggregation {
  constructor(value = {}) {
    const raw = objectValue(value);
    Object.assign(this, raw);
    this.count = numberValue(raw.count);
    this.documentId = textValue(raw.doc_id ?? raw.documentId);
    this.documentName = textValue(raw.doc_name ?? raw.documentName);
  }
}

export class RetrievalResult {
  constructor(value = {}) {
    const raw = objectValue(value);
    Object.assign(this, raw);
    this.total = numberValue(raw.total);
    this.chunks = objectArray(raw.chunks).map((item) => new Chunk(item));
    this.documentAggregations = objectArray(raw.doc_aggs ?? raw.documentAggregations)
      .map((item) => new DocumentAggregation(item));
  }
}

export class Chat {
  constructor(value = {}) {
    const raw = objectValue(value);
    Object.assign(this, raw);
    this.id = textValue(raw.id);
    this.name = textValue(raw.name);
    this.datasetIds = textArray(raw.dataset_ids ?? raw.datasetIds);
    this.llmId = textValue(raw.llm_id ?? raw.llmId);
  }
}

export class ChatList {
  constructor(value = {}) {
    const raw = objectValue(value);
    Object.assign(this, raw);
    this.total = numberValue(raw.total);
    this.chats = objectArray(raw.chats).map((item) => new Chat(item));
  }
}

export class ParsingFailedError extends Error {
  constructor(document) {
    const message = document?.progressMsg || document?.progress_msg || "RAGFlow parsing did not complete";
    super(`document "${document?.id ?? ""}" parsing ended as ${document?.parsingStatus ?? document?.run ?? ""}: ${message}`);
    this.name = "ParsingFailedError";
    this.document = document;
  }
}

export class ParsingTimeoutError extends Error {
  constructor(datasetId, documentId, timeoutMs, lastDocument) {
    super(`document "${documentId}" was not parsed within ${timeoutMs}ms`);
    this.name = "ParsingTimeoutError";
    this.datasetId = datasetId;
    this.documentId = documentId;
    this.timeoutMs = timeoutMs;
    this.lastDocument = lastDocument;
  }
}

export function normalizeParsingStatus(value) {
  const status = textValue(value).trim().toUpperCase();
  return {
    0: ParsingStatus.UNSTART,
    1: ParsingStatus.RUNNING,
    2: ParsingStatus.CANCEL,
    3: ParsingStatus.DONE,
    4: ParsingStatus.FAIL,
    5: ParsingStatus.SCHEDULE,
    CANCELLED: ParsingStatus.CANCEL,
    FAILED: ParsingStatus.FAIL,
    SCHEDULED: ParsingStatus.SCHEDULE,
  }[status] ?? status;
}

export function normalizeRAGResponse(value, mapData = (data) => data) {
  const raw = objectValue(value);
  return new RAGResponse({ ...raw, data: mapData(raw.data) });
}

function objectValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function objectArray(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) : [];
}

function textArray(value) {
  return Array.isArray(value) ? value.map((item) => textValue(item)) : [];
}

function textValue(value) {
  return value === undefined || value === null ? "" : String(value);
}

function numberValue(value) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}
