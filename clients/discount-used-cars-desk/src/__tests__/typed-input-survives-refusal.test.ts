/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { restoreForm, snapshotForm } from "@/lib/forms/typed-input";

/**
 * The user's input is sacred.
 *
 * A submit that comes back refused must leave the fields as they were. React 19
 * clears an uncontrolled form once its action returns, and a returned error is
 * a return, so the reset happens on exactly the occasion where the values are
 * most needed. This covers the restore that undoes it.
 *
 * Every case here is written against a real form element rather than a mocked
 * one, because the bug being fixed is a DOM behaviour and a mock would agree
 * with whatever I believed while writing it.
 */

function form(html: string): HTMLFormElement {
  document.body.innerHTML = `<form>${html}</form>`;
  return document.body.querySelector("form") as HTMLFormElement;
}

describe("a refused submit keeps what was typed", () => {
  it("puts text back after the browser resets it", () => {
    const f = form(`<input name="name" /><input name="phone" />`);
    const [name, phone] = Array.from(f.elements) as HTMLInputElement[];
    name.value = "Marisol Guerrero";
    phone.value = "713555010";

    const snapshot = snapshotForm(f);
    f.reset();
    expect(name.value).toBe("");

    expect(restoreForm(f, snapshot)).toBe(2);
    expect(name.value).toBe("Marisol Guerrero");
    expect(phone.value).toBe("713555010");
  });

  it("puts a textarea back", () => {
    const f = form(`<textarea name="notes"></textarea>`);
    const notes = f.elements[0] as HTMLTextAreaElement;
    notes.value = "Trade-in has a salvage title, buyer knows.";

    const snapshot = snapshotForm(f);
    f.reset();
    expect(notes.value).toBe("");

    restoreForm(f, snapshot);
    expect(notes.value).toBe("Trade-in has a salvage title, buyer knows.");
  });

  it("restores a select to the chosen option, not the default", () => {
    // The contact form's "best contact" select went back to Text after a
    // refused submit, silently changing an answer the visitor had given.
    const f = form(
      `<select name="preferredContact"><option value="Text">Text</option><option value="Call">Call</option></select>`,
    );
    const select = f.elements[0] as HTMLSelectElement;
    select.value = "Call";

    const snapshot = snapshotForm(f);
    f.reset();
    expect(select.value).toBe("Text");

    restoreForm(f, snapshot);
    expect(select.value).toBe("Call");
  });

  it("restores checkboxes and radios by checked state, not by value", () => {
    const f = form(
      `<input type="checkbox" name="scopes" value="read" />
       <input type="checkbox" name="scopes" value="write" />
       <input type="radio" name="lang" value="en" />
       <input type="radio" name="lang" value="es" />`,
    );
    const [read, write, en, es] = Array.from(f.elements) as HTMLInputElement[];
    write.checked = true;
    es.checked = true;

    const snapshot = snapshotForm(f);
    f.reset();
    expect(write.checked).toBe(false);
    expect(es.checked).toBe(false);

    restoreForm(f, snapshot);
    expect(read.checked).toBe(false);
    expect(write.checked).toBe(true);
    expect(en.checked).toBe(false);
    expect(es.checked).toBe(true);
  });

  it("restores a multiple select", () => {
    const f = form(
      `<select name="tags" multiple><option value="a">A</option><option value="b">B</option><option value="c">C</option></select>`,
    );
    const select = f.elements[0] as HTMLSelectElement;
    select.options[0].selected = true;
    select.options[2].selected = true;

    const snapshot = snapshotForm(f);
    // Cleared by hand rather than through reset(). jsdom does not deselect a
    // multiple select on reset, and asserting that it does would be asserting
    // my guess about jsdom instead of testing the restore.
    for (const option of Array.from(select.options)) option.selected = false;
    expect(Array.from(select.selectedOptions)).toHaveLength(0);

    restoreForm(f, snapshot);
    expect(Array.from(select.selectedOptions).map((o) => o.value)).toEqual(["a", "c"]);
  });

  it("keeps a value that differs from its defaultValue", () => {
    // The sale intake seeds today's date and TX. A reset returns to those, so
    // an edited value looks restored when it has actually been reverted.
    const f = form(`<input name="buyerState" value="TX" />`);
    const state = f.elements[0] as HTMLInputElement;
    state.value = "NM";

    const snapshot = snapshotForm(f);
    f.reset();
    expect(state.value).toBe("TX");

    restoreForm(f, snapshot);
    expect(state.value).toBe("NM");
  });
});

describe("the restore refuses to guess", () => {
  it("does not write a value into a field that moved", () => {
    // A refused submit can re-render with a field added. Restoring by position
    // alone would put the phone number in the date box.
    const before = form(`<input name="phone" /><input name="saleDate" type="date" />`);
    (before.elements[0] as HTMLInputElement).value = "7135550101";
    const snapshot = snapshotForm(before);

    const after = form(
      `<input name="lienholder" /><input name="phone" /><input name="saleDate" type="date" />`,
    );
    expect(restoreForm(after, snapshot)).toBe(0);
    expect((after.elements[0] as HTMLInputElement).value).toBe("");
    expect((after.elements[1] as HTMLInputElement).value).toBe("");
  });

  it("does not write across a type change at the same position", () => {
    const before = form(`<input name="amount" />`);
    (before.elements[0] as HTMLInputElement).value = "not a number";
    const snapshot = snapshotForm(before);

    const after = form(`<input name="amount" type="date" />`);
    expect(restoreForm(after, snapshot)).toBe(0);
  });

  it("leaves a file input alone, because its value cannot be set", () => {
    const f = form(`<input type="file" name="scan" /><input name="name" />`);
    (f.elements[1] as HTMLInputElement).value = "Marisol Guerrero";
    const snapshot = snapshotForm(f);

    expect(snapshot.map((s) => s.name)).toEqual(["name"]);
    expect(() => restoreForm(f, snapshot)).not.toThrow();
    expect((f.elements[1] as HTMLInputElement).value).toBe("Marisol Guerrero");
  });

  it("does not snapshot buttons", () => {
    const f = form(
      `<input name="name" /><button type="submit">Send</button><input type="reset" value="Clear" />`,
    );
    expect(snapshotForm(f).map((s) => s.name)).toEqual(["name"]);
  });
});

describe("the check itself", () => {
  // An empty result is only worth trusting from an instrument that can fail.
  it("would notice if the restore did nothing", () => {
    const f = form(`<input name="name" />`);
    const name = f.elements[0] as HTMLInputElement;
    name.value = "Marisol Guerrero";
    const snapshot = snapshotForm(f);
    f.reset();

    // Restoring against an unrelated form must not report success.
    const other = form(`<input name="somethingElse" />`);
    expect(restoreForm(other, snapshot)).toBe(0);
  });

  it("sees that a plain reset is what loses the values", () => {
    // If this ever stops holding, the bug is gone and so is the reason for the
    // restore. Better to be told than to keep carrying it.
    const f = form(`<input name="name" value="" />`);
    const name = f.elements[0] as HTMLInputElement;
    name.value = "typed";
    f.reset();
    expect(name.value).toBe("");
  });
});
