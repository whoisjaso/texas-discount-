import { LeadForm } from '../components/LeadForm';
import { PageHero } from '../components/PageHero';
import { Scene } from '../components/Scene';
import { business, isOpenNow } from '../data/business';
import { photoFocus, photos } from '../data/media';
import { useReveal } from '../lib/useReveal';

export function Visit() {
  useReveal();
  const openNow = isOpenNow();
  return (
    <>
      <PageHero
        title="Come see it in person."
        lede="Walk the lot, sit in the car, bring your vehicle in for glass. We’re on Galveston Road six days a week."
        kind="dusk"
        photo={photos.visit}
        focus={photoFocus.visit}
      />

      <section className="band band--white">
        <div className="container">
          <div className="split-card reveal">
            <div className="split-card__text">
              <h2>{business.street}</h2>
              <p>
                {business.cityLine}, in {business.neighborhood}. {business.crossStreets}.
              </p>
              <dl className="facts">
                <div>
                  <dt>Hours</dt>
                  <dd>
                    <span className={`status ${openNow ? 'status--open' : ''}`}>
                      <span className="status__dot" />
                      {openNow ? 'Open now' : 'Closed now'}
                    </span>
                    <br />
                    Monday – Saturday, 9 AM – 6 PM
                    <br />
                    Sunday closed
                  </dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>
                    <a href={business.phoneHref}>{business.phoneDisplay}</a>
                  </dd>
                </div>
                <div>
                  <dt>We accept</dt>
                  <dd>{business.payments.join(' · ')}</dd>
                </div>
              </dl>
              <div className="page-hero__cta">
                <a className="btn btn--light" href={business.mapsHref} target="_blank" rel="noreferrer">
                  Get directions
                </a>
                <a className="btn btn--frost" href={business.smsHref}>
                  Text us
                </a>
              </div>
            </div>
            <Scene kind="dusk" photo={photos.visit} focus={photoFocus.visit} alt="A car lot at dusk" className="split-card__scene" />
          </div>
        </div>
      </section>

      <section className="band band--surface" id="reviews">
        <div className="container">
          <h2 className="band__title reveal">
            {business.rating.score} out of 5, from {business.rating.count} Google reviews
          </h2>
          <div className="quotes">
            {business.reviews.map((r, i) => (
              <figure key={r.author} className="quote-card reveal" style={{ transitionDelay: `${i * 0.08}s` }}>
                <blockquote>“{r.quote}”</blockquote>
                {'translation' in r && r.translation && <p className="quote__tr">{r.translation}</p>}
                <figcaption>
                  {r.author}, via {r.source}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="band band--white">
        <div className="container split">
          <div className="reveal">
            <h2 className="band__title band__title--left">Questions, trade-ins, anything.</h2>
            <p className="lede">Leave a note and a number. A real person from our team will call or text you back. Se habla español.</p>
          </div>
          <div className="form-card reveal">
            <LeadForm
              type="contact"
              fields={[
                { name: 'topic', label: 'Topic', type: 'select', options: ['Buying a vehicle', 'Financing', 'Auto glass', 'Selling / trade-in', 'Something else'], required: true },
                { name: 'language', label: 'Preferred language', type: 'select', options: ['English', 'Español'], half: true },
                { name: 'contactBy', label: 'Best way to reach you', type: 'select', options: ['Text', 'Call', 'Email'], half: true },
              ]}
              submitLabel="Send message"
            />
          </div>
        </div>
      </section>
    </>
  );
}
