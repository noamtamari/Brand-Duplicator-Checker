import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getAsset, isSea } from "node:sea";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { createBrandReviewExports } from "./brand-review-exports.js";
import type { BrandReviewBatch } from "./brand-review-service.js";

const MAX_REQUEST_BYTES = 64 * 1024;

export interface BrandReviewServerOptions {
  rootDirectory: string;
  html: string | Buffer;
  batch: BrandReviewBatch;
  openBrowser?: (url: string) => void;
  onExportComplete?: (exportCreationMs: number) => void | Promise<void>;
}

function sendJson(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readRequestBody(request: import("node:http").IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new Error("Request is too large.");
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function safeTokenEqual(supplied: string | undefined, expected: string): boolean {
  if (supplied === undefined) {
    return false;
  }
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export function formatBrandReviewError(error: unknown): string {
  if (error && typeof error === "object") {
    const details = error as { code?: unknown; syscall?: unknown; path?: unknown };
    if (["EBUSY", "EPERM", "EACCES"].includes(String(details.code)) && details.syscall === "rename") {
      const fileName = typeof details.path === "string" ? path.basename(details.path) : "the CSV file";
      return `Windows could not replace ${fileName} because it may be open or locked. Close it in Excel or any other app, then try again.`;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

export async function startBrandReviewServer(options: BrandReviewServerOptions): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const html = options.html;
  const requestToken = randomBytes(32).toString("hex");
  let expectedHost: string | undefined;
  let closeServer: () => Promise<void>;
  const server = createServer(async (request, response) => {
    if (request.headers.host !== expectedHost) {
      sendJson(response, 403, { error: "Request host was not accepted." });
      return;
    }
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

    if (requestUrl.pathname === "/" && request.method === "GET") {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      });
      response.end(html);
      return;
    }

    if (requestUrl.pathname === "/api/results" && request.method === "GET") {
      sendJson(response, 200, {
        requestToken,
        items: options.batch.items.map(({ id, brand, outcome, candidates, selected }) => ({
          id,
          brand,
          outcome,
          candidates,
          selected,
        })),
      });
      return;
    }

    if (requestUrl.pathname === "/api/create" && request.method === "POST") {
      if (request.headers.origin !== `http://${request.headers.host}`) {
        sendJson(response, 403, { error: "Request origin was not accepted." });
        return;
      }

      let body: unknown;
      try {
        body = JSON.parse(await readRequestBody(request));
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : "Invalid request body." });
        return;
      }

      if (body === null || typeof body !== "object") {
        sendJson(response, 400, { error: "Invalid export request." });
        return;
      }
      const payload = body as { requestToken?: unknown; selectedIds?: unknown };
      if (!safeTokenEqual(typeof payload.requestToken === "string" ? payload.requestToken : undefined, requestToken)) {
        sendJson(response, 403, { error: "Review session expired. Reload the page and try again." });
        return;
      }
      if (!Array.isArray(payload.selectedIds) || !payload.selectedIds.every(Number.isSafeInteger)) {
        sendJson(response, 400, { error: "Selected row identifiers are invalid." });
        return;
      }

      const selectedIds = new Set(payload.selectedIds as number[]);
      const itemsById = new Map(options.batch.items.map((item) => [item.id, item]));
      if ([...selectedIds].some((id) => !itemsById.has(id))) {
        sendJson(response, 400, { error: "Selection contains an unknown row." });
        return;
      }

      try {
        const selectedItems = [...selectedIds]
          .sort((first, second) => first - second)
          .map((id) => itemsById.get(id)!)
          .map((item) => ({ brand: item.brand }));
        const exportStartedAt = performance.now();
        const result = await createBrandReviewExports(
          options.rootDirectory,
          options.batch.catalogue,
          selectedItems,
        );
        const exportCreationMs = performance.now() - exportStartedAt;
        response.once("finish", () => {
          void closeServer().then(() => options.onExportComplete?.(exportCreationMs));
        });
        sendJson(response, 200, {
          brandsFile: path.basename(result.brandsPath),
          relationsFile: path.basename(result.relationsPath),
          count: result.codes.length,
        });
      } catch (error) {
        sendJson(response, 400, { error: formatBrandReviewError(error) });
      }
      return;
    }

    sendJson(response, 404, { error: "Not found." });
  });

  let closePromise: Promise<void> | undefined;
  closeServer = () => {
    if (!closePromise) {
      closePromise = new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      server.closeIdleConnections();
    }
    return closePromise;
  };

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("Could not determine the local review server address.");
  }

  expectedHost = `127.0.0.1:${address.port}`;
  const url = `http://127.0.0.1:${address.port}/`;
  options.openBrowser?.(url);

  return {
    url,
    close: closeServer,
  };
}

export function defaultOpenBrowser(url: string): void {
  const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

export async function loadReviewHtml(sourceEntryPath: string): Promise<Buffer> {
  if (isSea()) {
    return Buffer.from(getAsset("brand-review.html"));
  }

  const candidates = [
    path.resolve(process.cwd(), "assets/brand-review.html"),
    path.resolve(path.dirname(sourceEntryPath), "assets/brand-review.html"),
    path.resolve(path.dirname(sourceEntryPath), "../assets/brand-review.html"),
    path.resolve(path.dirname(sourceEntryPath), "../../assets/brand-review.html"),
  ];
  const assetPath = candidates.find(existsSync);
  if (!assetPath) {
    throw new Error("Could not locate assets/brand-review.html beside the project.");
  }
  return readFile(assetPath);
}