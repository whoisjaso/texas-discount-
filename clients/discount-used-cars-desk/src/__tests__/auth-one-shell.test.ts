import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatPhone, phoneToE164 } from "@/lib/forms/phone";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * Comments explain the patterns these guards ban, so a guard that reads the
 * whole file fails on the sentence describing the thing it is protecting
 * against. This one already did: the note recording that "Save And Sign In /
 * Guardar Y Entrar" used to be one button tripped the assertion banning it.
 * Strip the prose, then assert against code.
 */
const code = (src: string) =>
  src.replace(/^[ \t]*\{?\/\*[\s\S]*?\*\/\}?/gm, "").replace(/^\s*\/\/.*$/gm, "");

const shell = read("src/components/admin/AuthShell.tsx");
const login = read("src/app/admin/login/page.tsx");
const signup = read("src/app/admin/signup/page.tsx");
const recover = read("src/app/admin/recover/RecoverClient.tsx");
const css = read("src/styles/admin-refinement.css");

const SCREENS: [string, string][] = [
  ["login", login],
  ["signup", signup],
  ["recover", recover],
];

/**
 * Signing in, asking for access and recovering a password were built at three
 * different times and looked it. These pin the things that made them look
 * like three products, so none of them creeps back one screen at a time.
 */
describe("every way in wears the same shell", () => {
  it.each(SCREENS)("%s renders through AuthShell", (_name, src) => {
    expect(src).toMatch(/from "@\/components\/admin\/AuthShell"/);
    expect(src).toMatch(/<AuthShell/);
  });

  it.each(SCREENS)("%s does not hand-roll the leaf", (_name, src) => {
    // Anchored to the class, not the word: the comments explain the leaf.
    expect(src).not.toMatch(/className="ed-access-leaf"/);
    expect(src).not.toMatch(/className="ed-access-panel"/);
  });

  it("the mark is the monogram, and the retired crest is gone", () => {
    expect(shell).toMatch(/<Monogram/);
    // The gold crest is the dark/gold direction DESIGN.md calls residue.
    for (const [, src] of SCREENS) {
      expect(code(src)).not.toMatch(/^import BrandLogo/m);
      expect(code(src)).not.toMatch(/<BrandLogo/);
    }
  });

  it("the heading is centred, which is what was actually asked for", () => {
    expect(css).toMatch(/\.ed-access-leaf\s*\{[\s\S]*?text-align:\s*center/);
  });

  it("keeps Spanish out of a slash and out of Title Case", () => {
    // Each of these was half of a slash-joined button label.
    const src = code(recover);
    for (const spanish of ["Enviarme", "Guardar", "Volver", "Enviando"]) {
      expect(src, `slash-joined before ${spanish}`).not.toMatch(new RegExp(`/\\s*${spanish}`));
    }
    // The bilingual button opts out of the capitalize buttons carry.
    expect(css).toMatch(/\.ed-access-bi > span\s*\{[\s\S]*?text-transform:\s*none/);
  });

  it("spells Spanish with its accents", () => {
    // These were stripped for GSM-7 in the SMS work, where that matters. On a
    // web page it is just misspelt.
    expect(signup).toContain("Español");
    expect(recover).toContain("Correo electrónico");
    expect(recover).toContain("Contraseña nueva");
    expect(code(recover)).not.toMatch(/\bEspanol\b/);
    expect(code(recover)).not.toMatch(/electronico/);
  });

  it("keeps copper scarce: the segment control is ink, not a second accent", () => {
    const segment = css.match(/\.ed-access-segment input:checked \+ span\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(segment).toContain("var(--tj-ink)");
    expect(segment).not.toContain("var(--tj-copper)");
  });

  it("caps the phone field at a whole number, without maxLength", () => {
    // The owner's reason: people mistype and add a digit, and a request that
    // carries a number nobody can dial is a request the desk cannot answer.
    //
    // maxLength is the obvious way and it is the wrong one. The browser
    // truncates a paste before React sees it, so "+1 (832) 818-6428 ext 9"
    // arrived as "(832) 818-6" with the real number silently cut. This was
    // caught on /financing by Playwright and could not be caught by a unit
    // test, which is why the attribute is asserted absent rather than trusted
    // to stay away.
    // Scoped to the phone input. The six-digit code field below it carries a
    // legitimate maxLength, and a file-wide ban would have taken that too.
    const phoneField = code(signup).match(/<input\s+id="phone"[\s\S]*?\/>/)?.[0];
    expect(phoneField, "phone input not found").toBeTruthy();
    expect(phoneField).not.toMatch(/maxLength/);
    expect(signup).toMatch(/onChange=\{\(event\) => setPhone\(formatPhone\(event\.target\.value\)\)\}/);
    expect(signup).toMatch(/value=\{phone\}/);

    // The cap itself, at the function the field calls.
    expect(formatPhone("83281864289")).toBe("(832) 818-6428");
    expect(formatPhone("18328186428")).toBe("(832) 818-6428");
    expect(formatPhone("+1 (832) 818-6428 ext 9")).toBe("(832) 818-6428");
  });

  it("stores a whole number or nothing, decided on the server", () => {
    // A form post is a form post: the cap in the browser is a courtesy, not
    // a guarantee, and the field is optional.
    const action = read("src/lib/actions/team-access.ts");
    expect(action).toMatch(/phoneToE164\(cleanText\(formData\.get\("phone"\)\)\)/);
    expect(phoneToE164("(832) 818-6428")).toBe("+18328186428");
    expect(phoneToE164("8328186428")).toBe("+18328186428");
    // A fragment is not a phone number, so it is not stored as one.
    expect(phoneToE164("832818")).toBeNull();
    expect(phoneToE164("")).toBeNull();
  });

  it("uses one field treatment rather than three", () => {
    for (const src of [signup, recover]) {
      expect(src).toContain("AUTH_FIELD");
      expect(src).toContain("AUTH_LABEL");
    }
    // The oversized radii the request screen used are gone.
    expect(signup).not.toMatch(/rounded-3xl/);
    expect(signup).not.toMatch(/rounded-2xl/);
  });
});
