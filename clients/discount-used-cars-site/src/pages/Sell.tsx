import { LeadForm } from '../components/LeadForm';
import { PageHero } from '../components/PageHero';
import { photoFocus, photos } from '../data/media';
import { business } from '../data/business';
import { useReveal } from '../lib/useReveal';

const WHAT = [
  {
    title: 'Cars',
    body: 'Sedans, hatchbacks and coupes, from daily drivers to second cars that sit more than they run.',
  },
  {
    title: 'Trucks',
    body: 'Half-tons, crew cabs and work pickups. Tell us the cab, the bed and the miles.',
  },
  {
    title: 'SUVs & minivans',
    body: 'Two and three rows, family haulers and commuters.',
  },
  {
    title: 'Trade-ins',
    body: 'Buying from us? Bring your current vehicle and we’ll apply its value to your deal.',
  },
];

const STEPS = [
  ['Send the details', 'Year, make, model, miles and a few photos.'],
  ['Get an offer', 'We look it over and tell you what we can pay or allow on a trade.'],
  ['Bring it by', `Drive it to ${business.street} with the title and your ID.`],
  ['Done', 'Sell it outright, or put the value toward your next car or truck.'],
];

export function Sell() {
  useReveal();
  return (
    <>
      <PageHero
        title="We buy cars."
        lede="Selling outright or trading toward your next one. Tell us about your car, truck or SUV and bring it by the lot for an offer."
        kind="road"
        body="Truck"
        paint="#2a2d31"
        photo={photos.sell}
        focus={photoFocus.sell}
      >
        <div className="page-hero__cta">
          <a href="#offer" className="btn btn--light">
            Get an offer
          </a>
          <a href={business.phoneHref} className="btn btn--frost">
            {business.phoneDisplay}
          </a>
        </div>
      </PageHero>

      <section className="band band--white">
        <div className="container">
          <h2 className="band__title reveal">What we buy</h2>
          <div className="services">
            {WHAT.map((s, i) => (
              <article key={s.title} className="service reveal" style={{ transitionDelay: `${i * 0.07}s` }}>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="band band--surface">
        <div className="container">
          <h2 className="band__title reveal">Four steps to sold</h2>
          <ol className="steps">
            {STEPS.map(([t, b], i) => (
              <li key={t} className="step reveal" style={{ transitionDelay: `${i * 0.08}s` }}>
                <span className="step__n">0{i + 1}</span>
                <h3>{t}</h3>
                <p>{b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="band band--white" id="offer">
        <div className="container split">
          <div className="reveal">
            <h2 className="band__title band__title--left">Tell us about your vehicle.</h2>
            <p className="lede">
              We’ll look it over and get back to you with an offer. Prefer to talk? Call {business.phoneDisplay}, {business.hoursShort}.
            </p>
          </div>
          <div className="form-card reveal">
            <LeadForm
              type="trade-in"
              fields={[
                { name: 'vehicle', label: 'Year, make & model', placeholder: 'e.g. 2012 Ford F-150', required: true },
                { name: 'miles', label: 'Miles (approx.)', placeholder: 'e.g. 140,000', half: true, required: true },
                { name: 'plan', label: 'Selling or trading?', type: 'select', options: ['Selling outright', 'Trading in', 'Not sure yet'], half: true },
                { name: 'title', label: 'Title', type: 'select', options: ['Paid off, title in hand', 'Still owe on it', 'Not sure'], half: true },
                { name: 'runs', label: 'Does it run and drive?', type: 'select', options: ['Yes', 'Runs, needs work', 'Does not run'], half: true },
              ]}
              messagePlaceholder="Anything we should know: damage, warning lights, new tires…"
              submitLabel="Get my offer"
              successTitle="Offer request received."
            />
          </div>
        </div>
      </section>
    </>
  );
}
