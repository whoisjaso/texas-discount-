import { GlassReveal } from '../components/GlassReveal';
import { LeadForm } from '../components/LeadForm';
import { PageHero } from '../components/PageHero';
import { photoFocus, photos } from '../data/media';
import { business } from '../data/business';
import { useReveal } from '../lib/useReveal';

const SERVICES = [
  {
    title: 'Windshield replacement',
    body: 'Cracks spread with Houston heat and potholes. We remove the damaged glass, prep the frame and set a new windshield with a proper urethane seal.',
  },
  {
    title: 'Door & quarter glass',
    body: 'Shattered side window after a break-in? We clear the door, vacuum the glass out of the cabin and fit a new pane.',
  },
  {
    title: 'Back glass',
    body: 'Rear windows for sedans, SUVs and pickup sliders, with defroster lines where your vehicle calls for them.',
  },
  {
    title: 'Fleet & work trucks',
    body: 'Keep contractors and fleets on the road. Ask about scheduling several vehicles at once.',
  },
];

const STEPS = [
  ['Send the details', 'Year, make, model and which glass. A photo helps.'],
  ['Get your quote', 'We confirm the part and the price before any work begins.'],
  ['Drive in', 'Bring it to 7722 Galveston Rd at your scheduled time.'],
  ['See clearly', 'We check the fit and seal, clean up, and let you know how long to wait before driving.'],
];

export function Glass() {
  useReveal();
  return (
    <>
      <PageHero
        title="Nothing between you and the road."
        lede="Auto glass replacement from the same team that sells your next car. We quote clearly, fit carefully and seal it right."
        kind="glass"
        photo={photos.glass}
        focus={photoFocus.glass}
      >
        <div className="page-hero__cta">
          <a href="#quote" className="btn btn--light">
            Request a quote
          </a>
          <a href={business.phoneHref} className="btn btn--frost">
            {business.phoneDisplay}
          </a>
        </div>
      </PageHero>

      <section className="band band--black band--tight">
        <div className="container glass-band__grid">
          <div className="glass-band__copy reveal">
            <h2 className="band__title band__title--left">See the difference.</h2>
            <p>A stone strike spreads fast in Houston heat. Drag across the windshield to compare a cracked pane with a clean replacement.</p>
          </div>
          <div className="glass-band__demo reveal">
            <GlassReveal before={photos['glass-before']} after={photos['glass-after']} />
            <p className="caption">Drag across the glass to compare.</p>
          </div>
        </div>
      </section>

      <section className="band band--white">
        <div className="container">
          <h2 className="band__title reveal">What we replace</h2>
          <div className="services">
            {SERVICES.map((s, i) => (
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
          <h2 className="band__title reveal">Four steps to a clear view</h2>
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

      <section className="band band--white" id="quote">
        <div className="container split">
          <div className="reveal">
            <h2 className="band__title band__title--left">Tell us about the glass.</h2>
            <p className="lede">
              We’ll confirm the right part for your vehicle and text back a price. Prefer to talk? Call {business.phoneDisplay}, Monday through Saturday.
            </p>
            <p>Bought your car from us? Tell us. We take care of our customers first.</p>
          </div>
          <div className="form-card reveal">
            <LeadForm
              type="glass-quote"
              fields={[
                { name: 'vehicle', label: 'Year, make & model', placeholder: 'e.g. 2016 Honda Accord', required: true },
                {
                  name: 'glass',
                  label: 'Which glass?',
                  type: 'select',
                  options: ['Windshield', 'Driver door', 'Passenger door', 'Rear door', 'Quarter / vent', 'Back glass', 'Not sure'],
                  required: true,
                  half: true,
                },
                { name: 'insurance', label: 'Using insurance?', type: 'select', options: ['No, paying myself', 'Yes', 'Not sure'], half: true },
              ]}
              messagePlaceholder="Anything we should know: sensors, rain-sensing wipers, tint, damage size…"
              submitLabel="Get my glass quote"
              successTitle="Quote request received."
            />
          </div>
        </div>
      </section>
    </>
  );
}
