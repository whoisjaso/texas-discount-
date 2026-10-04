// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HoldToConfirmButton from "@/components/admin/HoldToConfirmButton";
import { DeskConfirm } from "@/components/admin/DeskConfirm";
import { getFunnelStrings } from "@/lib/sales/i18n";

vi.mock("@/lib/haptics", () => ({ tapHaptic: vi.fn() }));
const labels = getFunnelStrings("en").holdConfirmation;
const confirm = vi.fn();
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  isPrimary: boolean;
  constructor(type: string, options: PointerEventInit = {}) {
    super(type, options);
    this.pointerId = options.pointerId ?? 1;
    this.isPrimary = options.isPrimary ?? true;
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  confirm.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function mount() {
  const view = render(<HoldToConfirmButton labels={labels} confirm="Confirm" className="" onConfirm={confirm} />);
  const button = screen.getByRole("button");
  button.getBoundingClientRect = () => ({ left: 0, right: 240, top: 0, bottom: 48, width: 240, height: 48, x: 0, y: 0, toJSON: () => ({}) });
  return { button, ...view };
}
const down = (button: HTMLElement) => fireEvent.pointerDown(button, { pointerId: 1, isPrimary: true, button: 0, clientX: 40, clientY: 20 });
const up = (button: HTMLElement) => fireEvent.pointerUp(button, { pointerId: 1, clientX: 40, clientY: 20 });

describe("deliberate hold confirmation", () => {
  it("resets a short press and never treats its click as confirmation", async () => {
    const { button } = mount(); down(button); await wait(500);
    expect(Number(button.dataset.holdProgress)).toBeGreaterThan(0);
    up(button); fireEvent.click(button, { detail: 1 });
    expect(button.dataset.holdProgress).toBe("0");
    await wait(2000); expect(confirm).not.toHaveBeenCalled();
  });

  it("requires release after visible100percent, and commits only once", async () => {
    const { button } = mount(); down(button); await wait(1216);
    expect(button.dataset.holdProgress).toBe("100");
    expect(confirm).not.toHaveBeenCalled();
    up(button); fireEvent.click(button, { detail: 1 }); up(button);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("cancels when dragged outside and cannot resume by dragging back", async () => {
    const { button } = mount(); down(button); await wait(600);
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 300, clientY: 20 });
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 40, clientY: 20 });
    await wait(1500); up(button);
    expect(button.dataset.holdProgress).toBe("0"); expect(confirm).not.toHaveBeenCalled();
  });

  it.each(["pointerCancel", "blur", "lostPointerCapture"] as const)("resets after %s", async (event) => {
    const { button } = mount(); down(button); await wait(1216);
    fireEvent[event](button); up(button);
    expect(button.dataset.holdProgress).toBe("0"); expect(confirm).not.toHaveBeenCalled();
  });

  it.each([" ", "Enter"])("supports holding and releasing the %s key without repeat activation", async key => {
    const { button } = mount();
    fireEvent.keyDown(button, { key }); await wait(500);
    fireEvent.keyDown(button, { key, repeat: true }); await wait(720);
    expect(button.dataset.holdProgress).toBe("100"); expect(confirm).not.toHaveBeenCalled();
    fireEvent.keyUp(button, { key });
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("ignores a held opening key and resets an incomplete keyboard press", async () => {
    const { button } = mount();
    fireEvent.keyDown(button, { key: "Enter", repeat: true }); await wait(1300);
    expect(button.dataset.holdProgress).toBe("0");
    fireEvent.keyDown(button, { key: " " }); await wait(400);
    fireEvent.keyUp(button, { key: " " }); await wait(1300);
    expect(button.dataset.holdProgress).toBe("0"); expect(confirm).not.toHaveBeenCalled();
  });

  it("cancels when Escape is pressed or the page loses focus", async () => {
    const { button } = mount(); down(button); await wait(1216);
    fireEvent.keyDown(window, { key: "Escape" }); up(button);
    down(button); await wait(1216); fireEvent.blur(window); up(button);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("gives click-only assistive activation two deliberate steps with the same wait", async () => {
    const { button } = mount(); fireEvent.click(button, { detail: 0 });
    await wait(400); fireEvent.click(button, { detail: 0 }); expect(confirm).not.toHaveBeenCalled();
    await wait(816); expect(button.dataset.holdProgress).toBe("100");
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(button, { detail: 0 }); expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("cannot complete after unmount", async () => {
    const { button, unmount } = mount(); down(button); await wait(600); unmount(); await wait(2000);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("cancels the touch compatibility click at its source", () => {
    const { button } = mount();
    const event = new Event("touchstart", { bubbles: true, cancelable: true });
    fireEvent(button, event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("resets a hold when a different request replaces the open question", async () => {
    const view = render(<DeskConfirm pending={{ question: "First address?", confirm: "Confirm", hold: labels }} onAnswer={confirm} />);
    let button = screen.getByRole("button", { name: /hold to confirm/i });
    fireEvent.keyDown(button, { key: " " }); await wait(1216);
    expect(button.dataset.holdProgress).toBe("100");
    view.rerender(<DeskConfirm pending={{ question: "Second address?", confirm: "Confirm", hold: labels }} onAnswer={confirm} />);
    button = screen.getByRole("button", { name: /hold to confirm/i });
    expect(button.dataset.holdProgress).toBe("0");
    fireEvent.keyUp(button, { key: " " }); expect(confirm).not.toHaveBeenCalled();
    fireEvent.keyDown(button, { key: " " }); await wait(1216); fireEvent.keyUp(button, { key: " " });
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("keeps ordinary DeskConfirm actions immediate and Cancel available for holds", () => {
    const view = render(<DeskConfirm pending={{ question: "Continue?", confirm: "Continue" }} onAnswer={confirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(confirm).toHaveBeenCalledWith(true); confirm.mockReset();
    view.rerender(<DeskConfirm pending={{ question: "Read this back?", confirm: "Confirm", hold: labels }} onAnswer={confirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).toHaveBeenCalledWith(false);
  });
});
