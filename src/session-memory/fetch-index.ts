import { createHash } from "node:crypto";
import type { LookupAddress } from "node:dns";
import { request as httpRequest } from "node:http";
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  RequestOptions as HttpRequestOptions,
} from "node:http";
import { request as httpsRequest } from "node:https";
import type { RequestOptions as HttpsRequestOptions } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

import {
  isInternalAddress,
  isInternalHost,
  normalizeHostname,
  resolveHostAddresses,
} from "./ip-guard.js";
import { SessionMemoryStore } from "./store.js";
import type { SessionMemoryChunk } from "./types.js";

export type FetchIndexErrorCode =
  | "invalid_url"
  | "blocked_host"
  | "http_error"
  | "invalid_json"
  | "empty_content"
  | "body_too_large"
  | "timed_out"
  | "aborted"
  | "fetch_failed"
  | "too_many_redirects";

export class FetchIndexError extends Error {
  readonly code: FetchIndexErrorCode;
  readonly status?: number;

  constructor(
    code: FetchIndexErrorCode,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "FetchIndexError";
    this.code = code;
    if (options.status !== undefined) this.status = options.status;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export interface FetchAndIndexOptions {
  url: string;
  store: SessionMemoryStore;
  source?: string;
  now?: number;
  timeoutMs?: number;
  maxBytes?: number;
  maxChunks?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_FETCH_BYTES = 256 * 1024;
const DEFAULT_MAX_CHUNKS = 100;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function blockedHostError(): FetchIndexError {
  return new FetchIndexError(
    "blocked_host",
    "url host is blocked because it is or resolves to an internal address",
  );
}

function normalizeUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new FetchIndexError("invalid_url", "url must be absolute http(s)", { cause: error });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new FetchIndexError("invalid_url", "url must be absolute http(s)");
  }
  if (parsed.username || parsed.password) {
    throw new FetchIndexError("invalid_url", "url must not contain credentials");
  }
  parsed.hash = "";
  return parsed.toString();
}

function htmlToMarkdown(html: string): string {
  let text = "";
  let cursor = 0;
  const lowerHtml = html.toLowerCase();

  while (cursor < html.length) {
    const char = html[cursor];
    if (char !== "<") {
      text += char;
      cursor += 1;
      continue;
    }

    const tagEnd = html.indexOf(">", cursor + 1);
    if (tagEnd === -1) {
      text += char;
      cursor += 1;
      continue;
    }

    const tagContent = html.slice(cursor + 1, tagEnd).trim();
    const closing = tagContent.startsWith("/");
    const tagName = parseHtmlTagName(closing ? tagContent.slice(1) : tagContent);

    if (!closing && (tagName === "script" || tagName === "style")) {
      cursor = findHtmlBlockEnd(lowerHtml, tagName, tagEnd + 1);
      continue;
    }

    text += markdownBoundaryForTag(tagName, closing);
    cursor = tagEnd + 1;
  }

  return decodeHtmlEntitiesOnce(text)
    .replace(/[ \t]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function parseHtmlTagName(tagContent: string): string {
  let name = "";
  for (const char of tagContent.trimStart()) {
    const lower = char.toLowerCase();
    if ((lower >= "a" && lower <= "z") || (lower >= "0" && lower <= "9")) {
      name += lower;
      continue;
    }
    break;
  }
  return name;
}

function findHtmlBlockEnd(
  lowerHtml: string,
  tagName: "script" | "style",
  fromIndex: number,
): number {
  const closeStart = lowerHtml.indexOf(`</${tagName}`, fromIndex);
  if (closeStart === -1) return lowerHtml.length;
  const closeEnd = lowerHtml.indexOf(">", closeStart);
  return closeEnd === -1 ? lowerHtml.length : closeEnd + 1;
}

function markdownBoundaryForTag(tagName: string, closing: boolean): string {
  const level = tagName[1];
  if (
    tagName.length === 2 &&
    tagName[0] === "h" &&
    level !== undefined &&
    level >= "1" &&
    level <= "6"
  ) {
    return closing ? "\n" : `\n${"#".repeat(Number(level))} `;
  }
  if (tagName === "li") return closing ? "\n" : "\n- ";
  if (tagName === "p") return closing ? "\n\n" : " ";
  if (tagName === "br") return "\n";
  return " ";
}

function decodeHtmlEntitiesOnce(text: string): string {
  return text.replace(/&(nbsp|amp|lt|gt|quot|#39);/gu, (entity) => {
    switch (entity) {
      case "&nbsp;":
        return " ";
      case "&amp;":
        return "&";
      case "&lt;":
        return "<";
      case "&gt;":
        return ">";
      case "&quot;":
        return '"';
      case "&#39;":
        return "'";
      default:
        return entity;
    }
  });
}

function toIndexableText(body: string, contentType: string): string {
  if (contentType.includes("text/html")) return htmlToMarkdown(body);
  if (contentType.includes("application/json")) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch (error) {
      throw new FetchIndexError("invalid_json", "response body is not valid JSON", {
        cause: error,
      });
    }
  }
  return body.trim();
}

function chunkText(text: string, source: string, maxChunks: number): SessionMemoryChunk[] {
  const paragraphs = text
    .split(/\n{2,}/u)
    .map((part) => part.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return [];
  return paragraphs.slice(0, maxChunks).map((part, index) => ({
    id: createHash("sha256").update(`${source}\n${index}\n${part}`).digest("hex").slice(0, 24),
    source,
    text: part,
    metadata: { url: source, index },
  }));
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.trunc(value);
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

type FetchAccessOptions = {
  signal: AbortSignal;
  timeoutMs: number;
  allowedHosts?: readonly string[];
};

function normalizedAllowedHosts(hosts: readonly string[] | undefined): Set<string> {
  const normalized = new Set<string>();
  for (const host of hosts ?? []) {
    const value = normalizeHostname(host).replace(/\.$/u, "");
    if (value.length > 0) normalized.add(value);
  }
  return normalized;
}

function isAllowedFetchHost(url: URL, options: Pick<FetchAccessOptions, "allowedHosts">): boolean {
  if (!options.allowedHosts || options.allowedHosts.length === 0) return false;
  return normalizedAllowedHosts(options.allowedHosts).has(
    normalizeHostname(url.hostname).replace(/\.$/u, ""),
  );
}

async function resolveFetchAddress(url: URL, options: FetchAccessOptions): Promise<LookupAddress> {
  const allowed = isAllowedFetchHost(url, options);
  if (
    !allowed &&
    (await isInternalHost(url.hostname, { signal: options.signal, timeoutMs: options.timeoutMs }))
  ) {
    throw blockedHostError();
  }

  let addresses: LookupAddress[];
  try {
    addresses = await resolveHostAddresses(url.hostname, {
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
  } catch (error) {
    throw new FetchIndexError("blocked_host", "url host could not be safely resolved", {
      cause: error,
    });
  }

  if (addresses.length === 0) {
    throw new FetchIndexError("blocked_host", "url host did not resolve to any address");
  }
  if (!allowed && addresses.some((entry) => isInternalAddress(entry.address))) {
    throw blockedHostError();
  }
  const firstAddress = addresses[0];
  if (!firstAddress) {
    throw new FetchIndexError("blocked_host", "url host did not resolve to any address");
  }
  return firstAddress;
}

function responseHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) result.append(name, item);
    } else if (value !== undefined) {
      result.set(name, String(value));
    }
  }
  return result;
}

function hostHeader(url: URL): string {
  const normalized = normalizeHostname(url.hostname);
  const host =
    normalized.includes(":") && !normalized.startsWith("[") ? `[${normalized}]` : normalized;
  return url.port ? `${host}:${url.port}` : host;
}

function responseFromIncomingMessage(message: IncomingMessage): Response {
  const body = Readable.toWeb(message) as ReadableStream<Uint8Array>;
  return new Response(body, {
    status: message.statusCode ?? 599,
    statusText: message.statusMessage,
    headers: responseHeaders(message.headers),
  });
}

async function nativeFetchResolved(
  url: URL,
  address: LookupAddress,
  signal: AbortSignal,
): Promise<Response> {
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  const isHttps = url.protocol === "https:";
  const hostname = normalizeHostname(url.hostname);
  const requestOptions: HttpRequestOptions & HttpsRequestOptions = {
    protocol: url.protocol,
    host: address.address,
    family: address.family,
    port: url.port ? Number.parseInt(url.port, 10) : isHttps ? 443 : 80,
    method: "GET",
    path: `${url.pathname}${url.search}`,
    headers: {
      host: hostHeader(url),
      "user-agent": "webpresso-agent-kit/session-fetch-index",
      accept: "text/html,application/json,text/plain;q=0.9,*/*;q=0.8",
    },
    signal,
  };
  if (isHttps && isIP(hostname) === 0) requestOptions.servername = hostname;

  return await new Promise<Response>((resolve, reject) => {
    const req = request(requestOptions, (message) => resolve(responseFromIncomingMessage(message)));
    req.on("error", reject);
    req.end();
  });
}

function redirectLocation(response: Response, currentUrl: URL): URL | undefined {
  if (!REDIRECT_STATUSES.has(response.status)) return undefined;
  const location = response.headers.get("location");
  if (!location) return undefined;
  try {
    return new URL(location, currentUrl);
  } catch (error) {
    throw new FetchIndexError("invalid_url", "redirect location must be a valid http(s) URL", {
      cause: error,
    });
  }
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Best-effort socket/stream cleanup; preserve the primary fetch error.
  }
}

async function safeFetch(
  normalizedUrl: string,
  options: FetchAccessOptions & {
    fetchImpl?: typeof fetch;
  },
): Promise<Response> {
  let currentUrl = new URL(normalizedUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
      throw new FetchIndexError("invalid_url", "redirect location must be absolute http(s)");
    }

    const address = await resolveFetchAddress(currentUrl, options);
    const fetchImpl = options.fetchImpl;
    const response = fetchImpl
      ? await fetchImpl(currentUrl.toString(), {
          signal: options.signal,
          redirect: "manual",
        })
      : await nativeFetchResolved(currentUrl, address, options.signal);

    let nextUrl: URL | undefined;
    try {
      nextUrl = redirectLocation(response, currentUrl);
    } catch (error) {
      await cancelResponseBody(response);
      throw error;
    }
    if (!nextUrl) return response;
    await cancelResponseBody(response);
    if (redirectCount === MAX_REDIRECTS) {
      throw new FetchIndexError("too_many_redirects", "fetch exceeded the redirect limit");
    }
    currentUrl = nextUrl;
  }
  throw new FetchIndexError("too_many_redirects", "fetch exceeded the redirect limit");
}

async function readResponseText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength) {
    const parsed = Number.parseInt(declaredLength, 10);
    if (Number.isFinite(parsed) && parsed > maxBytes) {
      await cancelResponseBody(response);
      throw new FetchIndexError("body_too_large", `response body exceeds ${maxBytes} bytes`);
    }
  }

  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new FetchIndexError("body_too_large", `response body exceeds ${maxBytes} bytes`);
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new FetchIndexError("body_too_large", `response body exceeds ${maxBytes} bytes`);
      }
      chunks.push(decoder.decode(next.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
}

function wireAbortSignals(
  controller: AbortController,
  signal: AbortSignal | undefined,
): () => void {
  if (!signal) return () => {};
  if (signal.aborted) controller.abort(signal.reason);
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  return () => signal.removeEventListener("abort", abort);
}

export async function fetchAndIndex(
  options: FetchAndIndexOptions,
  deps: {
    readonly fetchImpl?: typeof fetch;
    /** Internal/test-only escape hatch for loopback fixtures; never exposed in CLI/MCP input. */
    readonly allowedHosts?: readonly string[];
  } = {},
): Promise<SessionMemoryChunk[]> {
  const normalized = normalizeUrl(options.url);
  const maxBytes = normalizePositiveInt(options.maxBytes, DEFAULT_MAX_FETCH_BYTES);
  const maxChunks = normalizePositiveInt(options.maxChunks, DEFAULT_MAX_CHUNKS);
  const timeoutMs = normalizePositiveInt(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  let timedOut = false;
  const unwire = wireAbortSignals(controller, options.signal);
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await safeFetch(normalized, {
      fetchImpl: deps.fetchImpl,
      allowedHosts: deps.allowedHosts,
      signal: controller.signal,
      timeoutMs,
    });
    if (!response.ok) {
      await cancelResponseBody(response);
      throw new FetchIndexError("http_error", `fetch failed with HTTP ${response.status}`, {
        status: response.status,
      });
    }
    const body = await readResponseText(response, maxBytes);
    const text = toIndexableText(body, response.headers.get("content-type") ?? "text/plain");
    if (!text.trim()) return [];
    const source = options.source ?? normalized;
    const chunks = chunkText(text, source, maxChunks);
    if (chunks.length === 0) return [];
    options.store.indexChunks(chunks);
    return chunks;
  } catch (error) {
    if (error instanceof FetchIndexError) throw error;
    if (timedOut) throw new FetchIndexError("timed_out", "fetch timed out", { cause: error });
    if (isAbortError(error) || options.signal?.aborted) {
      throw new FetchIndexError("aborted", "fetch aborted", { cause: error });
    }
    throw new FetchIndexError("fetch_failed", "fetch failed", { cause: error });
  } finally {
    clearTimeout(timeout);
    unwire();
  }
}
