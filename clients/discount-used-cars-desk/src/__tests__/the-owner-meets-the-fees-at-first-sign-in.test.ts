import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The owner meets Your Fees at first sign-in (rulebook texas-dealer-fees.md
 * 5.2): after Draw Your Signature and before Done, for the Owner only, and
 * only while the dealership has no owner-saved fees. Set once, used on every
 * sale, like the signature. "Set These Later" lets Done complete, and the
 * filing refusal ("Documentary fee") keeps the protection until they are set.
 */

const session = vi.hoisted(() => ({ cookie: "owner:owner@example.dev" }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "tj-local-admin-preview" ? { value: session.cookie } : undefined),
    set: () => {},
    delete: () => {},
    getAll: () => [],
  }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

import { feeFields, saveThroughMock } from "./helpers/fees";
import { resetMockWrites } from "@/lib/supabase/mock";
import AdminOnboardingPage from "@/app/admin/account/onboarding/page";
import { firstOpenStep, onboardingSteps, withFeesStep } from "@/lib/onboarding/staff-name";
import { saveStaffSignatureAction } from "@/lib/actions/staff-signature";
import { completeOnboardingAction, saveOnboardingNameAction } from "@/lib/actions/team-onboarding";
import { DEALERSHIP_HOME } from "@/lib/admin/workspace";
import { missingDealerFacts } from "@/lib/dealership-config";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** The onboarding flow's props, off the page the server renders. */
async function flowProps(): Promise<Record<string, unknown>> {
  const page = (await AdminOnboardingPage()) as ReactElement<{ children: ReactElement<Record<string, unknown>> }>;
  const flow = page.props.children;
  expect(isValidElement(flow)).toBe(true);
  return flow.props;
}

beforeEach(() => {
  vi.stubEnv("LOCAL_ADMIN_PREVIEW", "true");
  session.cookie = "owner:owner@example.dev";
  resetMockWrites();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockWrites();
});

describe("the steps", () => {
  it("put Your Fees after the signature, or the name, and before Done", () => {
    expect(onboardingSteps({ canSign: true, setsFees: true })).toEqual(["name", "signature", "fees", "done"]);
    expect(onboardingSteps({ canSign: false, setsFees: true })).toEqual(["name", "fees", "done"]);
    expect(onboardingSteps({ canSign: true, requiresPasswordChange: true, setsFees: true })).toEqual([
      "password",
      "name",
      "signature",
      "fees",
      "done",
    ]);
  });

  it("are exactly what they were without the new argument", () => {
    expect(onboardingSteps({ canSign: true })).toEqual(["name", "signature", "done"]);
    expect(onboardingSteps({ canSign: false })).toEqual(["name", "done"]);
    expect(onboardingSteps({ canSign: true, requiresPasswordChange: true, finished: true })).toEqual(["password", "done"]);
    expect(firstOpenStep({ canSign: true, hasName: true, hasSignature: true })).toBe("done");
  });

  it("place the step the same way from the page's pinned list", () => {
    for (const canSign of [true, false]) {
      for (const requiresPasswordChange of [true, false]) {
        expect(withFeesStep(onboardingSteps({ canSign, requiresPasswordChange }), true)).toEqual(
          onboardingSteps({ canSign, requiresPasswordChange, setsFees: true }),
        );
        expect(withFeesStep(onboardingSteps({ canSign, requiresPasswordChange }), false)).toEqual(onboardingSteps({ canSign, requiresPasswordChange }));
      }
    }
  });

  it("pick up at Your Fees once the name and signature are on file", () => {
    expect(firstOpenStep({ canSign: true, hasName: true, hasSignature: true, needsFees: true })).toBe("fees");
    expect(firstOpenStep({ canSign: true, hasName: true, hasSignature: false, needsFees: true })).toBe("signature");
    expect(firstOpenStep({ canSign: true, hasName: false, hasSignature: false, needsFees: true })).toBe("name");
    expect(firstOpenStep({ canSign: true, hasName: true, hasSignature: true, needsFees: true, requiresPasswordChange: true })).toBe("password");
  });
});

describe("who walks it", () => {
  it("is the owner, while no fees are saved", async () => {
    vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
    const props = await flowProps();
    expect(props.steps).toEqual(["name", "signature", "fees", "done"]);
    expect(props.fees).toMatchObject({ county: "Harris" });
    expect((props.fees as { schedule: { source: string } }).schedule.source).toBe("config");
  });

  it("is never a salesperson", async () => {
    vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh-sales");
    session.cookie = "sales:sales@example.dev";
    const props = await flowProps();
    expect(props.steps).toEqual(["name", "signature", "done"]);
    expect(props.fees).toBeNull();
  });

  it("is no one once the owner has saved the fees", async () => {
    vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
    expect((await saveThroughMock(feeFields(), 0, "owner", "onboarding")).error).toBeNull();
    const props = await flowProps();
    expect(props.steps).toEqual(["name", "signature", "done"]);
    expect(props.fees).toBeNull();
  });

  it("starts at Your Fees for an owner with the name and signature already on file", async () => {
    vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
    const data = new FormData();
    data.set("firstName", "Maria");
    data.set("lastName", "Lopez");
    expect(await saveOnboardingNameAction(data)).toMatchObject({ ok: true });
    expect(await saveStaffSignatureAction(PNG)).toEqual({ ok: true });
    const props = await flowProps();
    expect(props.initialStep).toBe("fees");
  });
});

describe("Set These Later", () => {
  it("lets Done complete with no fees saved, while filing stays refused", async () => {
    vi.stubEnv("DESK_PREVIEW_MEMBER", "fresh");
    const data = new FormData();
    data.set("firstName", "Maria");
    data.set("lastName", "Lopez");
    await saveOnboardingNameAction(data);
    await saveStaffSignatureAction(PNG);
    await expect(completeOnboardingAction()).rejects.toThrow(`REDIRECT:${DEALERSHIP_HOME}`);
    // The refusal that protects the sale is untouched by onboarding.
    expect(missingDealerFacts({ docFee: null })).toContain("Documentary fee");
  });

  it("is offered on every fees screen of the corridor, and Done says what it means", () => {
    const flow = readFileSync("src/app/admin/account/onboarding/OnboardingFlow.tsx", "utf8");
    const wizard = readFileSync("src/components/admin/fees/DealerFeesWizard.tsx", "utf8");
    expect(flow).toContain("<DealerFeesWizard");
    expect(flow).toContain('mode="onboarding"');
    expect(flow).toContain("onLater={() => {");
    expect(flow).toContain("o.doneFeesLater");
    expect(wizard).toContain('mode === "onboarding" && onLater');
  });
});
