import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

async function listVcConfigFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listVcConfigFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name === ".vc-config.json") {
      results.push(fullPath);
    }
  }

  return results;
}

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const vercelFunctionsDir = path.resolve(
    process.cwd(),
    ".vercel",
    "output",
    "functions",
  );

  if (!(await pathExists(vercelFunctionsDir))) {
    process.stdout.write(
      "No .vercel/output/functions directory found; skipping runtime patch.\n",
    );
    return;
  }

  const vcConfigFiles = await listVcConfigFiles(vercelFunctionsDir);
  let changedCount = 0;

  for (const filePath of vcConfigFiles) {
    const raw = await readFile(filePath, "utf8");
    const json = JSON.parse(raw);

    const next = { ...json, runtime: "nodejs20.x" };
    const nextRaw = `${JSON.stringify(next, null, 2)}\n`;

    if (nextRaw !== `${raw.replace(/\r\n/g, "\n")}`) {
      await writeFile(filePath, nextRaw, "utf8");
      changedCount += 1;
    }
  }

  process.stdout.write(
    `Patched ${changedCount} Vercel function runtime config file(s).\n`,
  );
}

await main();
