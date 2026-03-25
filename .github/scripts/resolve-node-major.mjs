#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const NVMRC_PATH = path.join(ROOT_DIR, ".nvmrc");
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, "package.json");

function setGithubOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  fs.appendFileSync(outputPath, `${name}=${value}\n`, "utf8");
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function parseNodeMajorFromNvmrc(rawNvmrc) {
  const cleaned = rawNvmrc.trim();
  const match = cleaned.match(/^v?(\d+)(?:\.\d+\.\d+)?$/);

  if (!match) {
    throw new Error(
      `Invalid .nvmrc format: "${cleaned}". Expected major (e.g. "22") or exact version (e.g. "v22.0.0").`,
    );
  }

  return Number(match[1]);
}

function parseComparator(token) {
  const match = token.match(/^(>=|<=|>|<|=)?v?(\d+)(?:\.\d+\.\d+)?$/);
  if (match) {
    return {
      operator: match[1] ?? "=",
      major: Number(match[2]),
    };
  }

  const caretOrTilde = token.match(/^(\^|~)v?(\d+)(?:\.\d+\.\d+)?$/);
  if (caretOrTilde) {
    return {
      operator: "^",
      major: Number(caretOrTilde[2]),
    };
  }

  const wildcard = token.match(/^v?(\d+)(?:\.(?:x|\*))?$/i);
  if (wildcard) {
    return {
      operator: "=",
      major: Number(wildcard[1]),
    };
  }

  return null;
}

function compareMajor(major, comparator) {
  switch (comparator.operator) {
    case ">":
      return major > comparator.major;
    case ">=":
      return major >= comparator.major;
    case "<":
      return major < comparator.major;
    case "<=":
      return major <= comparator.major;
    case "=":
      return major === comparator.major;
    case "^":
      return major === comparator.major;
    default:
      return false;
  }
}

function isMajorCompatibleWithRange(major, range) {
  const normalizedRange = range.trim();
  if (!normalizedRange) {
    return false;
  }

  const orGroups = normalizedRange
    .split("||")
    .map((part) => part.trim())
    .filter(Boolean);

  if (orGroups.length === 0) {
    return false;
  }

  return orGroups.some((group) => {
    const tokens = group.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return false;
    }

    return tokens.every((token) => {
      const comparator = parseComparator(token);
      if (!comparator) {
        throw new Error(
          `Unsupported engines.node token "${token}" in range "${range}".`,
        );
      }

      return compareMajor(major, comparator);
    });
  });
}

function main() {
  const nvmrcRaw = fs.readFileSync(NVMRC_PATH, "utf8");
  const nodeMajor = parseNodeMajorFromNvmrc(nvmrcRaw);

  const packageJson = readJsonFile(PACKAGE_JSON_PATH);
  const enginesNode = packageJson?.engines?.node;
  if (typeof enginesNode !== "string" || enginesNode.trim() === "") {
    throw new Error(
      "package.json must define engines.node as non-empty string.",
    );
  }

  const compatible = isMajorCompatibleWithRange(nodeMajor, enginesNode);
  if (!compatible) {
    throw new Error(
      `.nvmrc Node major ${nodeMajor} is not compatible with engines.node "${enginesNode}".`,
    );
  }

  setGithubOutput("node_major", String(nodeMajor));
  setGithubOutput("nvmrc_raw", nvmrcRaw.trim());
  setGithubOutput("engines_node", enginesNode);
  setGithubOutput("compatible", "true");

  const payload = {
    nodeMajor,
    nvmrcRaw: nvmrcRaw.trim(),
    enginesNode,
    compatible: true,
  };

  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

main();
