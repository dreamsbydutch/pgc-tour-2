import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const assetsDirectory = join(process.cwd(), ".output", "public", "assets");
const maximumMainBundleBytes = 537_000;
const files = await readdir(assetsDirectory);
const javascriptBundles = files.filter((file) => file.endsWith(".js"));

if (javascriptBundles.length === 0) {
  throw new Error("No client JavaScript bundles were produced");
}

const bundleSizes = await Promise.all(
  javascriptBundles.map(async (file) => ({
    file,
    size: (await stat(join(assetsDirectory, file))).size,
  })),
);
const mainBundle = bundleSizes.sort((a, b) => b.size - a.size)[0];
if (mainBundle.size > maximumMainBundleBytes) {
  throw new Error(
    `${mainBundle.file} is ${mainBundle.size} bytes; budget is ${maximumMainBundleBytes} bytes`,
  );
}

console.log(
  `${mainBundle.file} is ${mainBundle.size} bytes (budget ${maximumMainBundleBytes})`,
);
