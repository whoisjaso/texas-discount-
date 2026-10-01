import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LeadForm } from '../components/LeadForm';
import { PageHero } from '../components/PageHero';
import { photoFocus, photos } from '../data/media';
import { currency, priceLabel, vehicleTitle } from '../data/inventory';
import { getVehicle } from '../lib/inventoryStore';
import { useReveal } from '../lib/useReveal';

function Calculator({ initialPrice }: { initialPrice: number }) {
  const [price, setPrice] = useState(initialPrice);
  const [down, setDown] = useState(Math.round(initialPrice * 0.15));
  const [months, setMonths] = useState(48);
  const [apr, setApr] = useState(12.9);

  const monthly = useMemo(() => {
    const principal = Math.max(0, price - down);
    const r = apr / 100 / 12;
    if (!principal) return 0;
    if (!r) return principal / months;
    return (principal * r) / (1 - Math.pow(1 + r, -months));
  }, [price, down, months, apr]);

  return (
    <div className="calc calc--full">
      <div className="calc__out calc__out--top">
        <span className="calc__num">{currency(Math.round(monthly))}</span>
        <span className="calc__per">/ month, estimated</span>
      </div>
      <label className="calc__row">
        <span>Vehicle price</span>
        <strong>{currency(price)}</strong>
      </label>
      <input className="range" type="range" min={5000} max={70000} step={250} value={price} onChange={(e) => setPrice(Number(e.target.value))} aria-label="Vehicle price" />
      <label className="calc__row">
        <span>Down payment</span>
        <strong>{currency(down)}</strong>
      </label>
      <input className="range" type="range" min={0} max={Math.round(price * 0.6)} step={250} value={Math.min(down, Math.round(price * 0.6))} onChange={(e) => setDown(Number(e.target.value))} aria-label="Down payment" />
      <div className="calc__pair">
        <label className="field">
          <span>Term</span>
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {[24, 36, 48, 60, 72].map((m) => (
              <option key={m} value={m}>
                {m} months
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>APR %</span>
          <input type="number" min={0} max={30} step={0.1} value={apr} onChange={(e) => setApr(Number(e.target.value) || 0)} />
        </label>
      </div>
      <p className="fine">Estimate only, before tax, title and fees. Your actual rate and terms depend on credit approval.</p>
    </div>
  );
}

export function Financing() {
  useReveal();
  const [params] = useSearchParams();
  const vehicle = getVehicle(params.get('vehicle') ?? '');

  return (
    <>
      <PageHero
        title="The payment first. Then the car."
        lede="First car, fresh start, or a trade-in with a balance: we work with real situations. Starting the conversation won’t affect your credit."
        kind="road"
        body="SUV"
        paint="#9ba1a8"
        photo={photos.financing}
        focus={photoFocus.financing}
      />

      <section className="band band--white">
        <div className="container split">
          <div className="reveal">
            <h2 className="band__title band__title--left">Estimate your payment</h2>
            <Calculator initialPrice={vehicle?.price ?? 18000} />
            <div className="pillars">
              <div>
                <h3>Easy credit</h3>
                <p>Limited or bruised credit is welcome here. Steady income goes a long way.</p>
              </div>
              <div>
                <h3>Trade-ins</h3>
                <p>Bring your current vehicle. We’ll appraise it and apply the value to your deal.</p>
              </div>
              <div>
                <h3>Clear terms</h3>
                <p>You’ll see the payment, the term and the total before you sign anything.</p>
              </div>
            </div>
          </div>
          <div className="form-card reveal">
            <h2 className="h3">Get pre-qualified</h2>
            {vehicle && <p>For the {vehicleTitle(vehicle)} · {priceLabel(vehicle)}</p>}
            <LeadForm
              type="pre-qualification"
              vehicle={vehicle ? vehicleTitle(vehicle) + (vehicle.stock ? ` · ${vehicle.stock}` : '') : undefined}
              fields={[
                { name: 'income', label: 'Monthly income (approx.)', type: 'select', options: ['Under $2,000', '$2,000 – $3,000', '$3,000 – $4,500', '$4,500+'], half: true, required: true },
                { name: 'down', label: 'Down payment ready', type: 'select', options: ['Under $1,000', '$1,000 – $2,500', '$2,500 – $5,000', '$5,000+'], half: true, required: true },
                { name: 'employment', label: 'Time at job', type: 'select', options: ['Under 6 months', '6 – 12 months', '1 – 3 years', '3+ years', 'Self-employed'], half: true },
                { name: 'credit', label: 'Credit feels…', type: 'select', options: ['Strong', 'Fair', 'Rebuilding', 'No credit yet'], half: true },
              ]}
              messagePlaceholder="Anything else? Trade-in, vehicle you want, best time to call…"
              submitLabel="Start pre-qualification"
              successTitle="You’re in the queue."
            />
          </div>
        </div>
      </section>
    </>
  );
}
