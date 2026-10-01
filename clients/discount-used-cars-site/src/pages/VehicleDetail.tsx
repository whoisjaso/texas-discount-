import { Link, useParams } from 'react-router-dom';
import { LeadForm } from '../components/LeadForm';
import { PageHero } from '../components/PageHero';
import { photos } from '../data/media';
import { useState } from 'react';
import { VehicleCard, VehicleStage } from '../components/VehicleCard';
import { business } from '../data/business';
import { currency, estimatePayment, miles, priceLabel, vehicleTitle, type Vehicle } from '../data/inventory';
import { getInventory, getVehicle } from '../lib/inventoryStore';
import { useReveal } from '../lib/useReveal';

/** The main photo with a thumbnail strip beneath it; drawn stage when there are no photos. */
function Gallery({ v }: { v: Vehicle }) {
  const [active, setActive] = useState(0);
  const list = v.photos ?? [];
  if (list.length < 2) return <VehicleStage v={v} large />;
  return (
    <div className="gallery">
      <div className="stage stage--large">
        <img
          src={list[active]}
          alt={`${vehicleTitle(v)}, photo ${active + 1} of ${list.length}`}
          style={active === 0 && v.coverFocus ? { objectPosition: v.coverFocus } : undefined}
        />
      </div>
      <div className="gallery__thumbs" role="list">
        {list.map((src, i) => (
          <button
            key={src}
            role="listitem"
            className={`gallery__thumb ${i === active ? 'is-active' : ''}`}
            onClick={() => setActive(i)}
            aria-label={`Show photo ${i + 1}`}
            aria-current={i === active}
          >
            <img src={src} alt="" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function VehicleDetail() {
  const { slug = '' } = useParams();
  const v = getVehicle(slug);
  useReveal([slug]);

  if (!v) {
    return (
      <PageHero title="This one has already left the lot." kind="studio" body="Coupe" paint="#15171b" photo={photos.inventory}>
        <Link to="/inventory" className="btn btn--frost">
          Back to the Collection
        </Link>
      </PageHero>
    );
  }

  const title = vehicleTitle(v);
  const smsBody = encodeURIComponent(`Hi Vega's, I'm interested in the ${title}${v.stock ? ` (stock ${v.stock})` : ''}${v.price ? ` listed at ${currency(v.price)}` : ''}.`);
  const related = getInventory()
    .filter((o) => o.slug !== v.slug && (o.body === v.body || o.make === v.make))
    .slice(0, 3);
  const specs = ([
    ['Mileage', v.mileage ? miles(v.mileage) : undefined],
    ['Exterior', v.exterior],
    ['Interior', v.interior],
    ['Engine', v.engine],
    ['Transmission', v.transmission],
    ['Drivetrain', v.drivetrain],
    ['Body', v.body],
    ['Stock #', v.stock],
  ] as [string, string | undefined][]).filter((row): row is [string, string] => !!row[1]);

  return (
    <>
      <section className="detail">
        <div className="container">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link to="/inventory">The Collection</Link> <span>/</span> <span>{v.make}</span>
          </nav>
          <div className="detail__grid">
            <div>
              <Gallery v={v} />
            </div>
            <aside className="detail__panel">
              <p className="detail__make">{v.make}</p>
              <h1 className="detail__title">
                {v.year ? `${v.year} ` : ''}{v.model}
                {v.trim && <span> {v.trim}</span>}
              </h1>
              <div className="detail__price">
                <strong>{priceLabel(v)}</strong>
                {v.price ? <span>est. {currency(estimatePayment(v.price))}/mo with approved credit</span> : <span>Call or text for today’s price</span>}
              </div>
              <div className="detail__actions">
                <a className="btn btn--primary btn--block" href={`${business.smsHref}?&body=${smsBody}`}>
                  Text about this car
                </a>
                <a className="btn btn--outline btn--block" href={business.phoneHref}>
                  Call {business.phoneDisplay}
                </a>
                <Link className="btn btn--outline btn--block" to={`/financing?vehicle=${v.slug}`}>
                  Get pre-qualified
                </Link>
              </div>
              <ul className="chips chips--outline" aria-label="Highlights">
                {(v.highlights ?? []).map((h) => (
                  <li key={h} className="chip">{h}</li>
                ))}
              </ul>
            </aside>
          </div>

          <div className="detail__lower">
            <div className="reveal">
              <h2 className="h3">Specifications</h2>
              <dl className="specs">
                {specs.map(([k, val]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{val}</dd>
                  </div>
                ))}
              </dl>
              <p className="fine">
                Price excludes tax, title, license and dealer fees. Vehicle history report available on request. Please confirm availability before visiting.
              </p>
            </div>
            <div className="form-card reveal">
              <h2 className="h3">Schedule a viewing</h2>
              <p>Pick a time and we’ll have it pulled up front, washed and ready.</p>
              <LeadForm
                type="vehicle-inquiry"
                vehicle={v.stock ? `${title} · ${v.stock}` : title}
                fields={[
                  { name: 'when', label: 'Preferred day', type: 'select', options: ['Today', 'Tomorrow', 'This week', 'Just have questions'], half: true },
                  { name: 'trade', label: 'Trading in?', type: 'select', options: ['No', 'Yes'], half: true },
                ]}
                submitLabel="Request viewing"
                successTitle="Your viewing request is in."
              />
            </div>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="band band--surface">
          <div className="container">
            <h2 className="band__title band__title--left reveal">You may also consider.</h2>
            <div className="grid grid--3">
              {related.map((r, i) => (
                <VehicleCard key={r.slug} v={r} index={i} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
