import { useState, type FormEvent } from 'react';
import { business } from '../data/business';
import { submitLead, type LeadType } from '../lib/leads';

export interface ExtraField {
  name: string;
  label: string;
  type?: 'text' | 'select' | 'number';
  options?: string[];
  placeholder?: string;
  required?: boolean;
  half?: boolean;
}

interface Props {
  type: LeadType;
  vehicle?: string;
  fields?: ExtraField[];
  submitLabel?: string;
  messagePlaceholder?: string;
  successTitle?: string;
}

export function LeadForm({
  type,
  vehicle,
  fields = [],
  submitLabel = 'Send',
  messagePlaceholder = 'How can we help?',
  successTitle = 'Received. We’ll be in touch shortly.',
}: Props) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const get = (k: string) => String(data.get(k) ?? '').trim();
    const details: Record<string, string> = {};
    fields.forEach((f) => {
      const val = get(f.name);
      if (val) details[f.label] = val;
    });
    setState('sending');
    try {
      await submitLead({
        type,
        vehicle,
        name: get('name'),
        phone: get('phone'),
        email: get('email') || undefined,
        message: get('message') || undefined,
        details,
      });
      setState('sent');
    } catch {
      setState('error');
    }
  }

  if (state === 'sent') {
    return (
      <div className="form-success" role="status">
        <div className="form-success__mark" aria-hidden="true" />
        <h3>{successTitle}</h3>
        <p>
          During business hours we typically reply within the hour. Need us sooner? Call{' '}
          <a href={business.phoneHref}>{business.phoneDisplay}</a>.
        </p>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <div className="form__grid">
        <label className="field field--half">
          <span>Full name</span>
          <input name="name" required autoComplete="name" />
        </label>
        <label className="field field--half">
          <span>Mobile</span>
          <input name="phone" type="tel" required autoComplete="tel" inputMode="tel" />
        </label>
        <label className="field">
          <span>Email (optional)</span>
          <input name="email" type="email" autoComplete="email" />
        </label>
        {fields.map((f) => (
          <label key={f.name} className={`field ${f.half ? 'field--half' : ''}`}>
            <span>{f.label}</span>
            {f.type === 'select' ? (
              <select name={f.name} required={f.required} defaultValue="">
                <option value="" disabled>
                  Select
                </option>
                {f.options?.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input name={f.name} type={f.type ?? 'text'} placeholder={f.placeholder} required={f.required} />
            )}
          </label>
        ))}
        <label className="field">
          <span>Message</span>
          <textarea name="message" rows={3} placeholder={messagePlaceholder} />
        </label>
      </div>
      <button className="btn btn--primary btn--block" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : submitLabel}
      </button>
      {state === 'error' && (
        <p className="form__error" role="alert">
          Something went wrong. Please call {business.phoneDisplay} and we’ll take care of you directly.
        </p>
      )}
      <p className="form__fine">
        By sending, you agree Vega’s may contact you by call or text about your request. Message and data rates may apply.
      </p>
    </form>
  );
}
