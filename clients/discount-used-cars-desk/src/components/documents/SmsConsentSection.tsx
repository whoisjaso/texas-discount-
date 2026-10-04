import { type DocStrings, getDocStrings } from '@/lib/documents/i18n';

interface Props {
  checked?: boolean;
  strings?: DocStrings;
}

export default function SmsConsentSection({ checked, strings: stringsProp }: Props) {
  const t = stringsProp || getDocStrings('en');
  const s = t.shared;

  return (
    <div className="mb-10 p-6 border-2 border-[#1a1a1a]/20 rounded-sm print-section">
      <h3 className="text-sm font-bold tracking-widest uppercase text-[#1a1a1a] mb-4">
        {s.smsConsentTitle}
      </h3>
      <div className="flex items-start space-x-3">
        <div className="w-5 h-5 border-2 border-[#1a1a1a]/40 rounded-sm flex items-center justify-center shrink-0 mt-0.5">
          {checked && <span className="text-[#1a1a1a] text-xs font-bold">&#10003;</span>}
        </div>
        <div className="text-[11px] text-[color:var(--tj-ink)] leading-relaxed space-y-1.5">
          <p>{s.smsConsentText}</p>
          <p className="text-[10px] text-[color:var(--tj-muted)]">
            {s.smsConsentFrequency} {s.smsConsentStop} {s.smsConsentRates} {s.smsConsentNotRequired}
          </p>
        </div>
      </div>
    </div>
  );
}
