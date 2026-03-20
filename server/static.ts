import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // Use process.cwd() so the path is always relative to where the process
  // is started (project root), which is reliable on Railway and similar hosts.
  const distPath = path.join(process.cwd(), "dist", "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}. Run the build first.`,
    );
  }

  app.use(express.static(distPath));

  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}
