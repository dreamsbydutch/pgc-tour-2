import { gzipSync } from "node:zlib";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const publicDirectory = join(process.cwd(), ".output", "public");
const assetsDirectory = join(publicDirectory, "assets");
const manifestPath = join(publicDirectory, ".vite", "manifest.json");
const maximumMainBundleBytes = 537_000;
const maximumInitialGzipBytes = 165 * 1024;
const maximumAsyncRouteBytes = 60 * 1024;
const exceptions = JSON.parse(
  await readFile(
    new URL("./bundle-budget-exceptions.json", import.meta.url),
    "utf8",
  ),
);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const manifestEntries = Object.entries(manifest);
const entryRecords = manifestEntries.filter(([, value]) => value.isEntry);

if (entryRecords.length === 0) {
  throw new Error("No client entry bundle was recorded in the Vite manifest");
}

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

async function measure(file) {
  const absolutePath = join(publicDirectory, file);
  const contents = await readFile(absolutePath);
  return {
    file,
    rawBytes: (await stat(absolutePath)).size,
    gzipBytes: gzipSync(contents).byteLength,
  };
}

const entryBundles = await Promise.all(
  entryRecords.map(([, value]) => measure(value.file)),
);
const mainBundle = entryBundles.sort((a, b) => b.rawBytes - a.rawBytes)[0];
if (mainBundle.rawBytes > maximumMainBundleBytes) {
  throw new Error(
    `${mainBundle.file} is ${mainBundle.rawBytes} bytes raw; main budget is ${maximumMainBundleBytes} bytes`,
  );
}

const initialFiles = [...collectImportedFiles(entryRecords)].filter((file) =>
  file.endsWith(".js"),
);
const initialBundles = await Promise.all(initialFiles.map(measure));
const initialGzipBytes = initialBundles.reduce(
  (total, bundle) => total + bundle.gzipBytes,
  0,
);
if (initialGzipBytes > maximumInitialGzipBytes) {
  throw new Error(
    `Initial JavaScript is ${initialGzipBytes} bytes gzip; budget is ${maximumInitialGzipBytes} bytes`,
  );
}

const initialFileSet = new Set(initialFiles);
const initialPostHogChunk = manifestEntries.find(([key, value]) => {
  const source = value.src ?? key;
  return (
    /(^|\/)posthog-js(\/|$)/.test(source) && initialFileSet.has(value.file)
  );
});
if (initialPostHogChunk) {
  throw new Error(
    `PostHog leaked into initial chunk ${initialPostHogChunk[1].file}`,
  );
}

const asyncRoutes = manifestEntries.filter(([key, value]) => {
  const source = value.src ?? key;
  return (
    value.isDynamicEntry &&
    /(^|\/)src\/routes\//.test(source) &&
    !source.endsWith("/__root.tsx")
  );
});
for (const [key, value] of asyncRoutes) {
  const bundle = await measure(value.file);
  const exception =
    exceptions.asyncRouteChunks[key] ?? exceptions.asyncRouteChunks[value.file];
  const limit = exception?.maximumBytes ?? maximumAsyncRouteBytes;
  if (bundle.rawBytes > limit) {
    throw new Error(
      `${bundle.file} is ${bundle.rawBytes} bytes raw; async route budget is ${limit} bytes`,
    );
  }
  if (exception && !exception.reason?.trim()) {
    throw new Error(`Bundle exception for ${key} must include a review reason`);
  }
}

console.log(
  [
    `${mainBundle.file}: ${mainBundle.rawBytes} / ${maximumMainBundleBytes} bytes raw`,
    `Initial JavaScript: ${initialGzipBytes} / ${maximumInitialGzipBytes} bytes gzip`,
    `${asyncRoutes.length} async route chunks are within ${maximumAsyncRouteBytes} bytes raw`,
    "PostHog is excluded from the initial entry graph",
  ].join("\n"),
);
