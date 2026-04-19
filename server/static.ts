import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // Use process.cwd() so the path is always relative to where the process
  // is started (project root), which is reliable on Railway and similar hosts.
  const distPath = path.join(process.cwd(), "dist", "public");

  if (!fs.existsSync(distPath)) {
    console.error(
      `[static] Could not find build directory: ${distPath}. ` +
      `The frontend may not be served. Run 'npm run build' first.`
    );
    // Register a fallback so any non-API route returns a useful message
    // instead of Express's default "Cannot GET /" 404.
    app.use("/{*path}", (req, res) => {
      if (!req.path.startsWith("/api")) {
        res.status(503).send(
          "<h1>Frontend not built</h1><p>Run <code>npm run build</code> and redeploy.</p>"
        );
      }
    });
    return;
  }

  app.use(express.static(distPath));

  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}
