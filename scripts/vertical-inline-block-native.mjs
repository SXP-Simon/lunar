// Production ReaderSession probe, with the matching upstream primitive decoder.
// node vertical-inline-block-native.mjs LUNAR_OR_KERNEL_ROOT base|fixed BINARY [FONT]
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import readline from "node:readline";
import assert from "node:assert/strict";
import crypto from "node:crypto";
const [lunarArg, label, binary, fontArg] = process.argv
  .slice(2)
  .filter((arg) => arg !== "--kusamakura" && !arg.startsWith("--out="));
assert(["base", "fixed"].includes(label));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  lunar = path.resolve(lunarArg);
const kernel = fs.existsSync(path.join(lunar, "Cargo.toml"))
  ? lunar
  : path.join(lunar, "rito-rn/upstream/rito");
const decoder = path.join(
  kernel,
  "packages/rito-core-wasm/src/reader-session-primitive-decoder-runtime.js",
);
const { decodeRitoReaderPrimitiveList } = await import(pathToFileURL(decoder));
const linux = (p) =>
  "/mnt/" + p[0].toLowerCase() + p.slice(2).replaceAll("\\", "/");
const original = process.argv.includes("--kusamakura");
const sample = path.join(
  root,
  original
    ? "samples/kusamakura-vertical-only.epub"
    : "samples/vertical-inline-block-probe.epub",
);
const windows = process.platform === "win32";
const defaultFont = path.join(
  kernel,
  "apps/reader/src/assets/fonts/SourceHanSerifCN-Regular.otf",
);
const font = fontArg ?? (windows ? linux(defaultFont) : defaultFont);
const child = spawn(
  windows ? "wsl" : binary,
  windows
    ? ["-d", "Ubuntu-22.04", "--", binary, linux(sample), font]
    : [sample, font],
  { stdio: ["pipe", "pipe", "pipe"] },
);
let stderr = "";
child.stderr.on("data", (s) => (stderr += s.toString()));
const done = new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", resolve);
});
const lines = readline
  .createInterface({ input: child.stdout })
  [Symbol.asyncIterator]();
const results = [];
try {
  for (const chapter of original
    ? ["xhtml/表紙"]
    : ["horizontal", "vertical", "prefixed"]) {
    child.stdin.write(
      JSON.stringify({ action: "open", href: chapter + ".xhtml", size: 18 }) +
        "\n",
    );
    const next = await lines.next();
    assert(!next.done, stderr);
    const opened = JSON.parse(next.value);
    assert(!opened.error, opened.error);
    const display = decodeRitoReaderPrimitiveList(Uint8Array.from(opened.wire));
    const text = display.commands
      .filter((c) => c.kind === "text")
      .map((c) => c.text)
      .join("");
    const images = display.commands.filter((c) => c.kind === "draw-image");
    results.push({
      chapter,
      pageText: opened.text,
      paintedText: text,
      imageCount: images.length,
      images,
      commands: display.commands,
      hits: opened.hits,
      displaySha256: opened.displaySha256,
    });
    if (original) {
      assert.equal(images.length, label === "fixed" ? 1 : 0);
      if (label === "fixed") assert(images[0].src.endsWith("書デジ.png"));
    } else if (label === "fixed" || chapter === "horizontal") {
      assert(text.includes("盒内文字"));
      for (const s of ["一级", "二级", "末尾"]) assert(text.includes(s));
      assert.equal(images.length, 2);
    } else {
      assert(!text.includes("盒内文字"));
      assert.equal(images.length, 1);
    }
  }
} finally {
  child.stdin.end();
}
assert.equal(await done, 0, stderr);
const outputArg = process.argv.find((arg) => arg.startsWith("--out="));
const out = outputArg
  ? path.resolve(outputArg.slice("--out=".length))
  : path.join(root, "reports/kusamakura-image-pagination");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(
    out,
    "dev-" + label + (original ? "-kusamakura" : "") + "-native.json",
  ),
  JSON.stringify(
    {
      label,
      binary,
      font,
      sampleSha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(sample))
        .digest("hex"),
      decoderSha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(decoder))
        .digest("hex"),
      results,
    },
    null,
    2,
  ) + "\n",
);
fs.writeFileSync(
  path.join(
    out,
    "dev-" + label + (original ? "-kusamakura" : "") + "-stderr.log",
  ),
  stderr,
);
console.log(
  JSON.stringify(
    results.map(({ chapter, paintedText, imageCount }) => ({
      chapter,
      paintedText,
      imageCount,
    })),
  ),
);
