// 日本市場シミュレーターのサーバー。
// 画面(public/)とデータ(data/)を配信し、Claude API への中継だけを行う。
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODEL, llmAvailable, describeError, makeBrief, reactAsPersonas, makeReport } from "./src/llm.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY = 40 * 1024 * 1024; // PDF添付を考慮して40MBまで

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("送信データが大きすぎます(上限40MB)。"), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function serveStatic(urlPath, res) {
  // public/ と data/ の中だけを配信する(それ以外のパスは拒否)
  const rel = urlPath === "/" ? "/index.html" : urlPath;
  const base = rel.startsWith("/data/") ? ROOT : path.join(ROOT, "public");
  const file = path.normalize(path.join(base, rel));
  const allowed = [path.join(ROOT, "public") + path.sep, path.join(ROOT, "data") + path.sep];
  if (!allowed.some((dir) => file.startsWith(dir))) return sendJson(res, 403, { error: "forbidden" });
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: "not found" });
  }
}

const API = {
  "/api/brief": (b) => makeBrief(b),
  "/api/react": (b) => reactAsPersonas(b),
  "/api/report": (b) => makeReport(b),
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (req.method === "GET" && url.pathname === "/api/status") {
      return sendJson(res, 200, { llm: llmAvailable(), model: MODEL });
    }
    if (req.method === "POST" && API[url.pathname]) {
      if (!llmAvailable()) {
        return sendJson(res, 503, { error: "APIキーが未設定です。ANTHROPIC_API_KEY を設定してサーバーを起動し直してください。" });
      }
      const body = await readBody(req);
      try {
        return sendJson(res, 200, { result: await API[url.pathname](body) });
      } catch (error) {
        const { status, message } = describeError(error);
        console.error(`[${url.pathname}]`, error?.message);
        return sendJson(res, status, { error: message });
      }
    }
    if (req.method === "GET") return serveStatic(decodeURIComponent(url.pathname), res);
    sendJson(res, 405, { error: "method not allowed" });
  } catch (error) {
    sendJson(res, error.status || 400, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`日本市場シミュレーター: http://localhost:${PORT}`);
  console.log(llmAvailable() ? `AIモード: 有効(${MODEL})` : "AIモード: 無効(ANTHROPIC_API_KEY 未設定。統計モードのみ動きます)");
});
