// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CeremonyClient from "@/app/sign/packet/[token]/CeremonyClient";
import { isSigningSheetReady } from "@/lib/sales/signing-sheet-readiness";

const sign = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/packet-signing", () => ({ signPacketDocument: sign }));
vi.mock("@/lib/haptics", () => ({ tapHaptic: vi.fn() }));
vi.mock("@/components/documents/SignaturePad", () => ({ default: ({ onChange }: { onChange: (value: string) => void }) => <button onClick={() => onChange("data:image/png;base64,stroke")}>Draw signature</button> }));

beforeEach(() => { vi.useFakeTimers(); sign.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(300); });
const page = (ready: boolean, image = false) => [{ id: "doc-1", documentType: "rebuiltDisclosure", title: "State disclosure", meaning: "", signed: false,
  sheet: <div data-sign-ready={String(ready)}>{image ? <img src="/synthetic.png" alt="Official page" /> : <p>{ready ? "The complete official document" : "Preparing state document"}</p>}</div>,
}];
function ceremony(pages = page(false)) {
  return <CeremonyClient token="local-token" language="en" buyerName="Jordan Example" vehicle="Camry" dealer="Dealer" canSign pages={pages} />;
}
function start() {
  fireEvent.click(screen.getByRole("button", { name: /begin/i }));
  const sheet = document.querySelector<HTMLElement>("[data-sign-sheet]")!;
  Object.defineProperties(sheet, { clientHeight: { configurable: true, value: 400 }, scrollHeight: { configurable: true, value: 400 } });
  return sheet;
}
const read = () => document.querySelector("[data-sign-read]")?.getAttribute("data-sign-read");

describe("the buyer reads loaded document content", () => {
  it("does not accept a loading placeholder that fits in the viewport", async () => {
    render(ceremony());
    const sheet = start();
    fireEvent.scroll(sheet);
    await settle();
    expect(read()).toBe("false");
    expect(screen.queryByRole("button", { name: "Draw signature" })).toBeNull();
  });

  it("waits for actual image load after the official renderer reports ready", async () => {
    render(ceremony(page(true, true)));
    const sheet = start();
    await settle();
    expect(read()).toBe("false");
    const image = sheet.querySelector("img")!;
    Object.defineProperties(image, { complete: { configurable: true, value: true }, naturalWidth: { configurable: true, value: 612 }, naturalHeight: { configurable: true, value: 792 } });
    fireEvent.load(image);
    await settle();
    expect(read()).toBe("true");
  });

  it("observes delayed readiness and requires scrolling through the newly drawn pages", async () => {
    const view = render(ceremony());
    const sheet = start();
    await settle();
    Object.defineProperty(sheet, "scrollHeight", { configurable: true, value: 1400 });
    view.rerender(ceremony(page(true)));
    await settle();
    expect(read()).toBe("false");
    sheet.scrollTop = 1000;
    fireEvent.scroll(sheet);
    expect(read()).toBe("true");
  });

  it("revokes a previous read when the document becomes unavailable, then recovers", async () => {
    const view = render(ceremony(page(true)));
    start(); await settle();
    expect(read()).toBe("true");
    view.rerender(ceremony(page(false)));
    await settle();
    expect(read()).toBe("false");
    expect(screen.queryByRole("button", { name: "Draw signature" })).toBeNull();
    expect(sign).not.toHaveBeenCalled();
    view.rerender(ceremony(page(true)));
    await settle();
    expect(read()).toBe("true");
  });

  it("refuses a stale signing click if content becomes unavailable before observer delivery", async () => {
    render(ceremony(page(true)));
    const sheet = start(); await settle();
    fireEvent.click(screen.getByRole("button", { name: "Draw signature" }));
    sheet.querySelector<HTMLElement>("[data-sign-ready]")!.dataset.signReady = "false";
    fireEvent.click(document.querySelector<HTMLButtonElement>("[data-sign-submit]")!);
    expect(sign).not.toHaveBeenCalled();
    expect(read()).toBe("false");
  });

  it("requires every readiness marker and every image, including broken images", () => {
    const sheet = document.createElement("div");
    sheet.innerHTML = '<div data-sign-ready="true"><div data-sign-ready="false"></div></div>';
    expect(isSigningSheetReady(sheet)).toBe(false);
    sheet.querySelectorAll<HTMLElement>("[data-sign-ready]")[1].dataset.signReady = "true";
    expect(isSigningSheetReady(sheet)).toBe(true);
    sheet.firstElementChild!.append(document.createElement("img"));
    expect(isSigningSheetReady(sheet)).toBe(false);
  });
});
