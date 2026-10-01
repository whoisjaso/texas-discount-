import { Link } from 'react-router-dom';
import { currency, estimatePayment, metaLine, priceLabel, vehicleTitle, type Vehicle } from '../data/inventory';
import { CarSilhouette } from './CarSilhouette';
import { IconArrowRight } from './Icons';

/** The vehicle on a pale studio sweep, or its first photograph. */
export function VehicleStage({ v, large = false }: { v: Vehicle; large?: boolean }) {
  return (
    <div className={`stage ${large ? 'stage--large' : ''}`}>
      {v.photos?.length ? (
        <img src={v.photos[0]} alt={vehicleTitle(v)} loading="lazy" style={v.coverFocus ? { objectPosition: v.coverFocus } : undefined} />
      ) : (
        <>
          <CarSilhouette body={v.body} paint={v.paint} className="stage__car" title={vehicleTitle(v)} />
          <span className="stage__note">Photos on request</span>
        </>
      )}
    </div>
  );
}

export function VehicleCard({ v, index = 0 }: { v: Vehicle; index?: number }) {
  return (
    <article className="vcard reveal" style={{ transitionDelay: `${(index % 3) * 0.06}s` }}>
      <Link to={`/inventory/${v.slug}`} className="vcard__link">
        <VehicleStage v={v} />
        <div className="vcard__body">
          <p className="vcard__make">{v.make}</p>
          <h3 className="vcard__title">
            {v.year ? `${v.year} ` : ''}{v.model}
            {v.trim && <span> {v.trim}</span>}
          </h3>
          {metaLine(v) && <p className="vcard__meta">{metaLine(v)}</p>}
          <div className="vcard__foot">
            <div>
              <strong>{priceLabel(v)}</strong>
              {v.price ? <span>est. {currency(estimatePayment(v.price))}/mo</span> : <span>Ask about easy credit</span>}
            </div>
            <span className="arrow-btn arrow-btn--ink" aria-hidden="true">
              <IconArrowRight size={18} />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
