import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHero } from '../components/PageHero';
import { photoFocus, photos } from '../data/media';
import { VehicleCard } from '../components/VehicleCard';
import type { BodyStyle } from '../data/inventory';
import { getInventory } from '../lib/inventoryStore';
import { useReveal } from '../lib/useReveal';

const BODIES: (BodyStyle | 'All')[] = ['All', 'SUV', 'Sedan', 'Truck', 'Coupe'];
const SORTS = {
  featured: 'Curated',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  'miles-asc': 'Lowest miles',
  'year-desc': 'Newest first',
} as const;
type SortKey = keyof typeof SORTS;

export function Inventory() {
  const [params, setParams] = useSearchParams();
  const body = (params.get('body') as BodyStyle | null) ?? 'All';
  const sort = (params.get('sort') as SortKey | null) ?? 'featured';
  const make = params.get('make') ?? 'All';
  const q = params.get('q') ?? '';
  const all = getInventory();
  const makes = useMemo(() => ['All', ...Array.from(new Set(all.map((v) => v.make))).sort()], [all]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = all.filter(
      (v) =>
        (body === 'All' || v.body === body) &&
        (make === 'All' || v.make === make) &&
        (!needle || `${v.year ?? ''} ${v.make} ${v.model} ${v.trim ?? ''} ${v.exterior ?? ''}`.toLowerCase().includes(needle)),
    );
    const sorted = [...filtered];
    if (sort === 'price-asc') sorted.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    if (sort === 'price-desc') sorted.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
    if (sort === 'miles-asc') sorted.sort((a, b) => (a.mileage ?? Infinity) - (b.mileage ?? Infinity));
    if (sort === 'year-desc') sorted.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    if (sort === 'featured') sorted.sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
    return sorted;
  }, [all, body, make, q, sort]);

  useReveal([list.length, body, make, sort, q]);

  const set = (k: string, v: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (v === fallback || !v) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHero
        title="The Collection."
        lede="Clear prices, honest miles, and a team that answers the phone. Something caught your eye? Text us the stock number."
        kind="studio"
        body="Sedan"
        paint="#15171b"
        photo={photos.inventory}
        focus={photoFocus.inventory}
      />

      <section className="band band--white band--tight">
        <div className="container">
          <div className="filters">
            <div className="chips" role="group" aria-label="Body style">
              {BODIES.map((b) => (
                <button key={b} className={`chip ${body === b ? 'chip--on' : ''}`} onClick={() => set('body', b, 'All')} aria-pressed={body === b}>
                  {b === 'All' ? 'All' : `${b}s`}
                </button>
              ))}
            </div>
            <div className="filters__right">
              <label className="field field--inline">
                <span className="sr-only">Search</span>
                <input type="search" placeholder="Search make, model, color" value={q} onChange={(e) => set('q', e.target.value, '')} />
              </label>
              <label className="field field--inline">
                <span className="sr-only">Make</span>
                <select value={make} onChange={(e) => set('make', e.target.value, 'All')}>
                  {makes.map((m) => (
                    <option key={m} value={m}>
                      {m === 'All' ? 'All makes' : m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field field--inline">
                <span className="sr-only">Sort</span>
                <select value={sort} onChange={(e) => set('sort', e.target.value, 'featured')}>
                  {Object.entries(SORTS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <p className="results" aria-live="polite">
            {list.length} {list.length === 1 ? 'vehicle' : 'vehicles'}
          </p>
          {list.length ? (
            <div className="grid grid--3">
              {list.map((v, i) => (
                <VehicleCard key={v.slug} v={v} index={i} />
              ))}
            </div>
          ) : (
            <div className="empty">
              <h3>Nothing matches that search yet.</h3>
              <p>New vehicles arrive every week. Tell us what you’re looking for and we’ll call when it lands.</p>
              <button className="btn btn--outline" onClick={() => setParams({}, { replace: true })}>
                Clear filters
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
