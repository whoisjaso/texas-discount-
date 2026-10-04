/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CodeBoxes from "@/components/admin/CodeBoxes";

/**
 * Six boxes have to behave like one field or they are worse than the single
 * input they replaced. These are the behaviours that decide that, and the
 * paste is the one that matters most: the code arrives in a message, and
 * people copy the whole thing.
 */

const boxes = () => screen.getAllByRole("textbox") as HTMLInputElement[];
const hidden = () =>
  document.querySelector('input[type="hidden"][name="verification_code"]') as HTMLInputElement;

describe("CodeBoxes", () => {
  it("posts one value from six boxes", () => {
    render(<CodeBoxes />);
    const all = boxes();
    expect(all).toHaveLength(6);
    "482913".split("").forEach((digit, i) => fireEvent.change(all[i], { target: { value: digit } }));
    expect(hidden().value).toBe("482913");
  });

  it("moves forward as you type and back on backspace", () => {
    render(<CodeBoxes />);
    const all = boxes();
    fireEvent.change(all[0], { target: { value: "4" } });
    expect(document.activeElement).toBe(all[1]);

    // Backspace in an empty box clears the one before and goes there.
    fireEvent.keyDown(all[1], { key: "Backspace" });
    expect(all[0].value).toBe("");
    expect(document.activeElement).toBe(all[0]);
  });

  it("spreads a pasted code across every box", () => {
    render(<CodeBoxes />);
    const all = boxes();
    fireEvent.paste(all[0], { clipboardData: { getData: () => "482913" } });
    expect(all.map((b) => b.value).join("")).toBe("482913");
    expect(hidden().value).toBe("482913");
  });

  it("spreads a paste made into the middle box, from the start", () => {
    // Somebody taps a box then pastes. The code still belongs at the front.
    render(<CodeBoxes />);
    const all = boxes();
    fireEvent.paste(all[3], { clipboardData: { getData: () => "482913" } });
    expect(all.map((b) => b.value).join("")).toBe("482913");
  });

  it("takes an iOS autofill, which arrives whole in the first box", () => {
    // iOS fills the field marked one-time-code with the entire code rather
    // than one character, which is why change() carries six digits here.
    render(<CodeBoxes />);
    const all = boxes();
    fireEvent.change(all[0], { target: { value: "482913" } });
    expect(all.map((b) => b.value).join("")).toBe("482913");
  });

  it("marks only the first box for autofill", () => {
    render(<CodeBoxes />);
    const all = boxes();
    expect(all[0].getAttribute("autocomplete")).toBe("one-time-code");
    for (const box of all.slice(1)) {
      expect(box.getAttribute("autocomplete")).toBe("off");
    }
  });

  it("keeps out anything that is not a digit", () => {
    render(<CodeBoxes />);
    const all = boxes();
    fireEvent.change(all[0], { target: { value: "a" } });
    expect(all[0].value).toBe("");
    fireEvent.paste(all[0], { clipboardData: { getData: () => "48-29 13" } });
    expect(all.map((b) => b.value).join("")).toBe("482913");
  });

  it("reports the code once, when all six are filled", () => {
    const onComplete = vi.fn();
    render(<CodeBoxes onComplete={onComplete} />);
    const all = boxes();
    "48291".split("").forEach((d, i) => fireEvent.change(all[i], { target: { value: d } }));
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.change(all[5], { target: { value: "3" } });
    expect(onComplete).toHaveBeenCalledWith("482913");
  });

  it("says which box is which, for a screen reader", () => {
    render(<CodeBoxes />);
    expect(screen.getByLabelText("Digit 1 of 6")).toBeTruthy();
    expect(screen.getByLabelText("Digit 6 of 6")).toBeTruthy();
  });
});
