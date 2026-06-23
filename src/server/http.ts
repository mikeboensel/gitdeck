import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

function send(
  res: ServerResponse,
  status: number,
  body: string | Buffer,
  contentType: string,
): void {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf-8");
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": buffer.byteLength,
    "Cache-Control": "no-store",
  });
  res.end(buffer);
}

function sendJson(res: ServerResponse, status: number, obj: unknown): void {
  send(res, status, JSON.stringify(obj), "application/json; charset=utf-8");
}

export function sendJsonCacheable(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  obj: unknown,
): void {
  if (status !== 200) {
    sendJson(res, status, obj);
    return;
  }
  const body = JSON.stringify(obj);
  const etag = `W/"${createHash("sha1").update(body).digest("base64url")}"`;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { ETag: etag, "Cache-Control": "no-store" });
    res.end();
    return;
  }
  const buffer = Buffer.from(body, "utf-8");
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": buffer.byteLength,
    "Cache-Control": "no-store",
    ETag: etag,
  });
  res.end(buffer);
}
