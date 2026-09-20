import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import puppeteer from "puppeteer";

export async function waitForImages(page) {
  const broken = await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) => image.decode().catch(() => {})),
    );
    return [...document.images]
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.src);
  });
  assert.deepEqual(
    broken,
    [],
    "Runtime images must load before capturing evidence",
  );
}

// QA-only host: mount the unchanged assembly component, never restore it to page.tsx.
export async function createCaptureContext(root) {
  const directory = mkdtempSync(join(tmpdir(), "looper-runtime-capture-"));
  let server;
  let browser;
  const cleanup = async () => {
    try {
      await browser?.close();
    } finally {
      if (server?.listening)
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      // Only the exact temporary directory created above may be removed.
      if (
        dirname(resolve(directory)) !== resolve(tmpdir()) ||
        !basename(directory).startsWith("looper-runtime-capture-")
      )
        throw new Error("Invalid capture temp directory");
      rmSync(directory, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
    }
  };
  try {
    const web = join(root, "apps/web");
    const require = createRequire(join(web, "package.json"));
    await build({
      absWorkingDir: root,
      stdin: {
        contents: `import { createRoot } from ${JSON.stringify(require.resolve("react-dom/client"))};
import { RuntimeAssemblyRenderer } from ${JSON.stringify(join(web, "app/runtime-assembly-renderer.tsx"))};
createRoot(document.getElementById("root")).render(<RuntimeAssemblyRenderer />);`,
        resolveDir: web,
        loader: "tsx",
      },
      bundle: true,
      jsx: "automatic",
      platform: "browser",
      outfile: join(directory, "capture.js"),
      define: { "process.env.NODE_ENV": '"production"' },
    });
    const css = ["globals.css", "mobile.css", "feedback.css"]
      .map((name) => readFileSync(join(web, "app", name), "utf8"))
      .join("\n");
    const html =
      '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Looper Assembly QA</title><link rel="stylesheet" href="/capture.css"><body><div id="root"></div><script src="/capture.js"></script></body></html>';
    server = createServer((request, response) => {
      try {
        const pathname = decodeURIComponent(
          new URL(request.url, "http://localhost").pathname,
        );
        if (pathname === "/") {
          response.setHeader("content-type", "text/html; charset=utf-8");
          response.end(html);
          return;
        }
        if (pathname === "/capture.css") {
          response.setHeader("content-type", "text/css");
          response.end(css);
          return;
        }
        if (pathname === "/favicon.ico") {
          response.writeHead(204).end();
          return;
        }
        const publicRoot = resolve(web, "public");
        const file =
          pathname === "/capture.js"
            ? join(directory, "capture.js")
            : resolve(publicRoot, "." + pathname);
        if (pathname !== "/capture.js" && !file.startsWith(publicRoot + sep)) {
          response.writeHead(403).end();
          return;
        }
        const mime = {
          ".js": "text/javascript",
          ".png": "image/png",
          ".svg": "image/svg+xml",
          ".woff2": "font/woff2",
          ".json": "application/json",
        };
        response.setHeader(
          "content-type",
          mime[extname(file)] ?? "application/octet-stream",
        );
        response.end(readFileSync(file));
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const executablePath = process.env.LOOPER_CAPTURE_BROWSER_EXECUTABLE;
    const requestedChannel = process.env.LOOPER_CAPTURE_BROWSER_CHANNEL;
    const managed = puppeteer.executablePath();
    // Puppeteer's channel resolution is platform-aware; there are no OS paths here.
    const browserChoice = executablePath
      ? { executablePath }
      : requestedChannel
        ? { channel: requestedChannel }
        : existsSync(managed)
          ? { executablePath: managed }
          : { channel: "chrome" };
    try {
      browser = await puppeteer.launch({
        ...browserChoice,
        headless: true,
        userDataDir: join(directory, "browser-profile"),
      });
    } catch (error) {
      throw new Error(
        "Browser unavailable. Run `pnpm exec puppeteer browsers install chrome`, or set LOOPER_CAPTURE_BROWSER_CHANNEL / LOOPER_CAPTURE_BROWSER_EXECUTABLE. " +
          error.message,
      );
    }
    return {
      browser,
      browserVersion: await browser.version(),
      fixtureUrl: `http://127.0.0.1:${server.address().port}`,
      directory,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
