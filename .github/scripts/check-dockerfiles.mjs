#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const DOCKERFILE_TARGETS = [
  { key: "api", filePath: "apps/api/Dockerfile" },
  { key: "web", filePath: "apps/web/Dockerfile" },
];

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function setGithubOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  await fs.appendFile(outputPath, `${name}=${value}\n`, "utf8");
}

async function main() {
  const results = await Promise.all(
    DOCKERFILE_TARGETS.map(async ({ key, filePath }) => {
      const absolutePath = path.join(ROOT_DIR, filePath);
      const exists = await fileExists(absolutePath);
      return { key, filePath, exists };
    }),
  );

  const byKey = Object.fromEntries(results.map((item) => [item.key, item]));
  const presentPaths = results
    .filter((item) => item.exists)
    .map((item) => item.filePath);

  await setGithubOutput("has_api_dockerfile", String(byKey.api.exists));
  await setGithubOutput("has_web_dockerfile", String(byKey.web.exists));
  await setGithubOutput(
    "has_any_dockerfile",
    String(byKey.api.exists || byKey.web.exists),
  );
  await setGithubOutput("dockerfile_count", String(presentPaths.length));
  await setGithubOutput("dockerfiles_csv", presentPaths.join(","));

  const payload = {
    hasApiDockerfile: byKey.api.exists,
    hasWebDockerfile: byKey.web.exists,
    hasAnyDockerfile: byKey.api.exists || byKey.web.exists,
    dockerfileCount: presentPaths.length,
    dockerfiles: presentPaths,
  };

  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

main();
