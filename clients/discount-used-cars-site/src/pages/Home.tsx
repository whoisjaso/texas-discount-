import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CarSilhouette } from '../components/CarSilhouette';
import { IconArrowDown, IconArrowRight, IconSearch } from '../components/Icons';
import { Scene } from '../components/Scene';
import { business, isOpenNow } from '../data/business';
import { currency, estimatePayment, vehicleTitle, type BodyStyle } from '../data/inventory';
import { heroFocus, photoFocus, photos, type PhotoSlot } from '../data/media';
import { getFeatured, getInventory } from '../lib/inventoryStore';
import { useReveal } from '../lib/useReveal';

/**
 * The opening: one fixed photograph, full screen, with the line set low-left.
 * It does not rotate, so every visitor lands on the same picture.
 */
function Hero() {
  return (
    <section className="hero" aria-label="Welcome">
      <Scene
        kind="studio"
        body="Truck"
        paint="#141518"
        photo={photos.hero}
        photoMobile={photos['hero-mobile']}
        focus={heroFocus}
        eager
        alt="A red pickup truck on an open Texas highway at sunset"
        className="hero__scene"
      />
      <div className="hero__copy container">
        <h1 className="hero__title">
          <span>Cars & trucks.</span>
          <span>For less.</span>
        </h1>
        <p className="hero__lede">Easy financing and fair prices at 8108 Gulf Freeway, Houston.</p>
        <div className="hero__cta">
          <Link to="/inventory" className="btn btn--light">
            Explore the inventory
          </Link>
          <Link to="/financing" className="btn btn--frost">
            Get pre-qualified
          </Link>
        </div>
      </div>
      <a className="hero__down" href="#after-hero" aria-label="Scroll to content">
        <IconArrowDown size={26} />
      </a>
    </section>
  );
}

function Teasers() {
  const picks = getFeatured().slice(0, 3);
  // No vehicles are listed yet: say so plainly rather than show sample cars.
  if (!picks.length) {
    return (
      <section className="band band--white" id="after-hero">
        <div className="container lot-note reveal">
          <h2 className="band__title">The lot changes daily.</h2>
          <p className="lot-note__lede">
            New arrivals post here as they land. For what’s on the lot right now, call <span className="nowrap">{business.phoneDisplay}</span>.
          </p>
          <div className="lot-note__cta">
            <a className="btn btn--primary" href={business.phoneHref}>
              Call {business.phoneDisplay}
            </a>
            <Link className="btn btn--outline" to="/inventory">
              Explore the collection
            </Link>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="band band--white" id="after-hero">
      <div className="container teasers">
        {picks.map((v, i) => (
          <Link key={v.slug} to={`/inventory/${v.slug}`} className="tile reveal" style={{ transitionDelay: `${i * 0.07}s` }}>
            <Scene kind="studio" body={v.body} paint={v.paint} photo={v.photos?.[0]} focus={v.coverFocus} alt={vehicleTitle(v)} className="tile__scene" />
            <span className="tile__label">
              {vehicleTitle(v)}.
            </span>
            <span className="arrow-btn" aria-hidden="true">
              <IconArrowRight size={18} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

const RANGE: { body: BodyStyle; name: string; line: string; paint: string }[] = [
  { body: 'SUV', name: 'SUVs', line: 'Room for the family and the week, at a payment that fits.', paint: '#e6e3dc' },
  { body: 'Sedan', name: 'Sedans', line: 'Daily drivers that are easy on gas and easy on the budget.', paint: '#1f3a6b' },
  { body: 'Truck', name: 'Trucks', line: 'Pickups ready to work, from half-tons to crew cabs.', paint: '#4b4f55' },
  { body: 'Coupe', name: 'Coupes', line: 'Two doors and a low roofline for the drive to work.', paint: '#8e1018' },
];

function Range() {
  const all = getInventory();
  return (
    <section className="band band--black">
      <div className="container">
        <h2 className="band__title reveal">Find your fit.</h2>
        <div className="lineup">
          {RANGE.map((r, i) => {
            const units = all.filter((v) => v.body === r.body);
            const priced = units.map((v) => v.price).filter((p): p is number => !!p);
            const from = priced.length ? Math.min(...priced) : undefined;
            // The category card keeps the art-directed showroom image so the four
            // cards match; a real vehicle's photo is the fallback when none exists.
            const slot = `body-${r.body.toLowerCase()}` as PhotoSlot;
            const cover = photos[slot] ? undefined : units.find((v) => v.photos?.length);
            return (
              <Link key={r.body} to={`/inventory?body=${r.body}`} className="model reveal" style={{ transitionDelay: `${(i % 2) * 0.08}s` }}>
                <Scene
                  kind="studio"
                  body={r.body}
                  paint={r.paint}
                  photo={photos[slot] ?? cover?.photos?.[0]}
                  focus={photos[slot] ? photoFocus[slot] : undefined}
                  alt={cover ? vehicleTitle(cover) : r.name}
                  className="model__scene"
                />
                <span className="model__sig">{r.name}</span>
                <span className="model__body">
                  <span className="chips chips--frost">
                    <span className="chip">{units.length ? `${units.length} in stock` : 'Ask about availability'}</span>
                    {from && <span className="chip">From {currency(estimatePayment(from))}/mo</span>}
                  </span>
                  <span className="model__line">{r.line}</span>
                  {from && <span className="model__price">From {currency(from)}*</span>}
                </span>
                <span className="arrow-btn" aria-hidden="true">
                  <IconArrowRight size={18} />
                </span>
              </Link>
            );
          })}
        </div>
        <p className="band__fine">
          *Advertised price. Excludes tax, title, license and dealer fees. Monthly figures are estimates at 15% down, 12.9% APR, 48 months, with approved credit.
        </p>
      </div>
    </section>
  );
}

function VisitCard() {
  const openNow = isOpenNow();
  return (
    <section className="band band--white">
      <div className="container">
        <div className="split-card reveal">
          <div className="split-card__text">
            <h2>Visit us on the Gulf Freeway</h2>
            <p>
              {business.street}, {business.cityLine}. {business.crossStreets}. Walk the lot, sit in the car, or bring yours in for an offer.
            </p>
            <p className="split-card__hours">
              <span className={`status ${openNow ? 'status--open' : ''}`}>
                <span className="status__dot" />
                {openNow ? 'Open now' : 'Closed now'}
              </span>{' '}
              {business.hoursShort}
            </p>
            <a className="btn btn--light" href={business.mapsHref} target="_blank" rel="noreferrer">
              Get directions
            </a>
          </div>
          <Scene kind="dusk" photo={photos.visit} focus={photoFocus.visit} alt="The Discount Used Cars and Trucks lot on the Gulf Freeway" className="split-card__scene" />
        </div>
      </div>
    </section>
  );
}

function Finder() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/inventory?q=${encodeURIComponent(q.trim())}` : '/inventory');
  };
  return (
    <section className="band band--white finder">
      <div className="container finder__grid">
        <div className="reveal">
          <h2 className="finder__title">Find your next pre-owned vehicle.</h2>
          <p className="finder__lede">Search the lot by make, model or colour. Every price is shown plainly, or call for today’s price.</p>
          <form className="search" onSubmit={submit} role="search">
            <label htmlFor="finder-q" className="search__label">
              Make, model or colour
            </label>
            <div className="search__field">
              <IconSearch size={20} />
              <input id="finder-q" type="search" placeholder="e.g. Toyota, F-150, silver" value={q} onChange={(e) => setQ(e.target.value)} />
              <button type="submit" className="btn btn--primary btn--sm">
                Search
              </button>
            </div>
          </form>
        </div>
        <div className="finder__cars" aria-hidden="true">
          {photos.finder ? (
            <img className="finder__photo" src={photos.finder} alt="" loading="lazy" decoding="async" />
          ) : (
            <>
              <CarSilhouette body="SUV" paint="#f5f5f4" className="finder__car finder__car--1" />
              <CarSilhouette body="Sedan" paint="#f5f5f4" className="finder__car finder__car--2" />
              <CarSilhouette body="Truck" paint="#f5f5f4" className="finder__car finder__car--3" />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

const BUY: { title: string; slot: PhotoSlot; body: BodyStyle }[] = [
  { title: 'We buy cars', slot: 'sell-cars', body: 'Sedan' },
  { title: 'We buy trucks', slot: 'sell-trucks', body: 'Truck' },
  { title: 'We buy SUVs', slot: 'sell-suvs', body: 'SUV' },
];

function SellBand() {
  return (
    <section className="band band--black glass-band">
      <div className="container glass-band__grid">
        <div className="glass-band__copy reveal">
          <h2 className="band__title band__title--left">We buy cars, too.</h2>
          <p>
            Selling outright or trading toward your next one: tell us the year, make, model and miles, and bring it by the lot for an offer.
          </p>
          <Link to="/sell" className="text-link">
            Go to We Buy Cars <IconArrowRight size={18} />
          </Link>
        </div>
        <div className="glass-band__demo reveal">
          <Scene kind="road" body="Truck" paint="#2a2d31" photo={photos['sell-band']} focus={photoFocus['sell-band']} alt="A car key handed over the hood of a pickup" className="sell-band__scene" />
        </div>
      </div>
      <div className="container teasers teasers--dark">
        {BUY.map((g, i) => (
          <Link key={g.title} to="/sell" className="tile tile--glass reveal" style={{ transitionDelay: `${i * 0.07}s` }}>
            <Scene kind="studio" body={g.body} paint="#3a3d42" photo={photos[g.slot]} focus={photoFocus[g.slot]} alt={g.title} className="tile__scene" />
            <span className="tile__label">{g.title}</span>
            <span className="arrow-btn" aria-hidden="true">
              <IconArrowRight size={18} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Discover() {
  const [quote, setQuote] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setQuote((q) => (q + 1) % business.reviews.length), 6000);
    return () => window.clearInterval(t);
  }, []);
  const r = business.reviews[quote];
  return (
    <section className="band band--white">
      <div className="container">
        <h2 className="band__title reveal">Discover</h2>
        <div className="teasers">
          <Link to="/financing" className="tile tile--type reveal">
            <span className="tile__type">
              {currency(estimatePayment(9000))}
              <small>/mo</small>
            </span>
            <span className="tile__label">Easy financing</span>
            <span className="arrow-btn" aria-hidden="true">
              <IconArrowRight size={18} />
            </span>
          </Link>
          <Link to="/visit" className="tile tile--type tile--type-warm reveal" style={{ transitionDelay: '0.07s' }}>
            <span className="tile__type">
              {business.rating.score}
              <small>/5</small>
            </span>
            <span className="tile__label">{business.rating.count} Google reviews</span>
            <span className="arrow-btn" aria-hidden="true">
              <IconArrowRight size={18} />
            </span>
          </Link>
          {business.spanish && (
            <Link to="/visit" className="tile tile--type tile--type-cool reveal" style={{ transitionDelay: '0.14s' }}>
              <span className="tile__type">Hola.</span>
              <span className="tile__label">Se habla español</span>
              <span className="arrow-btn" aria-hidden="true">
                <IconArrowRight size={18} />
              </span>
            </Link>
          )}
        </div>

        <figure className="quote reveal" aria-live="polite">
          <blockquote key={quote}>“{r.quote}”</blockquote>
          {'translation' in r && r.translation && <p className="quote__tr">{r.translation}</p>}
          <figcaption>
            {r.author}, via {r.source}
          </figcaption>
        </figure>
        <p className="band__fine reveal">{business.rating.note}</p>
      </div>
    </section>
  );
}

export function Home() {
  useReveal();
  return (
    <>
      <Hero />
      <Teasers />
      <Range />
      <VisitCard />
      <Finder />
      <SellBand />
      <Discover />
    </>
  );
}
