import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import sharp from "sharp";
import type { AamvaFields } from "@/lib/sales/aamva";
import { looksLikeLicenceFront, readLicenceFront } from "@/lib/sales/licence-front";

/**
 * Reading the front of a licence, on the server, offline.
 *
 * This runs where the photograph already is. The phone uploads to a route that
 * holds the bytes in memory anyway, so reading them there costs one pass over
 * an image that has already been paid for, rather than thirteen megabytes of
 * language data down somebody's mobile connection.
 *
 * ## Offline, and that is the point
 *
 * The language data is vendored at `public/tessdata`, the same way the barcode
 * decoder's wasm is vendored at `public/wasm`. Nothing about reading a customer's
 * identity document reaches a third party: no cloud vision API, no CDN fetch at
 * request time, no model hosted by somebody else. A driver licence is the single
 * most sensitive thing this product touches, and the cheapest way to keep a
 * promise about where it goes is for it to have nowhere else to go.
 *
 * ## What it costs
 *
 * Measured on a rendered Texas card at 2000px: roughly 600 to 750ms, and the
 * blurred and recompressed version read no worse than the clean one. That is
 * inside the time the phone already spends uploading, so the desk sees the
 * fields at the same moment it sees the photograph.
 */

/** Vendored beside the barcode decoder's wasm, and loaded the same way. */
const TESSDATA_PATH = join(process.cwd(), "public", "tessdata");

/**
 * Wide enough for the small print, and no wider.
 *
 * Under about 1500px the reader starts losing the eight point type that the
 * licence number is set in; past about 2400 it costs time and finds nothing.
 */
const RECOGNITION_WIDTH = 2000;

/** A licence that takes longer than this is one the operator should just type. */
const OCR_TIMEOUT_MS = 12_000;

/**
 * How long the worker gets to start before we give up on it.
 *
 * Starting was never bounded, and starting is what failed. Under the bundler
 * the worker resolved its own script to `/ROOT/node_modules/...`, which does
 * not exist, and `createWorker` sat there instead of rejecting. Measured: the
 * upload took 32 seconds and the photograph never reached the sale, because
 * the code that attaches it was queued behind a reader that could not start.
 */
const WORKER_START_MS = 8_000;

/**
 * Where the worker's own script actually is.
 *
 * Passed explicitly because the bundler rewrites the path tesseract computes
 * for itself: it resolved to `/ROOT/node_modules/...`, which exists nowhere,
 * and the worker died on startup every time.
 *
 * Chosen by which one is actually on disk rather than by preference, because
 * preference was wrong once already in each direction: the bundler's own
 * answer does not exist, and a deployment that relocates node_modules would
 * break the plain path. Whichever is really there is the right one.
 */
function workerScriptPath(): string {
  const parts = ["tesseract.js", "src", "worker-script", "node", "index.js"];
  const candidates = [join(process.cwd(), "node_modules", ...parts)];

  // Module resolution second, and only as a candidate. Asked first it hands
  // back the bundler's rewritten path, which is the broken one: the reader
  // stopped finding its worker again the moment this was preferred.
  try {
    candidates.push(createRequire(import.meta.url).resolve(parts.join("/")));
  } catch {
    // No resolver here. The path above is the answer.
  }

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

/**
 * Flatten a photograph into something a reader can work with.
 *
 * Greyscale removes the security tint that Texas prints under the text.
 * `normalise` stretches the contrast, which is what recovers a card
 * photographed in a badly lit office. `rotate()` with no argument applies the
 * EXIF orientation, without which a phone held sideways produces a sideways
 * card and nothing reads at all.
 */
async function prepare(image: Buffer): Promise<Buffer> {
  return sharp(image)
    .rotate()
    .resize({ width: RECOGNITION_WIDTH, withoutEnlargement: false })
    .greyscale()
    .normalise()
    .sharpen()
    .png()
    .toBuffer();
}

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("OCR timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Only the surface of a tesseract worker that this file touches. */
interface OcrWorker {
  recognize: (image: Buffer) => Promise<{ data: { text?: string } }>;
  terminate: () => Promise<unknown>;
}

/**
 * Read what the front of the card says.
 *
 * Returns null rather than throwing on every failure path, because this is a
 * fallback: a licence whose front will not read is not an error, it is a card
 * the operator types in, exactly as before this existed. Nothing upstream
 * should have to decide what to do about a reader that had a bad day.
 */
export async function readLicenceImage(image: Buffer): Promise<AamvaFields | null> {
  let worker: OcrWorker | null = null;

  try {
    const prepared = await prepare(image);

    // Imported here rather than at module scope so that the wasm and the
    // language data are only paid for on the requests that actually carry a
    // photograph, and so a route that merely imports this file stays cheap.
    const { createWorker } = await import("tesseract.js");
    worker = (await timeout(
      createWorker("eng", 1, {
        langPath: TESSDATA_PATH,
        gzip: true,
        cachePath: TESSDATA_PATH,
        // Explicit, because the bundler rewrites the path the worker would
        // otherwise compute for itself, to one that does not exist.
        workerPath: workerScriptPath(),
        // The default logger writes a progress line per frame to stdout.
        logger: () => {},
        errorHandler: () => {},
      }),
      WORKER_START_MS,
    )) as unknown as OcrWorker;

    if (!worker) return null;
    const { data } = await timeout(worker.recognize(prepared), OCR_TIMEOUT_MS);
    const text = data?.text ?? "";

    // A camera pointed at a loyalty card produces confident text too. Filling a
    // sale from one would be worse than reading nothing at all.
    if (!looksLikeLicenceFront(text)) return null;

    const fields = readLicenceFront(text);
    const found = Object.values(fields).filter((value) => value !== null).length;
    return found > 0 ? fields : null;
  } catch {
    return null;
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        // A worker that will not shut down cleanly must not turn a successful
        // read into a failed upload.
      }
    }
  }
}
