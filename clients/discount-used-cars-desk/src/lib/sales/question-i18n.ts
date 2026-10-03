import type { AskedQuestion } from "@/lib/sales/paperwork";
import type { GuideStep } from "@/lib/sales/guide";
import { fillTemplate, type FunnelStrings } from "@/lib/sales/i18n";

/**
 * The corridor's questions live in code as data — guide.ts and paperwork.ts
 * are the spine and stay English, because they are also what the tests, the
 * SOP and the printed record reference. Localisation is an overlay applied
 * at render time: where the catalogue has a Spanish (or English) string for
 * a question, it replaces the embedded text; where it does not, the embedded
 * English stands. EN output is byte-identical because the EN catalogue was
 * lifted verbatim from this code.
 */

type QuestionOverlay = {
  question?: string;
  note?: string;
  options?: Record<string, { label?: string; gloss?: string }>;
  /** The "another ..." card of a choice that can be typed. */
  other?: { label?: string };
};

/** Labels worked out from the deal (a date, the house rate), by template name. */
function templateText(strings: FunnelStrings, name: string | undefined): string | undefined {
  if (!name) return undefined;
  const templates = (strings.paperwork as Record<string, unknown>).templates;
  if (!templates || typeof templates !== "object") return undefined;
  const value = (templates as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}

function overlayFor(
  strings: FunnelStrings,
  documentType: string,
  key: string,
): QuestionOverlay | undefined {
  const doc = (strings.paperwork as Record<string, unknown>)[documentType];
  if (!doc || typeof doc !== "object") return undefined;
  const entry = (doc as Record<string, unknown>)[key];
  if (!entry || typeof entry !== "object") return undefined;
  return entry as QuestionOverlay;
}

/** One paperwork question, in the operator's language. */
export function localizeQuestion(
  strings: FunnelStrings,
  documentType: string,
  question: AskedQuestion,
): AskedQuestion {
  const overlay = overlayFor(strings, documentType, question.key) ?? {};

  return {
    ...question,
    question: overlay.question ?? question.question,
    ...(question.note ? { note: overlay.note ?? question.note } : {}),
    ...(question.other ? { other: { ...question.other, label: overlay.other?.label ?? question.other.label } } : {}),
    ...(question.options
      ? {
          options: question.options.map((option) => {
            const swap = overlay.options?.[option.value];
            const label = templateText(strings, option.template) ?? swap?.label ?? option.label;
            const gloss = templateText(strings, option.glossTemplate) ?? swap?.gloss ?? option.gloss;
            return { ...option, label, ...(gloss ? { gloss } : {}) };
          }),
        }
      : {}),
  };
}

/** The localized title of a sale document, falling back to the stored one. */
export function localizeDocumentTitle(
  strings: FunnelStrings,
  documentType: string | undefined,
  fallback: string,
): string {
  if (!documentType) return fallback;
  const title = (strings.documents as Record<string, string>)[documentType];
  return title ?? fallback;
}

/** A guide step's question, in the operator's language. */
export function localizeGuideQuestion(
  strings: FunnelStrings,
  step: GuideStep,
): string {
  const g = strings.guide;
  switch (step.key) {
    case "buyer":
      return g.buyer;
    case "buyerId":
      // The English text distinguishes capture from review; match on it so
      // the same distinction survives translation.
      return step.question === "Check What The Card Says."
        ? g.buyerIdReview
        : g.buyerIdCapture;
    case "funding":
      return g.funding;
    case "lender":
      return g.lender;
    case "paid":
      return g.paid;
    case "price":
      return g.price;
    case "title":
      return g.title;
    case "packet":
      return g.packet;
    default:
      if (step.document) {
        return fillTemplate(g.signDocument, {
          title: localizeDocumentTitle(
            strings,
            step.document.documentType,
            step.document.title,
          ),
        });
      }
      return step.question;
  }
}
