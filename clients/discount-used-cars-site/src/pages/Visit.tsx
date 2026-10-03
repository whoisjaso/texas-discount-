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
        lede="Walk the lot, sit in the car, bring your trade. We’re on the Gulf Freeway feeder, Tuesday through Saturday."
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
                    {business.hours.map((h) => (
                      <span key={h.days}>
                        <br />
                        {h.days}, {h.time}
                      </span>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>
                    <a href={business.phoneHref}>{business.phoneDisplay}</a>
                  </dd>
                </div>
                {business.payments.length > 0 && (
                  <div>
                    <dt>We accept</dt>
                    <dd>{business.payments.join(' · ')}</dd>
                  </div>
                )}
              </dl>
              <div className="page-hero__cta">
                <a className="btn btn--light" href={business.mapsHref} target="_blank" rel="noreferrer">
                  Get directions
                </a>
                {business.smsHref ? (
                  <a className="btn btn--frost" href={business.smsHref}>
                    Text us
                  </a>
                ) : (
                  <a className="btn btn--frost" href={business.phoneHref}>
                    Call {business.phoneDisplay}
                  </a>
                )}
              </div>
            </div>
            <Scene kind="dusk" photo={photos.visit} focus={photoFocus.visit} alt="A Houston freeway frontage road at dusk" className="split-card__scene" />
          </div>
        </div>
      </section>

      <section className="band band--surface" id="reviews">
        <div className="container">
          <h2 className="band__title reveal">
            {business.rating.score} out of 5, from {business.rating.count} Google reviews
          </h2>
          <p className="band__fine reveal">{business.rating.note}</p>
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
            <p className="lede">Leave a note and a number. A real person from our team will call you back.{business.spanish && ' Se habla español.'}</p>
          </div>
          <div className="form-card reveal">
            <LeadForm
              type="contact"
              fields={[
                { name: 'topic', label: 'Topic', type: 'select', options: ['Buying a vehicle', 'Financing', 'Selling / trade-in', 'Something else'], required: true },
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
