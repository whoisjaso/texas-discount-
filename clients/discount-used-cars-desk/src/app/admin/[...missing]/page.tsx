import { notFound } from "next/navigation";

/**
 * Any /admin address no screen answers (an old link, a typed address).
 *
 * Without this, Next answered such an address with its own unstyled 404,
 * outside the desk; caught here, it renders the desk's not-found
 * (`admin/not-found.tsx`) inside the admin layout, with the way back. It
 * never renders a screen of its own: every real route is more specific.
 */
export default function MissingAdminPage(): never {
  notFound();
}
