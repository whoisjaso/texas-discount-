import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ID_FIELDS } from "@/lib/sales/buyer-id";

/**
 * The keyboard a field summons on a phone.
 *
 * Added after a month of practitioner threads put this near the top of the
 * mechanical complaints: an input with no `type` hands you a full QWERTY when
 * the field only ever takes a phone number, and you notice it every single time
 * on a phone and never once on a desktop, which is where it was built.
 *
 * Asserted against source rather than by rendering, because the failure is a
 * missing attribute and that is exactly what this reads. Scoped to the fields
 * where the right keyboard is unambiguous: a phone number is digits, a VIN is
 * uppercase alphanumeric. Search boxes are deliberately excluded even when
 * their placeholder mentions a phone number, because they take anything.
 */

function sources(): { path: string; text: string }[] {
  const root = join(process.cwd(), "src");
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tsx")) {
        out.push({ path: full.slice(root.length + 1), text: readFileSync(full, "utf8") });
      }
    }
  };
  walk(root);
  return out;
}

/** Every `<input ...>` tag in a file, as flat text. */
function inputs(text: string): string[] {
  return (text.match(/<input\b[\s\S]*?\/>/g) ?? []).map((t) =>
    t.replace(/\s+/g, " "),
  );
}

describe("the keyboard a field opens on a phone", () => {
  const all = sources();

  it("gives every phone-number field the number pad", () => {
    const offenders: string[] = [];
    for (const { path, text } of all) {
      for (const tag of inputs(text)) {
        // The name, not the placeholder: a search box whose placeholder happens
        // to mention a phone number still accepts anything.
        if (!/\bname="(?:phone|renterPhone|buyerPhone|contactPhone)"/.test(tag)) continue;
        if (/type="tel"/.test(tag) || /inputMode="tel"/.test(tag)) continue;
        offenders.push(`${path}: ${tag.slice(0, 90)}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("stops a phone lowercasing and autocorrecting a VIN", () => {
    const offenders: string[] = [];
    for (const { path, text } of all) {
      for (const tag of inputs(text)) {
        if (!/\bname="(?:vin|vehicleVin)"/.test(tag)) continue;
        if (/autoCapitalize="characters"/.test(tag)) continue;
        offenders.push(`${path}: ${tag.slice(0, 90)}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("the licence fields carry their own keyboards", () => {
  it("names a keyboard and a capitalisation for every field", () => {
    // Carried as data next to the label rather than decided at the call site,
    // so a second screen rendering the same fields cannot get it wrong.
    for (const field of ID_FIELDS) {
      expect(field.mode, `${field.key} has no input mode`).toBeTruthy();
      expect(field.caps, `${field.key} has no capitalisation`).toBeTruthy();
    }
  });

  it("asks for digits on the two date fields and not on the others", () => {
    const byKey = Object.fromEntries(ID_FIELDS.map((f) => [f.key, f]));
    expect(byKey.dateOfBirth.mode).toBe("numeric");
    expect(byKey.expires.mode).toBe("numeric");
    // A name and an address take letters; forcing a number pad on them would be
    // the same mistake pointing the other way.
    expect(byKey.name.mode).toBe("text");
    expect(byKey.address.mode).toBe("text");
  });

  it("does not autocapitalise a date", () => {
    const byKey = Object.fromEntries(ID_FIELDS.map((f) => [f.key, f]));
    expect(byKey.dateOfBirth.caps).toBe("none");
    expect(byKey.name.caps).toBe("words");
  });
});
