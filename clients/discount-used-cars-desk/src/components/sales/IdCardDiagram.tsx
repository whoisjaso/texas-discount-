/**
 * What to photograph, drawn rather than described.
 *
 * Before anything has been scanned there are two empty places on the intake
 * screen where the pictures will go, and an empty place explains nothing. These
 * two diagrams sit in them: a card with a portrait on it, and a card with a
 * barcode on it, captioned Front and Back. Somebody who has never used this
 * software before can see what is wanted without reading a sentence.
 *
 * Drawn, deliberately, rather than a photograph of a real licence. A real one
 * is somebody's identity document, and a realistic facsimile of a Texas card is
 * a thing this product has no business shipping. What is needed here is the
 * layout, not the article: where the face sits, where the barcode sits, and
 * that there are two sides. A line drawing says that better than a photograph
 * would, because nothing in it competes with the instruction.
 *
 * Both cards are at the real proportion, 85.6mm by 53.98mm, which is the same
 * ratio the scanner's own cutout uses. The shapes a dealer sees here are the
 * shapes they will be lining a card up inside a minute later.
 */

/** The real card, in millimetres, as the viewBox. */
const W = 856;
const H = 540;

/**
 * Bar widths for the barcode block.
 *
 * Written out rather than generated, because a component that randomises its
 * own drawing produces a different picture on the server and the client, and
 * React calls that a hydration error. Irregular on purpose: a PDF417 is not a
 * repeating pattern, and a barcode drawn as even stripes reads as a decoration.
 */
const BARS = [
  7, 3, 11, 4, 6, 14, 3, 8, 5, 4, 12, 6, 3, 9, 7, 4, 5, 13, 3, 6, 10, 4, 7, 3,
  8, 5, 11, 4, 6, 3, 9, 7, 5, 12, 4, 3, 8, 6, 10, 4, 7, 5, 3, 9, 6, 11, 4, 8,
  3, 7, 5, 10, 4, 6, 12, 3, 9, 5, 7, 4,
];

function Card({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <svg
      className="ed-idhint-card"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
    >
      {/* Unfilled, so the card sits on the page's own ground rather than
          carrying a second one that would have to be kept in step with the
          theme. The stroke is the card. */}
      <rect
        x="4"
        y="4"
        width={W - 8}
        height={H - 8}
        rx="34"
        fill="none"
        stroke="var(--tj-line)"
        strokeWidth="8"
      />
      {children}
    </svg>
  );
}

/** A run of text, as the bars a diagram uses for text. */
function Lines({
  x,
  y,
  widths,
  gap = 34,
  height = 16,
}: {
  x: number;
  y: number;
  widths: number[];
  gap?: number;
  height?: number;
}) {
  return (
    <>
      {widths.map((width, index) => (
        <rect
          key={index}
          x={x}
          y={y + index * gap}
          width={width}
          height={height}
          rx={height / 2}
          fill="var(--tj-line)"
        />
      ))}
    </>
  );
}

export function IdCardFront() {
  return (
    <Card label="Diagram of the front of a driver licence, showing the photograph and the printed details">
      {/* The words a dealer reads off the top of the card, at the size they
          read them: small, and not the subject. */}
      <text
        x="52"
        y="76"
        fill="var(--tj-muted)"
        fontSize="34"
        fontWeight="600"
        letterSpacing="4"
      >
        TEXAS
      </text>
      <text x="52" y="120" fill="var(--tj-muted)" fontSize="26" letterSpacing="2">
        DRIVER LICENSE
      </text>

      {/* The portrait, which is the whole reason the front is worth keeping.
          A head and shoulders rather than a grey box, because the grey box
          would read as a missing image. */}
      <rect x="52" y="158" width="228" height="300" rx="14" fill="var(--tj-line)" />
      <circle cx="166" cy="258" r="58" fill="var(--tj-surface)" />
      <path
        d="M 78 458 a 88 88 0 0 1 176 0 z"
        fill="var(--tj-surface)"
      />

      <Lines x={320} y={170} widths={[300, 420, 250, 380, 200]} gap={44} height={20} />

      {/* The signature strip along the bottom, which is what tells somebody at
          a glance that this is the front and not the back. */}
      <path
        d="M 320 470 q 26 -30 52 0 t 52 0 t 52 -12 t 60 12 t 44 -8"
        fill="none"
        stroke="var(--tj-line)"
        strokeWidth="9"
        strokeLinecap="round"
      />
    </Card>
  );
}

const BAR_TOP = 190;
const BAR_HEIGHT = 200;
/**
 * Four rows, because a PDF417 is a stacked code and not a supermarket one.
 *
 * Drawn as one tall block it read as the barcode on a cereal box, which is the
 * wrong thing to go looking for on the back of a licence. Cut into rows it
 * reads as the right kind of code, and it matches the frame the scanner draws
 * a minute later, which is the shape somebody is about to line the card up in.
 */
const BAR_ROWS = 4;
const ROW_GAP = 8;
const ROW_HEIGHT = (BAR_HEIGHT - ROW_GAP * (BAR_ROWS - 1)) / BAR_ROWS;

/**
 * Where each bar starts, laid out once rather than while drawing.
 *
 * A running total advanced inside the map would be a mutation during render,
 * which React's rules forbid and the linter catches: nothing about a render
 * guarantees it happens once, or in order, or at all.
 *
 * Each row starts at a different point in the same widths, so the four are
 * plainly different rows rather than one pattern repeated four times.
 */
const BAR_LAYOUT = Array.from({ length: BAR_ROWS }, (_unused, row) =>
  BARS.slice(row * 7).concat(BARS.slice(0, row * 7)).reduce<{ x: number; width: number }[]>(
    (placed, width) => {
      const previous = placed[placed.length - 1];
      const x = previous ? previous.x + previous.width + 5 : 60;
      // Stop at the card's edge rather than running off it.
      if (x + width > W - 60) return placed;
      placed.push({ x, width });
      return placed;
    },
    [],
  ),
);

export function IdCardBack() {
  return (
    <Card label="Diagram of the back of a driver licence, showing the barcode to scan">
      <Lines x={52} y={70} widths={[260, 420]} gap={38} height={16} />

      {/*
        The barcode, at the size and place a real PDF417 occupies.

        This is the part that matters on this side: it is what the scanner
        reads, and it is why the back is a scan rather than a snapshot. Drawn
        large enough that somebody looks at it, then turns a real card over
        looking for the same thing.
      */}
      {BAR_LAYOUT.map((row, rowIndex) =>
        row.map(({ x, width }, index) => (
          <rect
            key={`${rowIndex}-${index}`}
            x={x}
            y={BAR_TOP + rowIndex * (ROW_HEIGHT + ROW_GAP)}
            width={width}
            height={ROW_HEIGHT}
            fill={(index + rowIndex) % 3 === 0 ? "var(--tj-muted)" : "var(--tj-line)"}
          />
        )),
      )}

      <Lines x={52} y={440} widths={[520, 340]} gap={34} height={14} />
    </Card>
  );
}
