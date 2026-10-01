import Link from "next/link";
import Monogram from "@/components/site/shared/Monogram";
import { brand } from "@/lib/dealership-config";

/**
 * The one way in, and the one way it looks.
 *
 * Signing in, asking for access and recovering a password were three screens
 * built at three different times: a card with a left-aligned title under a
 * centred wordmark, an off-centre two column split carrying the retired gold
 * crest, and a page with no shell at all, top-left on bare paper. Three
 * designs, one of them wearing a mark DESIGN.md calls residue.
 *
 * So they now share this. One leaf of paper, centred on the ground, holding
 * the monogram, one Title Case heading, the form, and whatever quiet business
 * belongs under a rule. Nothing here explains itself: the heading names the
 * job and the button does it.
 *
 * The mark is the monogram rather than the full wordmark lockup. At this size
 * the lockup's sub-line sets a second, smaller line of type above the heading
 * and the eye reads two titles. The monogram is one shape and reads as one.
 */

type Props = {
  /** Title Case, per DESIGN.md. The screen's whole job, in a few words. */
  title: string;
  /**
   * One line of scent under the heading, sentence case. Most screens want
   * none: a heading that needs a sentence is the wrong heading.
   */
  lede?: string;
  /** Spanish beneath the lede, for the screens somebody reaches locked out. */
  ledeEs?: string;
  children: React.ReactNode;
  /** Quiet business below a hairline: the way back, the way on. */
  footer?: React.ReactNode;
  /** The legal line under the leaf. Off by default; sign-in carries it. */
  showLegal?: boolean;
  /**
   * No mark, no heading, just the leaf around the children.
   *
   * For a screen whose content is itself the mark. The request-received seal
   * put a monogram inside a copper ring directly under the shell's monogram,
   * and titled "Request Received" directly under "Request Access": the same
   * thing said twice, twice.
   */
  bare?: boolean;
};

/**
 * One field treatment for every way in.
 *
 * Sign-in drew its inputs at 48px on the recessed surface; request-access
 * drew them at 56px with a 16px radius and an 18px value; recover drew them
 * white with no radius at all. Same product, three inputs. These are the
 * input and the label, and every auth screen imports them rather than
 * describing one again.
 */
export const AUTH_FIELD =
  "w-full min-h-[50px] rounded-[6px] border border-[color:var(--tj-line)] bg-[color:var(--tj-surface)] px-3.5 py-3 text-[15px] text-[color:var(--tj-ink)] placeholder:text-[color:var(--tj-muted-light)] outline-none transition-colors duration-200 focus:border-[color:var(--tj-copper)]";

export const AUTH_LABEL =
  "mb-1.5 block text-[12px] font-medium text-[color:var(--tj-muted)]";

export default function AuthShell({ title, lede, ledeEs, children, footer, showLegal, bare }: Props) {
  return (
    <div className="ed-access">
      <div className="ed-access-leaf">
        {bare ? null : (
          <Link href="/" className="ed-access-mark" aria-label={`${brand.short} website`}>
            <Monogram height={46} tone="copper" title="" />
          </Link>
        )}

        {bare ? null : <h1 className="ed-access-title">{title}</h1>}

        {lede ? (
          <p className="ed-access-lede">
            {lede}
            {ledeEs ? <span className="ed-access-lede-es">{ledeEs}</span> : null}
          </p>
        ) : null}

        <div className={bare ? undefined : "ed-access-body"}>{children}</div>

        {footer ? <div className="ed-access-foot">{footer}</div> : null}
      </div>

      {showLegal ? <p className="ed-access-legal">{brand.legal}</p> : null}
    </div>
  );
}
