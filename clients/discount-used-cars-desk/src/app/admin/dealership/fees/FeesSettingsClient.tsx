"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import FunnelLanguageToggle from "@/components/admin/funnel/FunnelLanguageToggle";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import DealerFeesWizard, { type FeeScreen } from "@/components/admin/fees/DealerFeesWizard";
import {
  DEALER_DEPUTY_TITLE_FEE,
  DOC_FEE,
  VIT_REIMBURSEMENT,
  centsAsDollars,
} from "@/lib/legal/texas-dealer-fees";
import { dealerChargesLine, docFeeCapCents, type FeeSchedule } from "@/lib/sales/fee-schedule";
import { fillTemplate } from "@/lib/sales/i18n";
import type { FeeChange } from "@/lib/dealership-fees";

/**
 * The settings screen for Your Fees: a summary of every dealer-set line with
 * its limit and citation, a Change link on each (the onboarding screens,
 * opened at that question, saved with the version this screen read), the
 * rule for open sales, the posted notice, and the change history.
 */
export default function FeesSettingsClient({
  schedule,
  changes,
  historyUnreadable,
  county,
  today,
}: {
  schedule: FeeSchedule;
  changes: FeeChange[];
  historyUnreadable: boolean;
  county: string | null;
  today: string;
}) {
  const router = useRouter();
  const { t } = useFunnel();
  const f = t.onboarding.fees;
  const [editing, setEditing] = useState<FeeScreen | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  if (editing) {
    return (
      <div className="ed-guide ed-fees-inline" data-fees-settings-editing={editing}>
        <DealerFeesWizard
          mode="settings"
          initialSchedule={schedule}
          county={county}
          today={today}
          startAt={editing}
          onSaved={() => {
            setEditing(null);
            setJustSaved(true);
            router.refresh();
          }}
          onExit={() => setEditing(null)}
        />
      </div>
    );
  }

  const doc = schedule.docFeeCents;
  const docSet = doc !== null && Number.isFinite(doc);
  const charges = dealerChargesLine(schedule);
  const cents = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? centsAsDollars(value) : f.historyNotSet);
  const yesNo = (value: boolean | null) => (value === null ? f.notAnswered : value ? f.yes : f.no);

  return (
    <div className="ed-admin px-5 py-8 md:px-10 md:py-12" data-fees-settings="">
      <header className="ed-sale-head">
        <h1 className="ed-admin-title">{f.settingsTitle}</h1>
        <FunnelLanguageToggle />
      </header>
      <p className="ed-fine mt-3 max-w-2xl">{f.settingsLead}</p>
      {justSaved ? (
        <p className="ed-fine mt-3" role="status">
          {f.saved}
        </p>
      ) : null}

      <section className="ed-admin-panel mt-8 p-6 md:p-7" aria-label={f.reviewDealer}>
        <p className="ed-fee-on-top" data-dealer-charges="">
          {fillTemplate(f.onTop, { charged: charges.charged, allowed: charges.allowed })}
        </p>
        <p className="ed-fine mt-2">{f.noCombinedCap}</p>
        <dl className="ed-money-receipt ed-fee-receipt">
          <SummaryLine
            label={f.docFeeLabel}
            value={docSet ? centsAsDollars(doc as number) : f.notAnswered}
            citation={fillTemplate(f.limitLine, { limit: centsAsDollars(docFeeCapCents(schedule)), citation: DOC_FEE.shortCitation })}
            change={f.change}
            onChange={() => setEditing("docFee")}
          />
          <SummaryLine
            label={f.deputyLine}
            value={schedule.deputy.isDeputy ? fillTemplate(f.notChargedYet, { fee: centsAsDollars(schedule.deputy.feeCents) }) : f.notDeputy}
            citation={fillTemplate(f.deputyLimit, { limit: centsAsDollars(DEALER_DEPUTY_TITLE_FEE.maxCents) })}
            change={f.change}
            onChange={() => setEditing("deputy")}
          />
          <SummaryLine
            label={f.vitLine}
            value={
              schedule.vit.passesThrough && schedule.vit.unitFactor !== null
                ? fillTemplate(f.vitPassesOn, { factor: String(schedule.vit.unitFactor) })
                : f.vitNone
            }
            citation={VIT_REIMBURSEMENT.shortCitation}
            change={f.change}
            onChange={() => setEditing("vit")}
          />
          <SummaryLine label={f.financeLine} value={yesNo(schedule.writesFinanceContracts)} change={f.change} onChange={() => setEditing("finance")} />
          <SummaryLine label={f.ch345Line} value={yesNo(schedule.financesCh345)} change={f.change} onChange={() => setEditing("ch345")} />
        </dl>
        <p className="ed-fine mt-5">
          {schedule.source === "owner" && schedule.savedByName
            ? fillTemplate(f.savedBy, { name: schedule.savedByName, date: (schedule.savedAt ?? "").slice(0, 10) })
            : f.notSavedYet}
        </p>
        <button type="button" className="ed-btn ed-btn-dark mt-5" onClick={() => setEditing("finance")}>
          {f.reviewQuestion}
        </button>
      </section>

      <section className="ed-admin-panel mt-6 p-6 md:p-7">
        <p className="ed-fine">{f.rule}</p>
        <p className="mt-4">
          <Link className="tj-action-base tj-action-secondary tj-action-md" href="/admin/dealership/fees/notice">
            {f.noticeLink}
          </Link>
        </p>
      </section>

      <section className="ed-admin-panel mt-6 p-6 md:p-7" aria-label={f.history}>
        <h2 className="ed-field-label">{f.history}</h2>
        {historyUnreadable || changes.length === 0 ? (
          <p className="ed-fine mt-3">{f.historyEmpty}</p>
        ) : (
          <ul className="ed-fee-history" data-fee-history="">
            {changes.map((change) => (
              <li key={change.id}>
                {fillTemplate(f.historyLine, {
                  date: change.changedAt.slice(0, 10),
                  name: change.changedByName,
                  from: cents(change.previous?.docFeeCents),
                  to: cents(change.next.docFeeCents),
                })}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  citation,
  change,
  onChange,
}: {
  label: string;
  value: string;
  citation?: string;
  change: string;
  onChange: () => void;
}) {
  return (
    <div className="ed-money-line ed-fee-line">
      <dt>
        {label}
        {citation ? <span className="ed-fee-citation">{citation}</span> : null}
      </dt>
      <dd>
        {value}{" "}
        <button type="button" className="ed-money-adjust ed-fee-change" onClick={onChange}>
          {change}
        </button>
      </dd>
    </div>
  );
}
