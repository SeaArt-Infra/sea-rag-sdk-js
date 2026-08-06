import {
  ChatResource,
  ChunksResource,
  DatasetsResource,
  DocumentsResource,
  RawResource,
  RetrievalResource,
} from "./resources.js";
import { normalizeRAGEndpoint, SeaRAGTransport } from "./transport.js";

export class SeaRAGClient {
  constructor(options) {
    if (!options?.endpoint) {
      throw new TypeError("options.endpoint is required");
    }
    this.endpoint = normalizeRAGEndpoint(options.endpoint);
    this.apiKey = options.apiKey;
    this.headers = options.headers;
    this.transport = new SeaRAGTransport(
      this.endpoint,
      options.apiKey,
      options.headers,
      options.timeoutMs,
    );
    this.datasets = new DatasetsResource(this.transport);
    this.documents = new DocumentsResource(this.transport);
    this.chunks = new ChunksResource(this.transport);
    this.retrieval = new RetrievalResource(this.transport);
    this.chat = new ChatResource(this.transport);
    this.raw = new RawResource(this.transport);
  }
}

export const Client = SeaRAGClient;
