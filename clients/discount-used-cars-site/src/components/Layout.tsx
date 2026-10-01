import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { business, isOpenNow } from '../data/business';
import { Logo, Wordmark } from './Brand';
import { IconArrowRight, IconArrowUp, IconChat, IconClose, IconMenu, IconPhone, IconPin } from './Icons';
import { Loader } from './Loader';

// The sale desk is its own app; the menu links to its sign-in once it is deployed.
const deskUrl = (import.meta.env.VITE_DESK_URL as string | undefined)?.replace(/\/+$/, '');
const adminHref = deskUrl ? `${deskUrl}/admin/login` : null;

const NAV = [
  { to: '/inventory', label: 'The Collection', note: 'Pre-owned cars, trucks & SUVs' },
  { to: '/glass', label: 'Auto Glass', note: 'Windshield, door & back glass' },
  { to: '/financing', label: 'Financing', note: 'Easy credit, clear terms' },
  { to: '/visit', label: 'Visit & Contact', note: '7722 Galveston Rd, Houston' },
];

function Header({ onMenu, lightTop }: { onMenu: () => void; lightTop: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const solid = scrolled || lightTop;
  const openNow = isOpenNow();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`header ${solid ? 'header--solid' : ''}`}>
      <div className="header__bar">
        <button className="header__menu" onClick={onMenu} aria-haspopup="dialog" aria-controls="site-menu">
          <IconMenu size={22} />
          <span>Menu</span>
        </button>
        <Link to="/" className="header__brand" aria-label="Vega's Auto Sales and Glass Co., home">
          <Wordmark compact />
        </Link>
        <div className="header__tools">
          <span className={`status ${openNow ? 'status--open' : ''}`}>
            <span className="status__dot" />
            {openNow ? 'Open now' : 'Opens 9 AM'}
          </span>
          <a className="header__icon" href={business.phoneHref} aria-label={`Call ${business.phoneDisplay}`}>
            <IconPhone size={22} />
          </a>
          <a className="header__icon" href={business.mapsHref} target="_blank" rel="noreferrer" aria-label="Directions">
            <IconPin size={22} />
          </a>
        </div>
      </div>
    </header>
  );
}

function MenuDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const openNow = isOpenNow();

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={`drawer ${open ? 'drawer--open' : ''}`} aria-hidden={!open} inert={!open}>
      <div className="drawer__scrim" onClick={onClose} />
      <div className="drawer__panel" id="site-menu" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="drawer__top">
          <button ref={closeRef} className="drawer__close" onClick={onClose} aria-label="Close menu">
            <IconClose size={24} />
          </button>
          <Logo size={52} />
        </div>
        <nav className="drawer__nav" aria-label="Primary">
          {NAV.map((n, i) => (
            <NavLink key={n.to} to={n.to} className="drawer__link" style={{ transitionDelay: open ? `${0.06 * i + 0.12}s` : '0s' }}>
              <span>
                {n.label}
                <small>{n.note}</small>
              </span>
              <IconArrowRight size={22} />
            </NavLink>
          ))}
          {adminHref && (
            <a
              href={adminHref}
              className="drawer__link drawer__link--admin"
              style={{ transitionDelay: open ? `${0.06 * NAV.length + 0.12}s` : '0s' }}
            >
              <span>
                Admin
                <small>Staff sign-in to the sale desk</small>
              </span>
              <IconArrowRight size={22} />
            </a>
          )}
        </nav>
        <div className="drawer__foot">
          <a className="btn btn--primary btn--block" href={business.phoneHref}>
            Call {business.phoneDisplay}
          </a>
          <a className="btn btn--outline btn--block" href={business.smsHref}>
            Text us
          </a>
          <p>
            <span className={`status status--ink ${openNow ? 'status--open' : ''}`}>
              <span className="status__dot" />
              {openNow ? 'Open now' : 'Closed now'}
            </span>
            <br />
            Monday – Saturday, 9 AM – 6 PM
            <br />
            {business.street}, {business.cityLine}
            <br />
            Se habla español
          </p>
        </div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <button className="footer__up" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <IconArrowUp size={22} />
          <span>Scroll up</span>
        </button>

        <div className="footer__grid">
          <div>
            <h2 className="footer__head">Visit</h2>
            <p>
              {business.street}
              <br />
              {business.cityLine}
              <br />
              <span className="footer__mute">{business.crossStreets}</span>
            </p>
            <a className="footer__link" href={business.mapsHref} target="_blank" rel="noreferrer">
              Get directions
            </a>
          </div>
          <div>
            <h2 className="footer__head">Hours</h2>
            {business.hours.map((h) => (
              <p key={h.days}>
                {h.days}
                <br />
                <span className="footer__mute">{h.time}</span>
              </p>
            ))}
          </div>
          <div>
            <h2 className="footer__head">Contact</h2>
            <a className="footer__link" href={business.phoneHref}>
              {business.phoneDisplay}
            </a>
            <a className="footer__link" href={business.smsHref}>
              Text us
            </a>
            <a className="footer__link" href={business.facebookHref} target="_blank" rel="noreferrer">
              Facebook
            </a>
            <p className="footer__mute">Se habla español</p>
          </div>
          <div>
            <h2 className="footer__head">Explore</h2>
            {NAV.map((n) => (
              <Link key={n.to} className="footer__link" to={n.to}>
                {n.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="footer__base">
          <Logo size={44} />
          <p>© {new Date().getFullYear()} {business.name}</p>
          <p className="footer__mute">
            {business.legalName} · Texas Dealer License (GDN) {business.dealerLicense}
          </p>
          <p className="footer__mute">
            Brand names describe pre-owned vehicles we sell; Vega’s is an independent dealer. Prices exclude tax, title, license and fees.
          </p>
        </div>
      </div>
    </footer>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

function MobileDock() {
  return (
    <nav className="dock" aria-label="Quick contact">
      <a href={business.phoneHref}>
        <IconPhone size={20} />
        Call
      </a>
      <a href={business.smsHref}>
        <IconChat size={20} />
        Text
      </a>
      <a href={business.mapsHref} target="_blank" rel="noreferrer">
        <IconPin size={20} />
        Directions
      </a>
    </nav>
  );
}

export function Layout() {
  const [menu, setMenu] = useState(false);
  const close = useCallback(() => setMenu(false), []);
  const location = useLocation();
  useEffect(() => setMenu(false), [location.pathname]);

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Loader />
      <ScrollToTop />
      <Header onMenu={() => setMenu(true)} lightTop={/^\/inventory\/.+/.test(location.pathname)} />
      <MenuDrawer open={menu} onClose={close} />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
      <MobileDock />
    </>
  );
}
