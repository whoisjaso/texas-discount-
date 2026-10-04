/**
 * Routes that take over the whole screen, with no admin chrome around them.
 *
 * The whole sale, from picking the car to filing the title.
 *
 * A corridor: one question to a screen, no rail, no bottom bar. While a sale is
 * being written there is nothing else to click, so there is nothing else to be
 * distracted by. The rail is still reachable by pushing the pointer at the left
 * edge, which is a deliberate gesture rather than a permanent target.
 *
 * This used to cover only the intake, which meant the corridor lasted one
 * screen and then handed the operator back to a full dashboard for every
 * question after it.
 *
 * One definition, here, shared. It used to live inside the admin layout, which
 * decides chrome on the server from an x-pathname header and therefore only on
 * a hard load. The client chrome needs the same test against the live pathname,
 * and two copies of this regex would drift the first time the corridor grew.
 */
export function isSaleFlowPath(pathname: string): boolean {
  if (pathname === "/admin/sales/new") return true;
  // The guide is the same corridor, and it was still being framed by the rail.
  // Walling off the intake and then handing the operator back to a sidebar for
  // every question after it is the fork, not the fix.
  // Paperwork is the same corridor by another name: the document steps used
  // to leave it for the templates section, and now they do not.
  //
  // The summary is the corridor's fast lane and the packet is its last
  // screen, and both draw the corridor's own chrome: their own Leave, their
  // own language pill. Framed by the dashboard as well, they carried two
  // navigation systems at once, and on a phone the fixed tab bar sat on top
  // of the answers and of the buttons that send the buyer their copy. The
  // packet's Leave already goes back to the deal, so the bar was never the
  // way out of anything.
  return /^\/admin\/sales\/[^/]+\/(guide|paperwork|summary|packet)(\/|$)/.test(
    pathname,
  );
}
