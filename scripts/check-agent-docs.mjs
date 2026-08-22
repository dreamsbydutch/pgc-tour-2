import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function toPosix(path) {
  return path.split(sep).join("/");
}

function repoPath(path) {
  return toPosix(relative(repositoryRoot, path));
}

function walkFiles(path, predicate) {
  if (!existsSync(path)) return [];
  const files = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const entryPath = resolve(path, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(entryPath, predicate));
    else if (entry.isFile() && predicate(entryPath)) files.push(entryPath);
  }
  return files;
}

function fail(path, message) {
  failures.push(`${repoPath(path)}: ${message}`);
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function topLevelScalar(source, key) {
  const match = source.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match ? { raw: match[1].trim(), value: unquote(match[1]) } : undefined;
}

function nestedScalar(source, parent, key) {
  const lines = source.split(/\r?\n/u);
  const parentIndex = lines.findIndex((line) =>
    new RegExp(`^${parent}:\\s*$`, "u").test(line),
  );
  if (parentIndex < 0) return undefined;

  for (let index = parentIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (!line.startsWith(" ")) break;
    const match = line.match(new RegExp(`^  ${key}:\\s*(.+)$`, "u"));
    if (match) {
      return { raw: match[1].trim(), value: unquote(match[1]) };
    }
  }
  return undefined;
}

function markdownTargets(source) {
  const targets = [];
  const pattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of source.matchAll(pattern)) {
    let target = match[1].trim();
    if (target.startsWith("<")) {
      const end = target.indexOf(">");
      if (end >= 0) target = target.slice(1, end);
    } else {
      target = target.split(/\s+["']/u, 1)[0];
    }
    targets.push(target);
  }
  for (const match of source.matchAll(/^\s{0,3}\[[^\]]+\]:\s*(\S+)/gmu)) {
    targets.push(match[1].replace(/^<|>$/gu, ""));
  }
  for (const match of source.matchAll(/\b(?:href|src)=["']([^"']+)["']/giu)) {
    targets.push(match[1]);
  }
  return targets;
}

function stripHtmlTags(value) {
  let result = "";
  let insideTag = false;
  for (const character of value) {
    if (!insideTag && character === "<") {
      insideTag = true;
    } else if (insideTag && character === ">") {
      insideTag = false;
    } else if (!insideTag) {
      result += character;
    }
  }
  return result;
}

function markdownAnchors(source) {
  const anchors = new Set();
  const duplicates = new Map();
  const headingPattern = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gmu;
  for (const match of source.matchAll(headingPattern)) {
    const label = stripHtmlTags(match[1])
      .replace(/!?\[([^\]]+)\]\([^)]+\)/gu, "$1")
      .replace(/[`*_~]/gu, "")
      .trim()
      .toLowerCase();
    const base = label
      .replace(/[^\p{Letter}\p{Number}\s_-]/gu, "")
      .replace(/\s+/gu, "-");
    if (!base) continue;
    const duplicateCount = duplicates.get(base) ?? 0;
    anchors.add(duplicateCount === 0 ? base : `${base}-${duplicateCount}`);
    duplicates.set(base, duplicateCount + 1);
  }
  for (const match of source.matchAll(/\b(?:id|name)=["']([^"']+)["']/giu)) {
    anchors.add(match[1]);
  }
  return anchors;
}

function tableCells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return undefined;
  const cells = [];
  let current = "";
  for (let index = 1; index < trimmed.length - 1; index += 1) {
    const character = trimmed[index];
    if (character === "|" && trimmed[index - 1] !== "\\") {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

function validateMarkdownTables(path, source) {
  const lines = source.split(/\r?\n/u);
  let fence;
  for (let index = 0; index < lines.length; index += 1) {
    const fenceMatch = lines[index].match(/^\s*(```+|~~~+)/u);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fence === fenceMatch[1][0]) fence = undefined;
      continue;
    }
    if (fence || index === 0) continue;
    const dividerCells = tableCells(lines[index]);
    if (
      !dividerCells ||
      !dividerCells.every((cell) => /^:?-{3,}:?$/u.test(cell))
    ) {
      continue;
    }
    const headerCells = tableCells(lines[index - 1]);
    if (!headerCells || headerCells.length !== dividerCells.length) {
      fail(path, `has a malformed Markdown table near line ${index + 1}`);
      continue;
    }
    for (let row = index + 1; row < lines.length; row += 1) {
      if (!lines[row].trim().startsWith("|")) break;
      const cells = tableCells(lines[row]);
      if (!cells || cells.length !== headerCells.length) {
        fail(path, `has a malformed Markdown table row at line ${row + 1}`);
      }
    }
  }
}

function repositoryCodeTargets(source) {
  const targets = [];
  const pattern =
    /`((?:src|convex|docs|scripts|public|email-templates|\.agents|\.github)\/[A-Za-z0-9_./-]+)`/g;
  for (const match of source.matchAll(pattern)) targets.push(match[1]);
  return targets;
}

function localTarget(sourcePath, target) {
  if (!target || /^[a-z][a-z0-9+.-]*:/iu.test(target)) {
    return undefined;
  }
  const withoutFragment = target.split("#", 1)[0].split("?", 1)[0];
  if (!withoutFragment) return sourcePath;
  try {
    return resolve(dirname(sourcePath), decodeURIComponent(withoutFragment));
  } catch {
    fail(sourcePath, `has an invalid encoded link target: ${target}`);
    return undefined;
  }
}

function localFragment(sourcePath, target) {
  if (/^[a-z][a-z0-9+.-]*:/iu.test(target)) return undefined;
  const hashIndex = target.indexOf("#");
  if (hashIndex < 0) return undefined;
  try {
    return decodeURIComponent(target.slice(hashIndex + 1));
  } catch {
    fail(sourcePath, `has an invalid encoded link fragment: ${target}`);
    return undefined;
  }
}

const markdownFiles = [
  resolve(repositoryRoot, "AGENTS.md"),
  resolve(repositoryRoot, "CLAUDE.md"),
  resolve(repositoryRoot, "README.md"),
  ...walkFiles(
    resolve(repositoryRoot, "docs"),
    (path) => extname(path) === ".md",
  ),
  ...walkFiles(
    resolve(repositoryRoot, ".agents", "skills"),
    (path) => extname(path) === ".md",
  ),
  ...walkFiles(
    resolve(repositoryRoot, ".github"),
    (path) => extname(path) === ".md",
  ),
];
const anchorCache = new Map();

for (const markdownPath of markdownFiles) {
  if (!existsSync(markdownPath)) {
    fail(markdownPath, "is required but missing");
    continue;
  }
  const source = readFileSync(markdownPath, "utf8");
  validateMarkdownTables(markdownPath, source);
  for (const target of markdownTargets(source)) {
    const resolvedTarget = localTarget(markdownPath, target);
    if (resolvedTarget && !existsSync(resolvedTarget)) {
      fail(markdownPath, `links to missing path ${target}`);
      continue;
    }
    const fragment = localFragment(markdownPath, target);
    if (
      resolvedTarget &&
      fragment &&
      extname(resolvedTarget).toLowerCase() === ".md"
    ) {
      if (!anchorCache.has(resolvedTarget)) {
        anchorCache.set(
          resolvedTarget,
          markdownAnchors(readFileSync(resolvedTarget, "utf8")),
        );
      }
      if (!anchorCache.get(resolvedTarget).has(fragment)) {
        fail(markdownPath, `links to missing anchor #${fragment} in ${target}`);
      }
    }
  }
  for (const target of repositoryCodeTargets(source)) {
    const resolvedTarget = resolve(repositoryRoot, target);
    if (!existsSync(resolvedTarget)) {
      fail(markdownPath, `names missing repository path ${target}`);
    }
  }
}

const claudePath = resolve(repositoryRoot, "CLAUDE.md");
if (
  existsSync(claudePath) &&
  readFileSync(claudePath, "utf8").trim() !== "@AGENTS.md"
) {
  fail(claudePath, "must contain only @AGENTS.md");
}

const docsRoot = resolve(repositoryRoot, "docs");
const docsIndexPath = resolve(docsRoot, "README.md");
if (existsSync(docsIndexPath)) {
  const indexSource = readFileSync(docsIndexPath, "utf8");
  const indexedDocs = new Set(
    markdownTargets(indexSource)
      .map((target) => localTarget(docsIndexPath, target))
      .filter((target) => target && extname(target) === ".md")
      .map((target) => resolve(target)),
  );
  for (const docsPath of walkFiles(
    docsRoot,
    (path) => extname(path) === ".md",
  )) {
    if (docsPath !== docsIndexPath && !indexedDocs.has(resolve(docsPath))) {
      fail(docsPath, "is not linked from docs/README.md");
    }
  }
}

const skillsRoot = resolve(repositoryRoot, ".agents", "skills");
for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const skillDirectory = resolve(skillsRoot, entry.name);
  const skillPath = resolve(skillDirectory, "SKILL.md");
  const entries = readdirSync(skillDirectory);
  if (!existsSync(skillPath)) {
    if (entries.length > 0)
      fail(skillDirectory, "contains files but has no SKILL.md");
    continue;
  }

  const source = readFileSync(skillPath, "utf8");
  const frontmatterMatch = source.match(
    /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u,
  );
  if (!frontmatterMatch) {
    fail(skillPath, "must start with YAML frontmatter");
    continue;
  }
  const frontmatter = frontmatterMatch[1];
  const name = topLevelScalar(frontmatter, "name")?.value;
  const description = topLevelScalar(frontmatter, "description")?.value;
  const shortDescription = nestedScalar(
    frontmatter,
    "metadata",
    "short-description",
  )?.value;

  if (name !== entry.name) {
    fail(skillPath, `frontmatter name must match folder ${entry.name}`);
  }
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name) || name.length > 63) {
    fail(
      skillPath,
      "name must be lowercase hyphen-case and at most 63 characters",
    );
  }
  if (!description || description.length < 80 || description.length > 500) {
    fail(
      skillPath,
      "description must be a discriminating 80-500 character trigger",
    );
  }
  if (
    !shortDescription ||
    shortDescription.length < 25 ||
    shortDescription.length > 64
  ) {
    fail(skillPath, "metadata.short-description must be 25-64 characters");
  }

  const openAiPath = resolve(skillDirectory, "agents", "openai.yaml");
  if (!existsSync(openAiPath)) {
    fail(skillPath, "requires agents/openai.yaml metadata");
    continue;
  }
  const openAi = readFileSync(openAiPath, "utf8");
  const displayNameRecord = nestedScalar(openAi, "interface", "display_name");
  const uiShortDescriptionRecord = nestedScalar(
    openAi,
    "interface",
    "short_description",
  );
  const defaultPromptRecord = nestedScalar(
    openAi,
    "interface",
    "default_prompt",
  );
  const displayName = displayNameRecord?.value;
  const uiShortDescription = uiShortDescriptionRecord?.value;
  const defaultPrompt = defaultPromptRecord?.value;
  if (!displayName) fail(openAiPath, "requires interface.display_name");
  if (
    !uiShortDescription ||
    uiShortDescription.length < 25 ||
    uiShortDescription.length > 64
  ) {
    fail(openAiPath, "interface.short_description must be 25-64 characters");
  }
  if (!defaultPrompt || !defaultPrompt.includes(`$${entry.name}`)) {
    fail(openAiPath, `default_prompt must explicitly mention $${entry.name}`);
  }
  for (const record of [
    displayNameRecord,
    uiShortDescriptionRecord,
    defaultPromptRecord,
  ]) {
    if (record && !/^"(?:[^"\\]|\\.)*"$/u.test(record.raw)) {
      fail(openAiPath, "interface string values must use double quotes");
      break;
    }
  }
  const implicitInvocation = nestedScalar(
    openAi,
    "policy",
    "allow_implicit_invocation",
  );
  if (
    implicitInvocation &&
    implicitInvocation.raw !== "true" &&
    implicitInvocation.raw !== "false"
  ) {
    fail(
      openAiPath,
      "policy.allow_implicit_invocation must be an unquoted boolean when present",
    );
  }
}

const skillNames = new Set(
  readdirSync(skillsRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(resolve(skillsRoot, entry.name, "SKILL.md")),
    )
    .map((entry) => entry.name),
);
for (const markdownPath of markdownFiles) {
  if (!existsSync(markdownPath)) continue;
  const source = readFileSync(markdownPath, "utf8");
  for (const match of source.matchAll(/\$([a-z0-9]+(?:-[a-z0-9]+)+)/gu)) {
    if (!skillNames.has(match[1])) {
      fail(markdownPath, `references unknown project skill $${match[1]}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Agent documentation checks failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  const docsCount = markdownFiles.filter((path) =>
    path.startsWith(docsRoot),
  ).length;
  const skillCount = skillNames.size;
  console.log(
    `Agent documentation checks passed (${docsCount} wiki pages, ${skillCount} skills).`,
  );
}
