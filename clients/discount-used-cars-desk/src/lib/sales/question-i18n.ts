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
};

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
  const overlay = overlayFor(strings, documentType, question.key);
  if (!overlay) return question;

  return {
    ...question,
    question: overlay.question ?? question.question,
    ...(question.note ? { note: overlay.note ?? question.note } : {}),
    ...(question.options
      ? {
          options: question.options.map((option) => {
            const swap = overlay.options?.[option.value];
            if (!swap) return option;
            return {
              ...option,
              label: swap.label ?? option.label,
              ...(option.gloss || swap.gloss
                ? { gloss: swap.gloss ?? option.gloss }
                : {}),
            };
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
