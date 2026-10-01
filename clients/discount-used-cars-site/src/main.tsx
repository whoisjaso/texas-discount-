import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Link, RouterProvider } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PageHero } from './components/PageHero';
import { photoFocus, photos } from './data/media';
import { Financing } from './pages/Financing';
import { Glass } from './pages/Glass';
import { Home } from './pages/Home';
import { Inventory } from './pages/Inventory';
import { VehicleDetail } from './pages/VehicleDetail';
import { Visit } from './pages/Visit';
import '@fontsource/barlow-semi-condensed/400.css';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/600-italic.css';
import './styles/global.css';

function NotFound() {
  return (
    <PageHero title="Wrong turn off Galveston Road." kind="road" body="Sedan" paint="#15171b" photo={photos['not-found']} focus={photoFocus['not-found']}>
      <Link to="/" className="btn btn--frost">
        Return home
      </Link>
    </PageHero>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/inventory', element: <Inventory /> },
      { path: '/inventory/:slug', element: <VehicleDetail /> },
      { path: '/glass', element: <Glass /> },
      { path: '/financing', element: <Financing /> },
      { path: '/visit', element: <Visit /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
