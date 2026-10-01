import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The monogram and the wordmark, carried inside the message.
 *
 * The stationery used to point at `https://thetriplejauto.com/brand/...`.
 * Gmail fetches remote pictures through its own proxy, hides them until
 * the reader trusts the sender, and the bare domain answers with a redirect
 * to www on top of that. The owner opened the welcome and saw a letter with
 * no mark on it.
 *
 * So the two pictures travel as inline parts of the message and the HTML
 * refers to them by content id. Every client draws an inline part without
 * asking; nothing is fetched. The files are email-sized copies of the
 * artwork (2x the drawn size), read from `public/brand` the way the 130-U
 * filler reads `public/forms`.
 */

export type InlineImage = {
  contentId: string;
  filename: string;
  contentType: "image/png";
  content: Buffer;
  inline: true;
};

const IMAGES = {
  "tj-monogram": "email-monogram.png",
  "tj-wordmark": "email-wordmark.png",
} as const;

export type BrandImageId = keyof typeof IMAGES;

/** The `src` an email template writes for one of the brand pictures. */
export function brandImageSrc(id: BrandImageId): string {
  return `cid:${id}`;
}

/** The inline parts an HTML body refers to, read from disk; none when it refers to none. */
export async function brandInlineImages(html: string): Promise<InlineImage[]> {
  const parts: InlineImage[] = [];
  for (const [id, filename] of Object.entries(IMAGES) as [BrandImageId, string][]) {
    if (!html.includes(`cid:${id}`)) continue;
    const content = await readFile(join(process.cwd(), "public", "brand", filename));
    parts.push({ contentId: id, filename, contentType: "image/png", content, inline: true });
  }
  return parts;
}
