export interface ClientOptions {
  endpoint: string;
  apiKey?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface UploadFile {
  name: string;
  content: Blob | ArrayBuffer | ArrayBufferView | string;
  type?: string;
}

export interface WaitForParsingOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  onProgress?: (document: Document) => void;
  signal?: AbortSignal;
}

export class RAGResponse<T> {
  code: number;
  data: T;
  message: string;
  totalDatasets?: number;
  readonly success: boolean;
}

export class Dataset {
  id: string;
  name: string;
  description: string;
  embeddingModel: string;
  permission: string;
  chunkMethod: string;
  documentCount: number;
  chunkCount: number;
}

export class Document {
  id: string;
  name: string;
  datasetId: string;
  run: string;
  progress: number;
  progressMsg: string;
  status: string;
  chunkCount: number;
  tokenCount: number;
  readonly parsingStatus: string;
}

export class DocumentList {
  total: number;
  docs: Document[];
}

export class Chunk {
  id: string;
  content: string;
  datasetId: string;
  documentId: string;
  documentName: string;
  documentKeyword: string;
  importantKeywords: string[];
  questions: string[];
  tagKeywords: string[];
  similarity: number;
  vectorSimilarity: number;
  termSimilarity: number;
  available: boolean;
}

export class ChunkList {
  total: number;
  chunks: Chunk[];
}

export class DocumentAggregation {
  count: number;
  documentId: string;
  documentName: string;
}

export class RetrievalResult {
  total: number;
  chunks: Chunk[];
  documentAggregations: DocumentAggregation[];
}

export class Chat {
  id: string;
  name: string;
  datasetIds: string[];
  llmId: string;
}

export class ChatList {
  total: number;
  chats: Chat[];
}

export const ParsingStatus: Readonly<{
  UNSTART: "UNSTART";
  RUNNING: "RUNNING";
  CANCEL: "CANCEL";
  DONE: "DONE";
  FAIL: "FAIL";
  SCHEDULE: "SCHEDULE";
}>;

export class APIError extends Error {
  statusCode?: number;
  code?: number;
  message: string;
}

export class ParsingFailedError extends Error {
  document: Document;
}

export class ParsingTimeoutError extends Error {
  datasetId: string;
  documentId: string;
  timeoutMs: number;
  lastDocument?: Document;
}

export class DatasetsResource {
  create(payload: Record<string, unknown>): Promise<RAGResponse<Dataset>>;
  list(options?: Record<string, unknown>): Promise<RAGResponse<Dataset[]>>;
  get(datasetId: string): Promise<RAGResponse<Dataset>>;
  update(datasetId: string, payload: Record<string, unknown>): Promise<RAGResponse<unknown>>;
  delete(ids?: string[], options?: { deleteAll?: boolean }): Promise<RAGResponse<unknown>>;
}

export class DocumentsResource {
  upload(datasetId: string, files: UploadFile[], options?: { fields?: Record<string, string>; signal?: AbortSignal }): Promise<RAGResponse<Document[]>>;
  list(datasetId: string, options?: Record<string, unknown>): Promise<RAGResponse<DocumentList>>;
  update(datasetId: string, documentId: string, payload: Record<string, unknown>): Promise<RAGResponse<Document>>;
  delete(datasetId: string, ids?: string[], options?: { deleteAll?: boolean }): Promise<RAGResponse<unknown>>;
  parse(datasetId: string, documentIds: string[]): Promise<RAGResponse<unknown>>;
  stop(datasetId: string, documentIds: string[]): Promise<RAGResponse<unknown>>;
  download(datasetId: string, documentId: string, options?: { signal?: AbortSignal }): Promise<{ body: Uint8Array; headers: Record<string, string> }>;
  waitForParsing(datasetId: string, documentId: string, options?: WaitForParsingOptions): Promise<Document>;
}

export class ChunksResource {
  startParsing(datasetId: string, documentIds: string[]): Promise<RAGResponse<unknown>>;
  cancelParsing(datasetId: string, documentIds: string[]): Promise<RAGResponse<unknown>>;
  list(datasetId: string, documentId: string, options?: Record<string, unknown>): Promise<RAGResponse<ChunkList>>;
  get(datasetId: string, documentId: string, chunkId: string): Promise<RAGResponse<Chunk>>;
  create(datasetId: string, documentId: string, payload: Record<string, unknown>): Promise<RAGResponse<unknown>>;
  update(datasetId: string, documentId: string, chunkId: string, payload: Record<string, unknown>): Promise<RAGResponse<unknown>>;
  delete(datasetId: string, documentId: string, chunkIds?: string[], options?: { deleteAll?: boolean }): Promise<RAGResponse<unknown>>;
}

export class RetrievalResource {
  search(payload: Record<string, unknown>): Promise<RAGResponse<RetrievalResult>>;
}

export class ChatResource {
  create(payload: Record<string, unknown>): Promise<RAGResponse<Chat>>;
  list(options?: Record<string, unknown>): Promise<RAGResponse<ChatList>>;
  get(chatId: string): Promise<RAGResponse<Chat>>;
  update(chatId: string, payload: Record<string, unknown>): Promise<RAGResponse<unknown>>;
  delete(ids?: string[], options?: { deleteAll?: boolean }): Promise<RAGResponse<unknown>>;
  complete(payload: Record<string, unknown>): Promise<RAGResponse<unknown>>;
  stream(payload: Record<string, unknown>, onChunk: (chunk: string) => void, options?: { headers?: Record<string, string>; signal?: AbortSignal }): Promise<void>;
}

export class RawResource {
  request(method: string, path: string, options?: { query?: Record<string, unknown>; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal }): Promise<RAGResponse<unknown>>;
}

export class SeaRAGClient {
  constructor(options: ClientOptions);
  endpoint: string;
  apiKey?: string;
  headers?: Record<string, string>;
  datasets: DatasetsResource;
  documents: DocumentsResource;
  chunks: ChunksResource;
  retrieval: RetrievalResource;
  chat: ChatResource;
  raw: RawResource;
}

export { SeaRAGClient as Client };

export class SeaRAGTransport {
  constructor(endpoint: string, apiKey?: string, headers?: Record<string, string>, timeoutMs?: number);
  endpoint: string;
  apiKey?: string;
  headers: Record<string, string>;
  timeoutMs: number;
}

export function normalizeRAGEndpoint(endpoint: string): string;
export function normalizeParsingStatus(value: unknown): string;
