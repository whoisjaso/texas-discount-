"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { saveSaleMoney } from "@/lib/actions/sale-money";
import { saleMoney, typedDollars, type MoneyAnswers } from "@/lib/sales/money";
import type { DealType } from "@/lib/sales/deal-type";
import { tapHaptic } from "@/lib/haptics";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import { fillTemplate, funnelDollars } from "@/lib/sales/i18n";
import { DOC_FEE_SET } from "@/lib/documents/billOfSale";
import { notSet } from "@/lib/dealership-config";

/**
 * The money, in the order the owner says it out loud:
 *
 *   How Much Are They Paying?          the figure two people agreed on
 *   Does That Include Tax And Fees?    what that figure means
 *
 * Two guide URLs keep that spoken order. The first asks for the agreed figure.
 * The second now asks two local questions: what the figure includes, then what
 * crosses the desk today. That second URL still carries the receipt because its
 * numbers are known only after the basis answer, and the receipt sits beside
 * the existing amount-today answer that needs those numbers as context.
 *
 * The second page changes with how the deal is funded, because the same
 * remainder means three different things. On cash it is a balance the seller
 * holds the title over. On buy here pay here it is the note, so the down
 * payment is a visible box rather than a quiet link: a walkthrough persona
 * with a $2,000-down deal read "Paid in full" and could not find where the
 * down payment went. On a bank deal the lender pays the lot, so nothing is
 * owed to the seller and saying "we hold the title" was wrong: the lender
 * holds the lien.
 *
 * Every word on both pages is chosen to be read by somebody who is not an
 * accountant. Not "sales tax at the statutory rate" and not "lien": tax, fees,
 * balance owed. A guard test scores this copy and fails over sixth grade.
 */

const PRICE_STAGES = ["basis", "amount"] as const;
type PriceStage = (typeof PRICE_STAGES)[number];
type StageDirection = "forward" | "back";

export default function MoneyStep({
  dealId,
  part,
  advertised,
  tradeInAllowance,
  funding,
  initial,
  nextHref,
  onNavigate,
}: {
  dealId: string;
  /** Which of the two questions this page is. */
  part: "paid" | "price";
  /** The price on the vehicle row, used only to start the box. */
  advertised: number;
  /** Whatever the bill of sale was told, so the total here matches it. */
  tradeInAllowance: number;
  /** How the deal is funded, which decides what the remainder means. */
  funding: DealType | null;
  initial: MoneyAnswers;
  nextHref: string;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const { t, lang } = useFunnel();
  const [answers, setAnswers] = useState<MoneyAnswers>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<PriceStage>("basis");
  const [direction, setDirection] = useState<StageDirection>("forward");
  const stageIndex = PRICE_STAGES.indexOf(stage);
  const stageShellRef = useRef<HTMLDivElement>(null);
  const stageQuestionRef = useRef<HTMLHeadingElement>(null);

  const dollars = (amount: number) => funnelDollars(amount, lang);

  const money = saleMoney(advertised, answers, tradeInAllowance, funding);

  /**
   * What is in the box, which starts at the likely figure.
   *
   * A prefill, not an answer. The deal stores nothing until somebody moves
   * past this screen. It starts at the marked price when the row has one and
   * empty when it does not, because an empty box asks to be filled and a $0
   * box reads as an answer somebody already gave.
   */
  const [typed, setTyped] = useState(
    initial.amount.trim() || (advertised > 0 ? String(advertised) : ""),
  );

  /**
   * The paid-today box on the second page.
   *
   * On financed deals it is open from the start, because the down payment is
   * a first-class fact of the deal. On cash it hides behind a line, because
   * most cash deals pay the figure above and a second box would be a second
   * question on a page that has one.
   */
  const financed = funding === "inHouse" || funding === "lender";
  const [adjusting, setAdjusting] = useState(
    financed || initial.paidTodayAmount.trim() !== "",
  );
  const [adjustTyped, setAdjustTyped] = useState(initial.paidTodayAmount);

  /**
   * Save, then move.
   *
   * Awaited and pushed here rather than inside a `useTransition`, and that is
   * not a style choice. Both were transitions on one hook, and the blur save
   * fired first when the Next button took focus; the second transition's
   * `router.push` was then dropped and the page sat still. Walked in a
   * browser: the amount saved, no error appeared, and the sale never advanced.
   */
  async function answer(patch: Partial<MoneyAnswers>, goingTo: string | null) {
    tapHaptic();
    setError(null);
    // Drawn before it is saved. The screen has to move under the thumb that
    // tapped it, and a round trip to the database is not that.
    setAnswers((current) => ({ ...current, ...patch }));
    setPending(true);
    const result = await saveSaleMoney(dealId, patch);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? t.chrome.couldNotSave);
      return;
    }
    if (goingTo) onNavigate();
    if (goingTo) router.push(goingTo);
  }

  /**
   * Record direction and replace the question under the same press.
   *
   * Saving may finish later. The input never waits for motion or a network
   * round trip before it appears.
   */
  function movePriceStage(next: PriceStage, nextDirection: StageDirection) {
    const shell = stageShellRef.current;
    if (shell) {
      shell.dataset.direction = nextDirection;
      shell.dataset.leaving = nextDirection;
    }
    setDirection(nextDirection);
    setError(null);
    setStage(next);
  }

  useLayoutEffect(() => {
    const shell = stageShellRef.current;
    if (!shell) return;
    shell.dataset.direction = direction;
    delete shell.dataset.leaving;
    if (part !== "price") return;
    window.scrollTo(0, 0);
    stageQuestionRef.current?.focus({ preventScroll: true });
  }, [direction, part, stage]);

  /**
   * The amount, asked cold.
   *
   * One box, one Next, and Next is the only way forward: it has to wait for
   * the write, because the figure it writes anchors every document after it.
   * The nav's Next is hidden on this step for exactly that reason.
   */
  if (part === "paid") {
    const figure = typedDollars(typed);
    const answered = figure !== null && figure > 0;

    return (
      <div className="ed-money">
        <label className="ed-money-field">
          <span className="sr-only">{t.money.srPaid}</span>
          <input
            className="ed-input ed-money-input"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="$"
            inputMode="decimal"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
        </label>

        {advertised > 0 ? (
          <p className="ed-money-note">
            {fillTemplate(t.money.marked, { price: dollars(advertised) })}
          </p>
        ) : (
          <p className="ed-money-note">{t.money.noMarked}</p>
        )}

        <button
          type="button"
          className="ed-btn ed-btn-dark ed-money-next"
          disabled={pending || !answered}
          onClick={() => void answer({ amount: typed }, nextHref)}
        >
          {pending ? t.chrome.saving : t.chrome.next}
        </button>

        {error ? (
          <p className="ed-money-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  /**
   * What the figure means, then what crosses the desk.
   *
   * The basis press opens the second question immediately. The receipt belongs
   * there because it explains the existing amount-today box, and the final Next
   * still writes that box before leaving so its blur save cannot race the route.
   */
  const quoted = typedDollars(answers.amount) ?? advertised;
  const basisAnswered = answers.priceBasis !== "";

  return (
    <div
      ref={stageShellRef}
      className="ed-money"
      data-price-stage={stage}
      data-direction={direction}
    >
      <p className="ed-cluster-count" data-money-local-progress aria-live="polite">
        {fillTemplate(t.chrome.countOf, {
          current: stageIndex + 1,
          total: PRICE_STAGES.length,
        })}
      </p>

      <div key={stage} className="ed-cluster-stage" data-price-stage-panel={stage}>
        {stage === "basis" ? (
          <>
            <h1 ref={stageQuestionRef} className="ed-cluster-question" tabIndex={-1}>
              {t.money.basisHeading}
            </h1>

            <p className="ed-money-price">
              {fillTemplate(t.money.paying, { price: dollars(quoted) })}
            </p>

            <div className="ed-pay-row" data-tj-stagger>
              <ChoiceButton
                active={answers.priceBasis === "outTheDoor"}
                label={t.money.yes}
                gloss={t.money.yesGloss}
                disabled={pending}
                onClick={() => {
                  movePriceStage("amount", "forward");
                  void answer({ priceBasis: "outTheDoor" }, null);
                }}
              />
              <ChoiceButton
                active={answers.priceBasis === "vehicleOnly"}
                label={t.money.no}
                gloss={t.money.noGloss}
                disabled={pending}
                onClick={() => {
                  movePriceStage("amount", "forward");
                  void answer({ priceBasis: "vehicleOnly" }, null);
                }}
              />
            </div>
          </>
        ) : null}

        {stage === "amount" ? (
          <>
            <h1 ref={stageQuestionRef} className="ed-cluster-question" tabIndex={-1}>
              {financed ? t.money.downPaymentHeading : t.money.amountHeading}
            </h1>

            {/* Nothing until it is answered. A receipt drawn from an answer
                nobody gave is a number somebody will read as ours. */}
            {basisAnswered ? (
              <>
                <dl className="ed-money-receipt" data-money-receipt data-tj-stagger>
                  <div className="ed-money-line">
                    <dt>{t.money.car}</dt>
                    <dd>{dollars(money.salePrice)}</dd>
                  </div>
                  {money.tradeInAllowance > 0 ? (
                    <div className="ed-money-line">
                      <dt>{t.money.lessTradeIn}</dt>
                      <dd>{dollars(-money.tradeInAllowance)}</dd>
                    </div>
                  ) : null}
                  {/* Named one by one because a buyer asking what the four
                      hundred is for deserves an answer from the screen. */}
                  <div className="ed-money-line">
                    <dt>{t.money.salesTax}</dt>
                    <dd>{dollars(money.tax)}</dd>
                  </div>
                  <div className="ed-money-line">
                    <dt>{t.money.titleFee}</dt>
                    <dd>{dollars(money.titleFee)}</dd>
                  </div>
                  <div className="ed-money-line">
                    <dt>{t.money.docFee}</dt>
                    {/* A missing doc fee is not a zero fee: say so. */}
                    <dd>{DOC_FEE_SET ? dollars(money.docFee) : notSet(t.money.docFee.toLowerCase())}</dd>
                  </div>
                  <div className="ed-money-line">
                    <dt>{t.money.regFee}</dt>
                    <dd>{dollars(money.registrationFee)}</dd>
                  </div>
                  <div className="ed-money-line ed-money-total">
                    <dt>{t.money.total}</dt>
                    <dd>{dollars(money.total)}</dd>
                  </div>

                  <div className="ed-money-line">
                    <dt>{financed ? t.money.downPayment : t.money.payingToday}</dt>
                    <dd>{dollars(money.paidToday)}</dd>
                  </div>

                  {funding === "lender" ? (
                    <div className="ed-money-line ed-money-total">
                      <dt>{t.money.lenderPays}</dt>
                      <dd>
                        {dollars(Math.max(0, round2(money.total - money.paidToday)))}
                      </dd>
                    </div>
                  ) : money.lien > 0 ? (
                    <div className="ed-money-line ed-money-lien">
                      <dt>{t.money.balanceOwed}</dt>
                      <dd>{dollars(money.lien)}</dd>
                    </div>
                  ) : null}
                </dl>

                <p className="ed-money-note">
                  {funding === "lender"
                    ? t.money.noteLender
                    : funding === "inHouse"
                      ? t.money.noteInHouse
                      : money.lien > 0
                        ? t.money.noteLien
                        : t.money.notePaid}
                </p>

                {/* The money that crossed the desk today. It is the existing
                    override, made visible on funded deals and kept behind one
                    quiet line on the usual cash deal. */}
                {adjusting ? (
                  <label
                    className="ed-money-field ed-money-adjust-field"
                    data-money-amount-field
                  >
                    <span className="ed-field-label">
                      {financed ? t.money.downToday : t.money.handingToday}
                    </span>
                    <input
                      className="ed-input ed-money-input"
                      value={adjustTyped}
                      onChange={(event) => {
                        setAdjustTyped(event.target.value);
                        setAnswers((current) => ({
                          ...current,
                          paidTodayAmount: event.target.value,
                        }));
                      }}
                      onBlur={() => {
                        // A quiet save has no navigation attached. The final
                        // Next writes both local answers again before leaving.
                        void saveSaleMoney(dealId, { paidTodayAmount: adjustTyped }).then(
                          (result) => {
                            if (!result.ok) {
                              setError(result.error ?? t.chrome.couldNotSave);
                            }
                          },
                        );
                      }}
                      placeholder="$"
                      inputMode="decimal"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </label>
                ) : (
                  <button
                    type="button"
                    className="ed-money-adjust"
                    onClick={() => {
                      tapHaptic();
                      setAdjusting(true);
                    }}
                  >
                    {t.money.otherAmount}
                  </button>
                )}

                <div className="ed-cluster-actions">
                  <button
                    type="button"
                    className="ed-cluster-back"
                    onClick={() => movePriceStage("basis", "back")}
                  >
                    <ArrowLeft size={15} aria-hidden="true" />
                    {t.chrome.back}
                  </button>
                  <button
                    type="button"
                    className="ed-btn ed-btn-dark ed-money-next"
                    disabled={pending}
                    onClick={() =>
                      void answer(
                        {
                          priceBasis: answers.priceBasis,
                          paidTodayAmount: adjusting ? adjustTyped : "",
                        },
                        nextHref,
                      )
                    }
                  >
                    {pending ? t.chrome.saving : t.chrome.next}
                  </button>
                </div>
              </>
            ) : null}
          </>
        ) : null}

        {error ? (
          <p className="ed-money-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** A component rather than a helper call, so the compiler can see the handler is only a click. */
function ChoiceButton({
  active,
  label,
  gloss,
  disabled,
  onClick,
}: {
  active: boolean;
  label: string;
  gloss: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="ed-pay-choice"
      data-active={active ? "true" : undefined}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="ed-pay-choice-label">{label}</span>
      <span className="ed-pay-choice-gloss">{gloss}</span>
    </button>
  );
}

function round2(amount: number): number {
  return Math.round(amount * 100) / 100;
}
