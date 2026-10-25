/** Local-only static server for the actual Expo Web export. Never binds publicly. */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(process.env.KB_QA_DIST ?? fileURLToPath(new URL("../dist/", import.meta.url)));
const port = Number(process.env.KB_QA_PORT ?? 8097);
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ttf": "font/ttf" };
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    let file = resolve(root, "." + pathname);
    if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    if (!extname(file)) {
      const options = [file + ".html", resolve(file, "index.html"), resolve(root, "index.html")];
      file = await (async () => { for (const candidate of options) { try { if ((await stat(candidate)).isFile()) return candidate; } catch {} } throw Error("not found"); })();
    }
    const bytes = await readFile(file);
    response.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" }).end(bytes);
  } catch { response.writeHead(404).end("Not found"); }
}).listen(port, "127.0.0.1", () => console.log(`KNOWLEDGE_BOOK_QA http://127.0.0.1:${port}/knowledge-book-qa`));
