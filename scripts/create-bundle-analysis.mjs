import { gzipSync } from "node:zlib";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const projectRoot = process.cwd();
const publicDirectory = join(projectRoot, ".output", "public");
const assetsDirectory = join(publicDirectory, "assets");
const manifestPath = join(publicDirectory, ".vite", "manifest.json");
const outputPath = join(projectRoot, "artifacts", "bundle-analysis.json");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const manifestEntries = Object.entries(manifest);
const entryRecords = manifestEntries.filter(([, value]) => value.isEntry);

function collectImportedFiles(records) {
  const files = new Set();
  const pending = records.map(([key]) => key);

  while (pending.length > 0) {
    const key = pending.pop();
    const record = manifest[key];
    if (!record || files.has(record.file)) continue;
    files.add(record.file);
    pending.push(...(record.imports ?? []));
  }

  return files;
}

const initialFiles = collectImportedFiles(entryRecords);
const routeFiles = new Set(
  manifestEntries
    .filter(([key, value]) => {
      const source = value.src ?? key;
      return (
        value.isDynamicEntry &&
        /(^|\/)src\/routes\//.test(source) &&
        !source.endsWith("/__root.tsx")
      );
    })
    .map(([, value]) => value.file),
);

const assetNames = await readdir(assetsDirectory);
const assets = await Promise.all(
  assetNames.map(async (name) => {
    const path = join(assetsDirectory, name);
    const rawBytes = (await stat(path)).size;
    const gzipBytes = gzipSync(await readFile(path)).byteLength;
    const file = `assets/${name}`;
    return {
      file,
      rawBytes,
      gzipBytes,
      initial: initialFiles.has(file),
      asyncRoute: routeFiles.has(file),
    };
  }),
);

const report = {
  generatedAt: new Date().toISOString(),
  manifest: relative(projectRoot, manifestPath).replaceAll("\\", "/"),
  totals: {
    rawBytes: assets.reduce((total, asset) => total + asset.rawBytes, 0),
    gzipBytes: assets.reduce((total, asset) => total + asset.gzipBytes, 0),
    initialRawBytes: assets
      .filter((asset) => asset.initial && asset.file.endsWith(".js"))
      .reduce((total, asset) => total + asset.rawBytes, 0),
    initialGzipBytes: assets
      .filter((asset) => asset.initial && asset.file.endsWith(".js"))
      .reduce((total, asset) => total + asset.gzipBytes, 0),
  },
  assets: assets.sort((a, b) => b.rawBytes - a.rawBytes),
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${relative(projectRoot, outputPath)} with ${assets.length} assets.`,
);
