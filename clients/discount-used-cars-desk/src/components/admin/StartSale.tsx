"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import LicenceScanner, { type ScanResult } from "@/components/sales/LicenceScanner";
import { IdCardBack, IdCardFront } from "@/components/sales/IdCardDiagram";
import { formatPhone, phoneDigitsRemaining } from "@/lib/forms/phone";
import {
  ID_DOCUMENT_TYPES,
  PASSPORT_COUNTRIES,
  checkIdNumber,
  idDocumentType,
  idMaxLength,
  idShapesFor,
  normalizeIdNumber,
  type IdDocumentKind,
} from "@/lib/forms/id-document";
import { US_STATES } from "@/lib/forms/us-states";
import { splitPersonName } from "@/lib/forms/person-name";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, IdentificationCard, MagnifyingGlass } from "@phosphor-icons/react";
import { sortVehiclesAlphabetically } from "@/lib/vehicles/ordering";
import {
  BODY_STYLES,
  INTERIOR_COLORS,
  TEXAS_COUNTIES,
  VEHICLE_COLORS,
} from "@/lib/forms/vehicle-catalog";
import { startSale } from "@/lib/actions/start-sale";
import { completeAddress } from "@/lib/actions/address-complete";
import { looksLikeAStreet } from "@/lib/admin/address-lookup";
import { gateTitleStatus } from "@/lib/vehicles/title-status";
import { TITLE_KINDS, TITLE_TELL_KEYS, titlePathFor } from "@/lib/vehicles/title-kinds";
import { capturedHaptic } from "@/lib/haptics";
import { useFunnel } from "@/components/admin/funnel/FunnelLocaleProvider";
import FunnelLanguageToggle from "@/components/admin/funnel/FunnelLanguageToggle";
import { DeskConfirm, useDeskConfirm } from "@/components/admin/DeskConfirm";
import { fillTemplate } from "@/lib/sales/i18n";

/**
 * Starting a sale, one answer group at a time.
 *
 * There is no deal to persist yet, so every answer stays in React state while
 * the operator moves through the intake. The manual VIN route adds only the
 * car questions it needs. A lot car never pays those extra steps.
 */

export type PickableVehicle = {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  mileage: number | null;
  imageUrl: string | null;
  /** Canonical title fact from the inventory side; the desk reads, never sets. */
  titleStatus: string | null;
};

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

type StartStage =
  | "car"
  | "carDetails"
  | "carTitle"
  | "name"
  | "contact"
  | "identity"
  | "address";
type StageDirection = "forward" | "back";

/*
  The title question is on both routes. It used to be asked only for a car
  typed in by VIN, on the reasoning that a listed car's title was verified
  at acquisition. The owner's rule is that the funnel asks: the person
  starting the sale is holding the title, and a rebuilt one changes the
  packet. A listed car arrives with inventory's answer already chosen, so
  the common case is one look and Next.
*/
const LOT_STAGES: readonly StartStage[] = ["car", "carTitle", "name", "contact", "identity", "address"];
const MANUAL_STAGES: readonly StartStage[] = [
  "car",
  "carDetails",
  "carTitle",
  "name",
  "contact",
  "identity",
  "address",
];

/** Enough cars that scrolling beats typing, below which the field is noise. */
const SEARCH_APPEARS_ABOVE = 8;

/**
 * A car's name, with the words for a car that has none supplied by the caller.
 *
 * The fallback used to be an English literal in here, which meant a Spanish
 * dealer picking a half-entered vehicle off the lot read one English phrase in
 * a Spanish list. It cannot be read from the catalogue at this level because
 * this is a module function, so the two display sites pass it in and the
 * search filter, which compares rather than shows, passes nothing.
 */
function carName(v: PickableVehicle, fallback = ""): string {
  const parts = [v.year, v.make, v.model].filter(Boolean);
  return parts.length ? parts.join(" ") : fallback;
}

/**
 * How long the "on file" confirmation holds before the guide opens.
 *
 * Measured against reading it: the heading, two lines, and a glance at the
 * pictures. Under a second and somebody looking at the customer rather than the
 * screen misses it entirely, which is the failure this exists to fix.
 */
const REGISTERED_MS = 2200;

/**
 * Which fields the barcode gave up, as catalogue keys rather than words.
 *
 * These used to be English nouns pushed straight into the sentence the screen
 * reads back, which meant a Spanish sale said "el nombre, date of birth" out
 * loud. Naming the key here and looking the word up at render keeps the
 * readback in one language, the one the operator is actually reading.
 */
type ReadField = "name" | "dateOfBirth" | "idNumber" | "address" | "expiry";

function readFieldNames(fields: ScanResult["fields"]): ReadField[] {
  if (!fields) return [];
  const names: ReadField[] = [];
  if (fields.name) names.push("name");
  if (fields.dateOfBirth) names.push("dateOfBirth");
  if (fields.licenseNumber) names.push("idNumber");
  if (fields.address) names.push("address");
  if (fields.expires) names.push("expiry");
  return names;
}

/**
 * Words joined the way a person says them, not the way an array prints.
 *
 * The conjunction is passed in rather than written here: Spanish joins the
 * last item with "y", and a hardcoded "and" was the whole reason this list
 * came out half-translated.
 */
function list(items: string[], and: string): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

function matches(v: PickableVehicle, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${carName(v)} ${v.vin ?? ""}`.toLowerCase().includes(q);
}

/**
 * The mark on a label whose answer the sale cannot start without.
 *
 * Decorative to a screen reader, because the input's own `required` is what
 * announces it; a legend under the fields says what the mark means once.
 */
function Req() {
  return (
    <span className="ed-req" aria-hidden="true">
      *
    </span>
  );
}

export default function StartSale({ vehicles }: { vehicles: PickableVehicle[] }) {
  const { t } = useFunnel();
  const router = useRouter();
  const mailingAsk = useDeskConfirm();
  const [pending, startTransition] = useTransition();

  const [chosenId, setChosenId] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [vin, setVin] = useState("");
  // A VIN typed at the desk is looked up, and what comes back is shown in
  // fields the operator can correct before it is stored. The lookup proposes;
  // the person at the desk decides. This is the one thing the old paperwork
  // intake did that this screen could not, and the only reason that second
  // way in still existed.
  const [decoding, setDecoding] = useState(false);
  const [decodeNote, setDecodeNote] = useState<string | null>(null);
  const [carYear, setCarYear] = useState("");
  const [carMake, setCarMake] = useState("");
  const [carModel, setCarModel] = useState("");
  /**
   * What the VIN cannot tell us.
   *
   * A decode gives year, make and model and stops. Colour and body style are
   * on the 130-U, and a car typed in at the desk has to carry them the same
   * way one picked off the lot already does, or the sale reaches the title
   * application with holes in it. Asked here, as lists rather than as empty
   * boxes, because "Silver" is a tap and "Ingot Silver Metallic" is what
   * somebody types into a box that lets them.
   */
  const [carExterior, setCarExterior] = useState("");
  const [carInterior, setCarInterior] = useState("");
  const [carBodyStyle, setCarBodyStyle] = useState("");
  const [mileage, setMileage] = useState("");
  /**
   * The sale's language, held in state like every other answer on this form.
   *
   * It used to be an uncontrolled select read out of FormData at submit, but
   * the select lives on the car stage and unmounts on Next. By submit time the
   * element was gone from the DOM, the
   * answer with it, and the server's refusal ("choose the language") landed on
   * an operator who had already chosen it. State survives the screen change.
   */
  /**
   * The sale's language, starting on English at the owner's instruction.
   *
   * It used to start empty and refuse to advance until somebody picked, on
   * the reasoning that the packet's Spanish-first duty (FTC 455.5, Tex. Fin.
   * Code 348.006) rides on the answer and a silently-defaulted field is not
   * an answer. The owner runs the desk and nearly every sale here is in
   * English, so the common case now costs zero taps.
   *
   * What that trades away is the guarantee that a human looked. What it
   * keeps: the control is still on screen, still one tap from Spanish, and
   * still recorded with who set it and when, so a Spanish sale is a choice
   * somebody makes rather than a field nobody can reach. The empty state and
   * its refusal stay below for any caller that does not come from here.
   */
  // Vega's: the language starts EMPTY and the sale cannot advance until a
  // person picks one. Triple J defaulted to English because nearly all of its
  // sales are; Vega's serves a bilingual clientele, and the SOP's rule is
  // "required, no default" because FTC 455.5 and Tex. Fin. Code §348.006 key
  // the Spanish-first duties to this answer.
  const [saleLanguage, setSaleLanguage] = useState<"" | "en" | "es">("");
  const [query, setQuery] = useState("");
  /**
   * The intake stays local until a real sale exists, but each answer gets its
   * own beat. Manual VIN work adds only the two questions that route needs.
   */
  const [stage, setStage] = useState<StartStage>("car");
  const [direction, setDirection] = useState<StageDirection>("forward");
  /**
   * When the work on this sale started.
   *
   * The owner asked for the clock to begin at the pick-a-vehicle screen, which
   * is this screen, and to begin there for a reason: the deal row is not
   * written until the address is answered, several minutes of real work later,
   * so timing from the row credits nobody for the front half of the sale.
   *
   * A ref and an effect rather than a state initialiser, because an
   * initialiser runs during the server render too and would stamp the moment
   * the HTML was built rather than the moment a person was looking at it. On
   * mount, on the client, once: that is when the screen opened.
   *
   * The server checks this before it keeps it — see `stampStart` — since a
   * figure people are ranked on should not be whatever a browser claims.
   */
  const openedAt = useRef<string | null>(null);
  useEffect(() => {
    openedAt.current ??= new Date().toISOString();
  }, []);
  const stages = manual ? MANUAL_STAGES : LOT_STAGES;
  const stageIndex = Math.max(0, stages.indexOf(stage));
  const [coBuyer, setCoBuyer] = useState(false);

  // The buyer's own details, held here rather than left to the DOM, because a
  // formatted field has to control its own value to reformat it as it grows.
  /*
    The name in parts, because the state forms print it in parts. `buyerName`
    is derived from these for the customer row and for anywhere that wants one
    string; nothing derives the parts from the string any more.
  */
  const [buyerFirstName, setBuyerFirstName] = useState("");
  const [buyerMiddleName, setBuyerMiddleName] = useState("");
  const [buyerLastName, setBuyerLastName] = useState("");
  const [buyerSuffix, setBuyerSuffix] = useState("");
  const buyerName = [buyerFirstName, buyerMiddleName, buyerLastName, buyerSuffix]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [coBuyerName, setCoBuyerName] = useState("");
  const [idKind, setIdKind] = useState<IdDocumentKind>("stateLicence");
  /*
    Who issued the document: a state for a licence or ID card, a country for
    a passport. One slot, because a document has one issuer, and the picker
    that fills it changes with the kind. Switching kinds resets it to the
    common case for that kind, Texas or the United States, so a passport
    never inherits "TX" from the licence that was selected a moment ago.
  */
  const [idState, setIdState] = useState("TX");
  const chooseIdKind = (kind: IdDocumentKind) => {
    setIdKind(kind);
    const type = idDocumentType(kind);
    if (type.needsCountry) setIdState("US");
    else if (type.needsState) setIdState("TX");
  };
  const [idNumber, setIdNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openDealId, setOpenDealId] = useState<string | null>(null);
  // When the refusal is the title gate, the error carries a way through:
  // the inventory screen where the status gets marked.
  const [titleBlock, setTitleBlock] = useState<{ vehicleId: string; status: string; reason: string } | null>(null);
  // What the title is, answered only for a VIN typed at the desk — that
  // typing is the acquisition moment, so the verification happens here.
  const [titleAnswer, setTitleAnswer] = useState("");
  /**
   * What happens with a salvage title, when the desk already knows.
   *
   * Asked under the salvage card, three answers, "not sure yet" among them
   * so nothing here can block a sale. The guide asks the same question
   * first on a salvage car and shows whatever was said here.
   */
  const [salvagePath, setSalvagePath] = useState<"rebuild" | "towAway" | "undecided">("undecided");
  /** An out-of-state title's issuing state, or "" for a Texas title. */
  const [titleOrigin, setTitleOrigin] = useState("");
  const [titleFromElsewhere, setTitleFromElsewhere] = useState(false);
  /**
   * The buyer's address, and whether anybody has said it out loud.
   *
   * The title is MAILED to this address. That is the whole reason the
   * confirmation exists: a typo here does not produce a wrong line on a form,
   * it produces a title that goes to a stranger's letterbox and a customer
   * who calls in six weeks asking where their paperwork is. So the sale will
   * not start until somebody has read it back and confirmed it.
   */
  const [buyerStreet, setBuyerStreet] = useState("");
  const [buyerCity, setBuyerCity] = useState("");
  const [buyerAddrState, setBuyerAddrState] = useState("TX");
  const [buyerZip, setBuyerZip] = useState("");
  const [buyerCounty, setBuyerCounty] = useState("");
  const [mailingConfirmed, setMailingConfirmed] = useState(false);

  const shellRef = useRef<HTMLFormElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const vinRef = useRef<HTMLInputElement>(null);
  const mileageRef = useRef<HTMLInputElement>(null);
  const buyerRef = useRef<HTMLInputElement>(null);
  const buyerLastRef = useRef<HTMLInputElement>(null);
  const buyerStreetRef = useRef<HTMLInputElement>(null);

  /**
   * The rest of the address, worked out from the street line.
   *
   * A person asked where they live says "1605 Scenic Meadow" and stops. Every
   * box under it was staying empty, and the 130-U needs a city, a ZIP and a
   * county. `filling` drives the quiet note; `filledFrom` is what was matched,
   * so the note can name it and the desk can undo it in one tap.
   */
  const [addressFilling, setAddressFilling] = useState(false);
  const [addressFilledFrom, setAddressFilledFrom] = useState<string | null>(null);
  /** What the boxes held before we touched them, for Undo. */
  const filledUndo = useRef<{ city: string; zip: string; county: string } | null>(null);
  /** The street line the last lookup was for, so it runs once per line. */
  const lookedUpFor = useRef<string>("");

  /**
   * The old body leaves and the new body arrives from the same side as the
   * corridor. State moves in this tick too, so motion can never hold the form.
   */
  function moveStage(next: StartStage, nextDirection: StageDirection) {
    const shell = shellRef.current;
    if (shell) {
      shell.dataset.direction = nextDirection;
      shell.dataset.leaving = nextDirection;
    }
    setDirection(nextDirection);
    setError(null);
    setStage(next);
  }

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    shell.dataset.direction = direction;
    delete shell.dataset.leaving;
    // These stages share one URL, so the router cannot restore the top of the
    // next question for us after a long screen. Focus follows without moving it.
    window.scrollTo(0, 0);
    questionRef.current?.focus({ preventScroll: true });
  }, [direction, stage]);

  /**
   * The licence, read here, attached once the sale exists.
   *
   * The card is on the counter now, which is the moment to photograph it, and
   * there is no deal yet to hang it on. So both sides are held in the browser
   * and posted the instant `startSale` returns an id, using the same signed
   * token and the same upload route the customer's phone uses. Nothing new to
   * keep in step, and the licence step is already answered by the time anybody
   * reaches it.
   *
   * A ref, not state: the bytes go up on submit and nothing re-renders from
   * them. What the screen draws is `shot` below, which is two small preview
   * URLs rather than two multi-hundred-kilobyte blobs.
   */
  const scan = useRef<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

  /**
   * What the sale is doing, once Start Sale has been pressed.
   *
   * This screen used to go quiet at exactly the moment somebody most wants to
   * be told something: the deal is being created, two photographs of a
   * stranger's licence are going up, and the only feedback was the button
   * saying "Starting" until the page changed. Whether the ID had actually been
   * filed was not knowable from anywhere on the screen.
   */
  type Filing =
    | { phase: "idle" }
    | { phase: "creating" }
    | { phase: "filing" }
    | { phase: "done"; dealId: string; front: boolean; back: boolean; read: ReadField[] }
    | { phase: "failed"; dealId: string; error: string };
  const [filing, setFiling] = useState<Filing>({ phase: "idle" });

  /**
   * The two pictures, shown back.
   *
   * A line of text saying both sides were photographed asks to be believed.
   * Two thumbnails do not: somebody can see the front is the front, that the
   * back is in focus, and that neither is a photograph of the counter. The
   * whole point of taking them here is that the customer is still standing
   * there and a bad one can be retaken in ten seconds.
   */
  const [shot, setShot] = useState<{ front: string; back: string | null } | null>(null);

  /*
    Object URLs are handed out by the browser and never taken back on their own.

    Cleanup runs on a retake, which revokes the pair being replaced, and on
    leaving the screen. Without it somebody starting three sales in a row leaves
    six photographs of strangers' licences alive in the tab until it is closed.
  */
  useEffect(() => {
    if (!shot) return;
    return () => {
      URL.revokeObjectURL(shot.front);
      if (shot.back) URL.revokeObjectURL(shot.back);
    };
  }, [shot]);

  /**
   * What the barcode said, written into the fields.
   *
   * Only the two this screen asks for. The address is read as well and travels
   * with the upload, but it is not shown here: it goes to the licence step,
   * which puts it in four boxes and reads it back for a yes before saving. One
   * jumbled line on this screen was the thing that used to make it unreadable.
   *
   * Every value stays editable. This is a typing aid at the counter.
   */
  /**
   * The field names, in the sale's language, joined the way a person says
   * them. Looked up at render rather than at scan time, so switching language
   * mid-question re-reads the list instead of freezing it in English.
   */
  function spokenFields(keys: ReadField[]): string {
    return list(
      keys.map((key) => t.start.fields[key]),
      t.chrome.and,
    );
  }

  function applyScan(result: ScanResult) {
    scan.current = result;
    setScanning(false);

    setShot({
      front: URL.createObjectURL(result.front),
      back: result.back ? URL.createObjectURL(result.back) : null,
    });

    const fields = result.fields;
    const filled: ReadField[] = [];
    if (fields?.name) {
      /*
        The name screen comes before the scanner now. The card may complete a
        blank part, but it never replaces a name the operator already checked.
        Back still exposes every part for review.
      */
      const parts = splitPersonName(fields.name);
      const hasBlankPart = [
        buyerFirstName,
        buyerMiddleName,
        buyerLastName,
        buyerSuffix,
      ].some((part) => !part.trim());
      if (hasBlankPart) {
        setBuyerFirstName((current) => current.trim() ? current : parts.first ?? "");
        setBuyerMiddleName((current) => current.trim() ? current : parts.middle ?? "");
        setBuyerLastName((current) => current.trim() ? current : parts.last ?? "");
        setBuyerSuffix((current) => current.trim() ? current : parts.suffix ?? "");
        filled.push("name");
      }
    }
    if (fields?.licenseNumber) {
      setIdNumber(fields.licenseNumber);
      setIdKind("stateLicence");
      filled.push("idNumber");
    }
    if (fields?.address) filled.push("address");

    setScanNote(
      filled.length > 0
        ? fillTemplate(t.start.scanRead, { list: spokenFields(filled) })
        : t.start.scanNothingUsable,
    );
  }

  /**
   * The photographs, onto the sale that has just been created.
   *
   * The answer is read rather than thrown away. It used to be sent and ignored
   * inside a bare try, which meant a licence that never reached the sale looked
   * exactly like one that did: the screen moved on either way and the dealer
   * found out days later, if at all.
   *
   * A failure here never costs the sale. The deal exists by the time this runs,
   * so what is reported is "the sale started, the ID did not", with the way
   * back to it, rather than an error that loses the intake with a customer
   * standing at the desk.
   */
  async function attachLicence(token: string): Promise<{ ok: boolean; error?: string }> {
    const result = scan.current;
    if (!result) return { ok: true };

    const body = new FormData();
    body.set("token", token);
    body.set("image", result.front, "licence.jpg");
    if (result.back) body.set("back", result.back, "licence-back.jpg");
    // Sent as the reader's output, never as confirmed values: extraction only
    // ever fills `read`, so nothing here reaches a document without somebody at
    // the desk looking at it on the licence step first.
    if (result.fields) body.set("fields", JSON.stringify(result.fields));

    try {
      const response = await fetch("/api/capture", { method: "POST", body });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      // Both, because this route answers a refused token with 401 and a JSON
      // body, and a storage failure with 502 and a different one. Reading only
      // the status, or only the body, misses one of them.
      if (!response.ok || !payload?.ok) {
        return { ok: false, error: payload?.error ?? t.start.idDidNotSave };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: t.start.idDidNotSaveConnection };
    }
  }

  /**
   * Complete the address once the street line looks like a whole street.
   *
   * Debounced rather than per keystroke: the geocoder matches a street NAME,
   * so "8774 Almeda" is a request spent to be told no, and only "8774 Almeda
   * Genoa" can answer. `looksLikeAStreet` is the same gate the action applies,
   * checked here too so a typing desk never opens a request that cannot win.
   *
   * It only ever fills boxes that are EMPTY. A dealer who typed a city because
   * they know the customer moved last week outranks a reference file, and an
   * address that silently rewrote itself under somebody's hands would be the
   * kind of help nobody asks for twice.
   */
  useEffect(() => {
    if (stage !== "address") return;
    const street = buyerStreet.trim();
    if (!looksLikeAStreet(street)) {
      lookedUpFor.current = "";
      return;
    }
    // The same line twice is the same answer. Asking again would spend a
    // request to overwrite nothing, and would fight an Undo the desk just used.
    const asked = `${street}|${buyerCity.trim()}|${buyerAddrState}`;
    if (lookedUpFor.current === asked) return;

    let alive = true;
    const timer = setTimeout(() => {
      lookedUpFor.current = asked;
      setAddressFilling(true);
      void completeAddress(street, buyerCity, buyerAddrState)
        .then((found) => {
          if (!alive) return;
          setAddressFilling(false);
          if (!found) return;

          // What was there first, so Undo can put it back exactly.
          const before = { city: buyerCity, zip: buyerZip, county: buyerCounty };
          let touched = false;
          if (!before.city.trim() && found.city) { setBuyerCity(found.city); touched = true; }
          if (!before.zip.trim() && found.zip) { setBuyerZip(found.zip); touched = true; }
          if (!before.county.trim() && found.county) { setBuyerCounty(found.county); touched = true; }
          // The suffix the desk left off ("Scenic Meadow" -> "Scenic Meadow Ct"),
          // and only when it is the same street said more completely.
          if (
            found.street &&
            found.street.toLowerCase() !== street.toLowerCase() &&
            found.street.toLowerCase().startsWith(street.toLowerCase())
          ) {
            setBuyerStreet(found.street);
            touched = true;
          }

          if (!touched) return;
          filledUndo.current = before;
          setAddressFilledFrom(
            `${found.street}, ${found.city}, ${found.state} ${found.zip}`,
          );
          // Filled, not read back to the customer. The confirmation dialog is
          // still the desk's to give.
          setMailingConfirmed(false);
        })
        .catch(() => {
          if (alive) setAddressFilling(false);
        });
    }, 500);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [stage, buyerStreet, buyerCity, buyerAddrState, buyerZip, buyerCounty]);

  const sorted = useMemo(() => sortVehiclesAlphabetically(vehicles), [vehicles]);
  const shown = useMemo(
    () => sorted.filter((v) => matches(v, query)),
    [sorted, query],
  );
  const chosen = vehicles.find((v) => v.id === chosenId) ?? null;
  /**
   * A VIN typed into the car search, for a car that is not on the lot.
   *
   * The search box already matched on VIN, so a dealer pasting one was doing
   * the natural thing. When the car had never been added to inventory it found
   * nothing and said "No car by that name", which is true and useless: the VIN
   * IS the car's name, and the answer was sitting behind a quiet link under the
   * grid that nobody looks at while they are already typing.
   *
   * So a VIN that matches nothing on the lot is looked up where it was typed,
   * against the same NHTSA decoder the manual route uses, and comes back as a
   * card in the same grid. The dealer picks their car; they do not first learn
   * that this screen has two modes.
   */
  /** The VIN typed on the selector itself, for a car not on the lot. */
  const [lotVin, setLotVin] = useState("");

  const [vinProbe, setVinProbe] = useState<
    | { vin: string; status: "looking" }
    | { vin: string; status: "none" }
    | {
        vin: string;
        status: "found";
        year: string;
        make: string;
        model: string;
        bodyStyle: string;
      }
    | null
  >(null);

  const carSettled = Boolean(chosen) || manual;

  /**
   * The VIN to look up, from either place a dealer might put one.
   *
   * The search box takes it because a dealer pasting a VIN into a search box
   * is doing the natural thing, and the field below takes it because on a lot
   * of eight cars or fewer that search box does not exist.
   */
  const asVin = (value: string): string | null => {
    const candidate = value.trim().toUpperCase().replace(/[\s-]/g, "");
    return VIN_PATTERN.test(candidate) ? candidate : null;
  };
  const queriedVin = asVin(query);

  /**
   * The VIN a lookup is already out for.
   *
   * A ref rather than a dependency on `vinProbe`, and that is the whole point.
   * Reading the probe state here would put it in the dependency list, the
   * "looking" update would re-run the effect, and the cleanup would flip the
   * in-flight fetch's own `alive` flag to false: the answer arrives and is
   * thrown away, the guard below says a lookup is already out, and the screen
   * says "Looking up this VIN" until somebody retypes it. Measured, not
   * theorised.
   */
  const probedVin = useRef<string | null>(null);

  useEffect(() => {
    // Only when the lot has already failed to answer. A VIN that IS on the lot
    // is found by the filter above and needs no lookup at all.
    // A VIN typed into SEARCH is only interesting once the lot has failed to
    // answer it; one typed into the field below is a statement that the car is
    // not on the lot, so it is looked up either way.
    const wanted = queriedVin && shown.length === 0 ? queriedVin : asVin(lotVin);
    if (stage !== "car" || carSettled || !wanted) {
      probedVin.current = null;
      setVinProbe(null);
      return;
    }
    if (probedVin.current === wanted) return;
    const queriedVinNow = wanted;

    let alive = true;
    const timer = setTimeout(() => {
      probedVin.current = queriedVinNow;
      setVinProbe({ vin: queriedVinNow, status: "looking" });
      void fetch(`/api/vin-decode?vin=${encodeURIComponent(queriedVinNow)}`)
        .then(async (response) => {
          const data = await response.json().catch(() => null);
          if (!alive) return;
          if (!response.ok || !data || (!data.make && !data.model)) {
            setVinProbe({ vin: queriedVinNow, status: "none" });
            return;
          }
          setVinProbe({
            vin: queriedVinNow,
            status: "found",
            year: data.year != null ? String(data.year) : "",
            make: data.make ? String(data.make) : "",
            model: data.model ? String(data.model) : "",
            bodyStyle: data.bodyStyle ? String(data.bodyStyle) : "",
          });
        })
        .catch(() => {
          // A decoder that cannot be reached is not a dead end: the manual
          // route is still one tap away and types the same three fields.
          if (alive) setVinProbe({ vin: queriedVinNow, status: "none" });
        });
    }, 400);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [stage, carSettled, queriedVin, lotVin, shown.length]);

  /** Take the decoded car as this sale's car, with its facts already in. */
  function useDecodedVin() {
    if (!vinProbe || vinProbe.status !== "found") return;
    setError(null);
    setTitleBlock(null);
    setManual(true);
    setChosenId(null);
    setVin(vinProbe.vin);
    // A car nobody listed has no title answer to inherit.
    setTitleAnswer("");
    setCarYear(vinProbe.year);
    setCarMake(vinProbe.make);
    setCarModel(vinProbe.model);
    /*
      Matched to the catalogue's own spelling. Lowercasing the decode wrote
      "pickup" into a select whose options say "Pickup", which then printed
      lowercase on the state form; the catalogue entry is the one that
      prints, so the decode is matched to it and otherwise left as decoded.
    */
    if (vinProbe.bodyStyle) {
      const decoded = vinProbe.bodyStyle.trim().toLowerCase();
      setCarBodyStyle(BODY_STYLES.find((style) => style.toLowerCase() === decoded) ?? vinProbe.bodyStyle.trim());
    }
    // The same sentence the manual lookup shows, for the same reason: a decode
    // is a proposal, and somebody is standing next to the actual car.
    setDecodeNote(t.start.checkAgainstCar);
    setQuery("");
    setLotVin("");
    probedVin.current = null;
    setVinProbe(null);
  }


  function choose(vehicle: PickableVehicle) {
    setError(null);
    setTitleBlock(null);
    // The gate, shown at the moment of choosing rather than after the whole
    // buyer intake is typed. Only a title the car cannot be sold on stops
    // the sale here; an unverified one is asked about on the title screen,
    // and the server refuses an unsellable answer independently either way.
    const gate = gateTitleStatus(vehicle.titleStatus);
    if (!gate.ok && gate.reason === "unsellable") {
      // Nonrepairable or export only: no retail sale can begin. A salvage
      // title has a path (rebuild first) and goes on to the title screen
      // with its answer already chosen.
      if (titlePathFor(gate.status) === null) {
        setTitleBlock({ vehicleId: vehicle.id, status: gate.status, reason: gate.reason });
        setError(t.start.titleUnsellableBlock);
        return;
      }
    }
    // Inventory's answer prefills the title question; nothing prefills an
    // unverified one, so that screen waits for a real answer.
    setTitleAnswer(gate.ok ? gate.status : "");
    if (!gate.ok && titlePathFor(gate.status) !== null) setTitleAnswer(gate.status);
    setManual(false);
    setChosenId(vehicle.id);
    // The odometer moves between listing and sale more often than not, so it
    // arrives filled in and editable rather than assumed.
    setMileage(vehicle.mileage != null ? String(vehicle.mileage) : "");
    // The car is answered. The odometer is the remaining car fact on screen.
    window.requestAnimationFrame(() => mileageRef.current?.focus());
  }

  async function lookUpVin() {
    const candidate = vin.trim().toUpperCase();
    setError(null);
    setDecodeNote(null);
    if (!VIN_PATTERN.test(candidate)) {
      setError(t.start.vinLooksWrong);
      return;
    }
    setDecoding(true);
    try {
      const response = await fetch(
        `/api/vin-decode?vin=${encodeURIComponent(candidate)}`,
      );
      const data = await response.json();
      if (!response.ok) {
        // A lookup that fails is not a dead end. The fields are already there
        // and typing three of them is faster than starting over somewhere else.
        setDecodeNote(
          typeof data?.error === "string"
            ? `${data.error} Fill the three fields in yourself.`
            : t.start.vinServiceUnreachable,
        );
        return;
      }
      if (data.year != null) setCarYear(String(data.year));
      if (data.make) setCarMake(String(data.make));
      if (data.model) setCarModel(String(data.model));
      setDecodeNote(t.start.checkAgainstCar);
    } catch {
      setDecodeNote(
        t.start.vinServiceUnreachable,
      );
    } finally {
      setDecoding(false);
    }
  }

  function reopen() {
    setChosenId(null);
    setManual(false);
    setVin("");
    setTitleAnswer("");
    setTitleBlock(null);
    setError(null);
  }

  /**
   * A Next button owns only the fields that are currently mounted. That keeps
   * a name error on the name screen and a title refusal beside the title.
   */
  function validateStage(current: StartStage, form: HTMLFormElement): boolean {
    setError(null);

    if (current === "car") {
      if (manual) {
        const candidate = vin.trim().toUpperCase();
        if (!VIN_PATTERN.test(candidate)) {
          setError(t.start.vinLooksWrong);
          return false;
        }
      } else if (!chosen) {
        setError(t.start.pickCarOrVin);
        return false;
      }

      if (saleLanguage === "") {
        setError(t.saleLanguage.mustChoose);
        return false;
      }

      // A car typed in by VIN prints its year, make and model on every
      // document, so the decode's proposal has to be a real answer.
      if (manual && (!carYear.trim() || !carMake.trim() || !carModel.trim())) {
        setError(t.start.fillRequired);
        return false;
      }

      // The odometer is on the bill of sale, the 130-U and the federal
      // disclosure: an empty box is not an answer, and neither is a bad one.
      const reading = mileage.trim();
      const parsed = Number(reading);
      if (reading === "" || !Number.isFinite(parsed) || parsed < 0) {
        setError(t.start.needOdometer);
        mileageRef.current?.focus();
        return false;
      }
    }

    // Colour and body style go on the 130-U; the interior does not.
    if (current === "carDetails" && (carExterior === "" || carBodyStyle === "")) {
      setError(t.start.fillRequired);
      return false;
    }

    if (current === "carTitle") {
      // "I don't know" opens how to tell; it is not an answer the sale can
      // carry. Every real kind has a path, salvage included.
      if (titleAnswer === "" || titleAnswer === "unknown") {
        setError(t.start.titleChoose);
        return false;
      }
      const titleGate = gateTitleStatus(titleAnswer);
      if (!titleGate.ok && titlePathFor(titleGate.status) === null) {
        setError(t.start.titleUnsellableBlock);
        return false;
      }
      // Ticking "from another state" and naming no state is half an answer.
      if (titleFromElsewhere && !titleOrigin) {
        setError(t.start.titleOriginChoose);
        return false;
      }
    }

    if (current === "identity" && !idNumber.trim()) {
      setError(t.start.fillRequired);
      return false;
    }

    // The title is mailed here and the 130-U prints the county, so every
    // line of the address is an answer the paperwork reads.
    if (
      current === "address" &&
      [buyerStreet, buyerCity, buyerZip, buyerCounty].some((value) => !value.trim())
    ) {
      setError(t.start.fillRequired);
      return false;
    }

    // Required catches an empty box, but not a box containing only spaces.
    // Catch that here so a name mistake never follows the desk to Address.
    if (current === "name") {
      if (!buyerFirstName.trim()) {
        setError(t.start.needFirstName);
        buyerRef.current?.focus();
        return false;
      }
      if (!buyerLastName.trim()) {
        setError(t.start.needLastName);
        buyerLastRef.current?.focus();
        return false;
      }
    }

    if (current === "contact" && buyerPhone.replace(/\D/g, "").length < 10) {
      setError(t.start.needPhone);
      return false;
    }

    return form.reportValidity();
  }

  function advance(form: HTMLFormElement) {
    if (!validateStage(stage, form)) return;
    const next = stages[stageIndex + 1];
    if (next) moveStage(next, "forward");
  }

  /**
   * Whether the screen's marked fields hold an answer.
   *
   * The owner's rule: an asterisk on what the sale needs, and no leaving the
   * page without it. Next stays disabled until every marked field on the
   * current stage has something in it; `validateStage` above still owns the
   * question of whether that something is right (a VIN of the wrong shape,
   * a phone number short a digit), so a filled-but-wrong answer gets a
   * sentence rather than a dead button.
   */
  const stageReady = (() => {
    switch (stage) {
      case "car":
        return (
          (manual ? vin.trim().length > 0 && carYear.trim() !== "" && carMake.trim() !== "" && carModel.trim() !== "" : Boolean(chosen)) &&
          mileage.trim() !== "" &&
          saleLanguage !== ""
        );
      case "carDetails":
        return carExterior !== "" && carBodyStyle !== "";
      case "carTitle":
        return titleAnswer !== "";
      case "name":
        return buyerFirstName.trim() !== "" && buyerLastName.trim() !== "";
      case "contact":
        return buyerPhone.replace(/\D/g, "").length >= 10;
      case "identity":
        return idNumber.trim() !== "";
      case "address":
        return [buyerStreet, buyerCity, buyerZip, buyerCounty].every((value) => value.trim() !== "");
      default:
        return true;
    }
  })();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Enter behaves like Next before the final screen. The mailing question
    // belongs only to the address screen and can never open on an earlier one.
    if (stage !== "address") {
      advance(event.currentTarget);
      return;
    }

    setError(null);
    setOpenDealId(null);
    // The last screen's own guard, the same one Next runs on every other.
    if (!validateStage("address", event.currentTarget)) return;

    const vehicleId = manual ? undefined : chosen?.id;
    const cleanVin = manual ? vin.trim().toUpperCase() : undefined;

    let confirmedMailing = mailingConfirmed;
    const hasMailingAddress = Boolean(
      buyerStreet.trim() || buyerCity.trim() || buyerZip.trim() || buyerCounty.trim(),
    );

    // The prompt belongs to the attempt to leave this screen. Keeping it out
    // of the typing path lets the desk finish the address before reading it
    // back, and the local answer lets this same submit continue immediately.
    if (hasMailingAddress && !confirmedMailing) {
      confirmedMailing = await mailingAsk.ask({
        question: t.start.confirmMailingTitle,
        address: [
          buyerStreet.trim(),
          [buyerCity.trim(), `${buyerAddrState} ${buyerZip.trim()}`.trim()]
            .filter(Boolean)
            .join(", "),
          buyerCounty.trim() ? `${buyerCounty.trim()} County` : "",
        ]
          .filter(Boolean)
          .join(", "),
        detail: t.start.confirmMailingBody,
        confirm: t.start.confirmMailingYes,
        cancel: t.start.confirmMailingNo,
        hold: t.holdConfirmation,
      });

      if (!confirmedMailing) {
        requestAnimationFrame(() => buyerStreetRef.current?.focus());
        return;
      }
      setMailingConfirmed(true);
    }

    const reading = mileage.trim();
    const miles = reading === "" ? undefined : Math.round(Number(reading));

    startTransition(async () => {
      setFiling({ phase: "creating" });
      const parsedYear = carYear.trim() === "" ? null : Number(carYear);
      const result = await startSale({
        vehicleId,
        vin: cleanVin,
        mileage: miles,
        // Only ever sent for a VIN typed here, and only what is on screen.
        vehicleYear:
          manual && parsedYear != null && Number.isFinite(parsedYear)
            ? parsedYear
            : null,
        vehicleMake: manual ? carMake : undefined,
        vehicleModel: manual ? carModel : undefined,
        vehicleExteriorColor: manual ? carExterior : undefined,
        vehicleInteriorColor: manual ? carInterior : undefined,
        vehicleBodyStyle: manual ? carBodyStyle : undefined,
        // Answered on every sale. For a listed car it is inventory's answer
        // confirmed or corrected at the desk; the server writes a change
        // back to the vehicle with who said so and when.
        titleStatus: titleAnswer || undefined,
        // The salvage answer rides only on a salvage car; the server
        // ignores it otherwise. The issuing state only when it is not Texas.
        salvagePath: titleAnswer === "salvage_unrebuilt" ? salvagePath : undefined,
        titleOriginState: titleFromElsewhere && titleOrigin ? titleOrigin : undefined,
        // Composed from the boxes for the customer row, which stores one
        // string, while the parts below are what the state forms print.
        buyerName,
        buyerFirstName: buyerFirstName.trim() || undefined,
        buyerMiddleName: buyerMiddleName.trim() || undefined,
        buyerLastName: buyerLastName.trim() || undefined,
        buyerSuffix: buyerSuffix.trim() || undefined,
        buyerPhone,
        buyerIdNumber: idNumber,
        // Collected on this screen and, until now, dropped: the bill of sale
        // then asked for it again one screen later.
        buyerIdState:
          idDocumentType(idKind).needsState || idDocumentType(idKind).needsCountry ? idState : undefined,
        // The kind rides with the number: the 130-U ticks a different box
        // for a licence, a passport and a military ID.
        buyerIdKind: idKind,
        buyerEmail,
        // Sent from here now. The licence step still overwrites it with what
        // the barcode actually says; this is what the bill of sale prints
        // when nobody ever reaches that step.
        buyerAddress: [
          buyerStreet.trim(),
          buyerCity.trim(),
          `${buyerAddrState} ${buyerZip.trim()}`.trim(),
        ]
          .filter(Boolean)
          .join(", "),
        /*
          The same address in the pieces this screen actually collected. The
          joined line above is still sent, because the customer record stores
          one string, but the sale's own copy is built from these. Joining four
          boxes and asking a parser to find them again could only lose
          information: a street with a comma in it came back as a city.
        */
        buyerStreet: buyerStreet.trim() || undefined,
        buyerCity: buyerCity.trim() || undefined,
        buyerState: buyerAddrState || undefined,
        buyerZip: buyerZip.trim() || undefined,
        buyerCounty: buyerCounty.trim() || undefined,
        mailingConfirmed: confirmedMailing,
        // Both shapes come from the same five controlled fields. The joined
        // line serves the customer row and the pieces serve the paperwork.
        coBuyerName: coBuyer ? coBuyerName : undefined,
        // Sent from state, never from the form: the select sits on the car
        // screen, which is unmounted by the time this submits. The action
        // still refuses a missing answer so no other caller can start a deal
        // with a silently-defaulted language.
        language: saleLanguage === "" ? undefined : saleLanguage,
        // Stamped when the pick-a-vehicle screen opened, which is before any
        // of the above was typed and long before this row exists.
        startedAt: openedAt.current ?? undefined,
      });

      if (!result.success) {
        setFiling({ phase: "idle" });
        setOpenDealId(result.existingDealId ?? null);
        setTitleBlock(result.titleBlock ?? null);
        // Inventory can change while the address is being entered. A fresh
        // title refusal returns to the control that can resolve it.
        if (result.titleBlock) {
          moveStage(manual ? "carTitle" : "car", "back");
        }
        setError(result.error);
        return;
      }

      const guide = `/admin/sales/${result.dealId}/guide`;
      const held = scan.current;

      // Nothing was scanned, so there is nothing to confirm. Into the funnel.
      //
      // It used to push to /admin/sales/{id}, which lists the whole packet on
      // one screen. The step-by-step flow existed the whole time and nothing
      // ever walked anybody into it, so the product read as a pile of forms.
      if (!held) {
        router.push(guide);
        return;
      }

      // The card was photographed before the sale existed. It exists now.
      setFiling({ phase: "filing" });
      const attached = await attachLicence(result.captureToken);

      if (!attached.ok) {
        // The sale is real either way, and saying so is the point: losing the
        // photographs must never read as having lost the intake.
        setFiling({
          phase: "failed",
          dealId: result.dealId,
          error: attached.error ?? t.start.idDidNotSave,
        });
        return;
      }

      setFiling({
        phase: "done",
        dealId: result.dealId,
        front: true,
        back: Boolean(held.back),
        read: readFieldNames(held.fields),
      });
      capturedHaptic();
    });
  }

  /**
   * The confirmation holds for a beat, then goes on by itself.
   *
   * Long enough to be read, short enough not to be a screen anybody has to
   * dismiss. A Continue button here would be a toll on a corridor whose whole
   * argument is that answering advances, and a flash too short to read would
   * be the silence this was built to end.
   */
  useEffect(() => {
    if (filing.phase !== "done") return;
    const at = window.setTimeout(
      () => router.push(`/admin/sales/${filing.dealId}/guide`),
      REGISTERED_MS,
    );
    return () => window.clearTimeout(at);
  }, [filing, router]);

  const idWarning = checkIdNumber(idKind, idNumber, idState).warning;

  /**
   * The number pad, but only where every real number is digits.
   *
   * A Texas licence is eight digits, so on the default case the phone opens
   * straight onto numbers. A state whose licences carry letters keeps the
   * full keyboard, because a keypad that cannot type the number on the card
   * is worse than a longer reach for the digits.
   */
  const idShapes = idShapesFor(idKind, idState);
  const idIsAllDigits =
    Boolean(idShapes?.length) &&
    Boolean(idShapes?.every((shape) => shape.kind === "digits"));

  const stageQuestion: Record<StartStage, string> = {
    car: t.start.whichCar,
    carDetails: t.start.carDetailsQuestion,
    carTitle: t.start.carTitleQuestion,
    name: t.start.buyerNameQuestion,
    contact: t.start.buyerContactQuestion,
    identity: t.start.buyerIdentityQuestion,
    address: t.start.buyerAddressQuestion,
  };

  /*
    The scanner takes the whole screen while it runs.

    Returned before the form rather than layered over it, so there is no
    question of the fields showing through behind a camera. The old scanner sat
    on top of this screen and the mailing address box was visible through it,
    which is exactly what a person holding somebody else's licence should not be
    looking at.

    The form is unmounted for the duration and its state is React state, so
    nothing typed is lost while the card is being read.
  */
  /*
    Once Start Sale is pressed, the screen says what is happening to the ID.

    Returned before the form for the same reason the scanner is: this is the
    whole screen for the two seconds it lasts, and a form still visible behind
    a confirmation invites somebody to keep typing into a sale that has already
    been created.
  */
  if (filing.phase !== "idle") {
    return (
      <div className="ed-guide ed-start-filed">
        <main className="ed-guide-body">
          {filing.phase === "done" ? (
            <>
              <span className="ed-start-filed-mark" aria-hidden="true">
                <Check size={38} weight="bold" />
              </span>
              <h1 className="ed-start-filed-title" role="status">
                {t.start.idOnFile}
              </h1>
              {/* Named one by one. "Registered" on its own is a claim; a list of
                  what is actually on the sale is the evidence for it. */}
              <ul className="ed-start-filed-list">
                <li>{filing.back ? t.start.frontBackStored : t.start.frontStored}</li>
                {filing.back ? null : <li>{t.start.noBack}</li>}
                {filing.read.length > 0 ? (
                  <li>{fillTemplate(t.start.readOff, { list: spokenFields(filing.read) })}</li>
                ) : (
                  <li>{t.start.nothingRead}</li>
                )}
                <li>{t.start.attached}</li>
              </ul>
              {shot ? (
                <div className="ed-start-shots ed-start-filed-shots">
                  <figure className="ed-start-shot">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={shot.front} alt={t.start.frontIdAlt} />
                    <figcaption className="ed-fine">{t.start.front}</figcaption>
                  </figure>
                  {shot.back ? (
                    <figure className="ed-start-shot">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={shot.back} alt={t.start.backIdAlt} />
                      <figcaption className="ed-fine">{t.start.back}</figcaption>
                    </figure>
                  ) : null}
                </div>
              ) : null}
              <p className="ed-start-filed-note">{t.start.openingSale}</p>
            </>
          ) : filing.phase === "failed" ? (
            <>
              <h1 className="ed-start-filed-title" role="alert">
                {t.start.saleStartedIdNot}
              </h1>
              <p className="ed-start-filed-note">{filing.error}</p>
              {/* The deal is real and reachable. The licence step inside it
                  takes the card again, so the way forward is one link rather
                  than starting the whole intake over. */}
              <Link
                className="ed-btn ed-btn-dark ed-start-filed-go"
                href={`/admin/sales/${filing.dealId}/guide`}
              >
                {t.start.openAndAdd}
              </Link>
            </>
          ) : (
            <h1 className="ed-start-filed-title" role="status">
              {filing.phase === "creating" ? t.start.startingSale : t.start.filingId}
            </h1>
          )}
        </main>
      </div>
    );
  }

  if (scanning) {
    return (
      <LicenceScanner
        onScanned={applyScan}
        // No camera on this machine, or permission refused. Ordinary at a desk,
        // and not a dead end: every field on the screen behind this still types.
        onFallback={() => {
          setScanning(false);
          setScanNote(t.start.scanNoCamera);
        }}
        // Back to the form with nothing taken and nothing lost. The fields are
        // React state, so whatever was already typed is still there.
        onExit={() => setScanning(false)}
        // The button that opened this was the tap, so the browser will already
        // vibrate and a second screen asking for another one is a toll.
        activated
      />
    );
  }

  return (
    /* The same corridor the rest of the sale runs in: one question to a
       screen, centered, with nothing beside it. The intake used to sit in the
       ordinary admin page frame, so the first two questions of a sale looked
       like a different product from the eight after them. */
    <form
      ref={shellRef}
      onSubmit={submit}
      className="ed-guide"
      data-direction={direction}
    >
      <header className="ed-guide-head">
        <Link className="ed-guide-exit" href="/admin/sales">
          {t.chrome.leave}
        </Link>
        <span className="ed-guide-count">
          {fillTemplate(t.chrome.countOf, { current: stageIndex + 1, total: stages.length })}
        </span>
        <FunnelLanguageToggle />
      </header>

      <main key={stage} className="ed-guide-body">
        <h1
          id="start-sale-question"
          ref={questionRef}
          tabIndex={-1}
          className="ed-guide-question"
          style={{ outline: "none" }}
        >
          {stageQuestion[stage]}
        </h1>

      <div className="ed-guide-answer">
        {stage === "car" ? (
        <fieldset
          data-start-stage="car"
          data-tj-stagger
          disabled={pending}
          aria-labelledby="start-sale-question"
          className="border-0 p-0"
        >
          {carSettled ? (
            <div className="ed-start-chosen">
              {chosen?.imageUrl ? (
                <span className="ed-start-thumb">
                  <Image
                    src={chosen.imageUrl}
                    alt=""
                    fill
                    sizes="72px"
                    style={{ objectFit: "cover" }}
                  />
                </span>
              ) : null}
              <span className="ed-start-chosen-name">
                {chosen ? carName(chosen, t.start.untitledVehicle) : t.start.newVin}
              </span>
              <button type="button" onClick={reopen} className="ed-start-change">
                {t.chrome.change}
              </button>
            </div>
          ) : (
            <>
              {/*
                The two ways to name a car that are not tapping it: search
                the lot, or type the VIN of a car that is not on it. One row,
                above the cars.

                The VIN field used to sit under the grid. That read well on a
                lot of five and vanished on a lot of twenty-five: on a phone
                the grid is one column, so the only VIN field on the screen
                was three thousand pixels down, and the owner reported it as
                missing. Whatever the lot holds, it is now in the first
                viewport, and what it finds arrives as another car to pick.
              */}
              <div className="ed-start-finders">
                {sorted.length > SEARCH_APPEARS_ABOVE ? (
                  <div className="ed-start-search">
                    <MagnifyingGlass size={15} weight="regular" aria-hidden="true" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={t.start.findCar}
                      aria-label={t.start.findCar}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                ) : null}

                <div className="ed-start-lotvin">
                  <label className="ed-start-lotvin-label" htmlFor="tj-lot-vin">
                    {t.start.notOnLot}
                  </label>
                  <input
                    id="tj-lot-vin"
                    className="ed-input"
                    value={lotVin}
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t.start.vinPlaceholder}
                    onChange={(event) => {
                      setLotVin(event.target.value.toUpperCase());
                      setError(null);
                    }}
                  />

                  {/* Seventeen is not a number anybody counts by eye, and a
                      VIN one character short looks exactly like a whole one.
                      The count says how far along the typing is, and stops
                      the moment the field holds a real VIN. */}
                  {lotVin.trim().length > 0 && !asVin(lotVin) ? (
                    <p className="ed-fine mt-2 text-[color:var(--tj-muted)]">
                      {t.start.vinCount.replace("{count}", String(lotVin.trim().length))}
                    </p>
                  ) : null}

                  {vinProbe?.status === "looking" ? (
                    <p className="ed-start-note" role="status">
                      {t.start.vinLookingUp}
                    </p>
                  ) : null}

                  {vinProbe?.status === "found" ? (
                    <ul className="ed-pick-grid list-none p-0 mt-4">
                      <li>
                        <button type="button" onClick={useDecodedVin} className="ed-pick w-full">
                          <span className="ed-pick-media">
                            <span className="ed-pick-empty">{t.start.noPhoto}</span>
                          </span>
                          <span className="ed-pick-body block">
                            <span className="ed-pick-name block">
                              {[vinProbe.year, vinProbe.make, vinProbe.model]
                                .filter(Boolean)
                                .join(" ") || t.start.untitledVehicle}
                            </span>
                            <span className="ed-pick-meta block">
                              {t.start.vinNotOnLot} · {vinProbe.vin.slice(-6)}
                            </span>
                            <span className="ed-pick-meta block text-[color:var(--tj-copper,#8a4f2b)]">
                              {t.start.vinUseThis}
                            </span>
                          </span>
                        </button>
                      </li>
                    </ul>
                  ) : null}

                  {/* A VIN the decoder could not place is still a car somebody
                      is standing next to, so the way in by hand stays open. */}
                  {vinProbe?.status === "none" ? (
                    <>
                      <p className="ed-start-note" role="status">
                        {t.start.vinNoDecode}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setManual(true);
                          setChosenId(null);
                          setTitleAnswer("");
                          setError(null);
                          if (VIN_PATTERN.test(lotVin.trim())) setVin(lotVin.trim());
                          window.requestAnimationFrame(() => vinRef.current?.focus());
                        }}
                        className="ed-start-quiet"
                      >
                        {t.start.enterByHand}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {shown.length === 0 ? (
                <p className="ed-start-none">{t.start.noCarByName}</p>
              ) : (
                <ul className="ed-pick-grid list-none p-0">
                  {shown.map((vehicle) => (
                    <li key={vehicle.id}>
                      <button
                        type="button"
                        onClick={() => choose(vehicle)}
                        className="ed-pick w-full"
                      >
                        <span className="ed-pick-media">
                          {vehicle.imageUrl ? (
                            <Image
                              src={vehicle.imageUrl}
                              alt=""
                              fill
                              sizes="(max-width: 640px) 50vw, 240px"
                              style={{ objectFit: "cover" }}
                            />
                          ) : (
                            <span className="ed-pick-empty">{t.start.noPhoto}</span>
                          )}
                        </span>
                        <span className="ed-pick-body block">
                          <span className="ed-pick-name block">{carName(vehicle, t.start.untitledVehicle)}</span>
                          <span className="ed-pick-meta block">
                            {vehicle.mileage != null
                              ? `${vehicle.mileage.toLocaleString()} mi`
                              : t.start.mileageNotSet}
                            {vehicle.vin
                              ? ` · ${vehicle.vin.slice(-6).toUpperCase()}`
                              : ""}
                          </span>
                          {(() => {
                            const gate = gateTitleStatus(vehicle.titleStatus);
                            if (gate.ok) return null;
                            return (
                              <span className="ed-pick-meta block text-[color:var(--tj-copper,#8a4f2b)]">
                                {gate.reason === "unsellable"
                                  ? t.start.titleUnsellableBadge
                                  : t.start.titleUnverifiedBadge}
                              </span>
                            );
                          })()}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {/* The car's own facts belong with the car, not three questions
              later on the buyer's screen. */}
          {carSettled ? (
            <div className="ed-start-fields mt-6">
              {manual ? (
                <>
                  <div className="ed-start-wide">
                    <span className="ed-field-label">{t.start.vin}<Req /></span>
                    <div className="ed-start-vin">
                      <input
                        ref={vinRef}
                        name="vin"
                        required
                        className="ed-input"
                        value={vin}
                        aria-label="VIN"
                        autoCapitalize="characters"
                        autoComplete="off"
                        placeholder="17 characters"
                        onChange={(event) => {
                          setVin(event.target.value.toUpperCase());
                          setError(null);
                          // A title answer belongs to one vehicle. Changing the
                          // VIN makes the previous answer unsafe to carry over.
                          setTitleAnswer("");
                          setTitleBlock(null);
                        }}
                      />
                      <button
                        type="button"
                        onClick={lookUpVin}
                        disabled={decoding || vin.trim().length < 17}
                        aria-describedby={
                          vin.trim().length > 0 && vin.trim().length < 17
                            ? "vin-count"
                            : undefined
                        }
                        className="tj-action-base tj-action-secondary tj-action-md"
                      >
                        {decoding ? t.start.lookingUp : t.start.lookUp}
                      </button>
                    </div>

                    {/* The placeholder says "17 characters" and then vanishes on
                        the first keystroke, which is exactly when the count
                        starts to matter. After that the button is dead and
                        nothing says why, so the count is shown live instead. */}
                    {vin.trim().length > 0 && vin.trim().length < 17 ? (
                      <p id="vin-count" className="ed-fine mt-2 text-[color:var(--tj-muted)]">
                        {vin.trim().length} of 17
                      </p>
                    ) : null}
                    {decodeNote ? (
                      <p className="ed-start-note" role="status">
                        {decodeNote}
                      </p>
                    ) : null}
                  </div>

                  <label>
                    <span className="ed-field-label">{t.start.year}<Req /></span>
                    <input
                      name="carYear"
                      required
                      className="ed-input"
                      value={carYear}
                      type="number"
                      inputMode="numeric"
                      autoComplete="off"
                      onChange={(event) => setCarYear(event.target.value)}
                    />
                  </label>

                  <label>
                    <span className="ed-field-label">{t.start.make}<Req /></span>
                    <input
                      name="carMake"
                      required
                      className="ed-input"
                      value={carMake}
                      autoComplete="off"
                      onChange={(event) => setCarMake(event.target.value)}
                    />
                  </label>

                  <label className="ed-start-wide">
                    <span className="ed-field-label">{t.start.model}<Req /></span>
                    <input
                      name="carModel"
                      required
                      className="ed-input"
                      value={carModel}
                      autoComplete="off"
                      onChange={(event) => setCarModel(event.target.value)}
                    />
                  </label>

                </>
              ) : null}
              <label>
                <span className="ed-field-label">{t.start.odometer}<Req /></span>
                <input
                  ref={mileageRef}
                  name="mileage"
                  required
                  className="ed-input"
                  value={mileage}
                  type="number"
                  min="0"
                  inputMode="numeric"
                  autoComplete="off"
                  onChange={(event) => setMileage(event.target.value)}
                />
              </label>

              {/*
                An explicit question, not a defaulted setting. The answer is
                legally load-bearing — a Spanish-conducted sale requires the
                Spanish Buyers Guide and disclosures (FTC 455.5; Tex. Fin.
                Code §348.006) — and passively-captured language fields are
                wrong for roughly a third of non-English speakers, so the
                operator answers it and the record shows somebody did.
                `required` is what makes no-answer impossible, not a default.
              */}
              <label>
                <span className="ed-field-label">{t.saleLanguage.question}<Req /></span>
                <select
                  name="language"
                  value={saleLanguage}
                  required
                  className="ed-input ed-select"
                  onChange={(event) => {
                    setSaleLanguage(event.target.value as "" | "en" | "es");
                    setError(null);
                  }}
                >
                  <option value="" disabled>
                    {t.saleLanguage.choose}
                  </option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </label>
            </div>
          ) : null}
        </fieldset>
        ) : null}

        {stage === "carDetails" ? (
          <fieldset
            data-start-stage="carDetails"
            data-tj-stagger
            disabled={pending}
            aria-labelledby="start-sale-question"
            className="ed-start-fields border-0 p-0"
          >
            {/* A VIN identifies the car but cannot answer these three facts.
                They stay editable because the person looking at the car owns
                the answer. */}
            <label>
              <span className="ed-field-label">{t.start.exteriorColor}<Req /></span>
              <select
                name="carExterior"
                required
                value={carExterior}
                className="ed-input ed-select"
                onChange={(event) => setCarExterior(event.target.value)}
              >
                <option value="">{t.start.notSaidYet}</option>
                {VEHICLE_COLORS.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="ed-field-label">{t.start.interiorColor}</span>
              <select
                name="carInterior"
                value={carInterior}
                className="ed-input ed-select"
                onChange={(event) => setCarInterior(event.target.value)}
              >
                <option value="">{t.start.notSaidYet}</option>
                {INTERIOR_COLORS.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="ed-field-label">{t.start.bodyStyle}<Req /></span>
              <select
                name="carBodyStyle"
                required
                value={carBodyStyle}
                className="ed-input ed-select"
                onChange={(event) => setCarBodyStyle(event.target.value)}
              >
                <option value="">{t.start.notSaidYet}</option>
                {BODY_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {style}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        ) : null}

        {stage === "carTitle" ? (
          <fieldset
            data-start-stage="carTitle"
            data-tj-stagger
            disabled={pending}
            aria-labelledby="start-sale-question"
            className="ed-start-fields border-0 p-0"
          >
            {/* Asked on every sale, in words a person can answer. Each kind
                says what the paper looks like and what it means for this
                sale, so the desk does not have to know the law to answer.
                "I don't know" opens how to tell. A salvage title goes on:
                the sale begins and holds at the title work. */}
            <p className="ed-field-label">{t.start.titleWhat}<Req /></p>
            <div role="radiogroup" aria-labelledby="start-sale-question" className="ed-title-kinds">
              {TITLE_KINDS.map((kind) => {
                const words = t.start as unknown as Record<string, string>;
                const on = titleAnswer === kind.value;
                return (
                  <label
                    key={kind.value}
                    className="ed-title-kind"
                    data-on={on ? "true" : "false"}
                    data-path={kind.path ?? "none"}
                  >
                    <input
                      type="radio"
                      name="titleStatus"
                      required
                      value={kind.value}
                      checked={on}
                      onChange={() => {
                        setTitleAnswer(kind.value);
                        setError(null);
                        setTitleBlock(null);
                      }}
                    />
                    <span className="ed-title-kind-label">{words[`titleKind${kind.key}`]}</span>
                    <span className="ed-title-kind-paper">{words[`titleKind${kind.key}Paper`]}</span>
                    {on ? <span className="ed-title-kind-needs">{words[`titleKind${kind.key}Needs`]}</span> : null}
                  </label>
                );
              })}
              <label className="ed-title-kind ed-title-kind-unknown" data-on={titleAnswer === "unknown" ? "true" : "false"}>
                <input
                  type="radio"
                  name="titleStatus"
                  value="unknown"
                  checked={titleAnswer === "unknown"}
                  onChange={() => {
                    setTitleAnswer("unknown");
                    setError(null);
                    setTitleBlock(null);
                  }}
                />
                <span className="ed-title-kind-label">{t.start.titleKindUnknown}</span>
              </label>
            </div>
            {titleAnswer === "unknown" ? (
              <div className="ed-title-tell" data-title-tell>
                <p className="ed-title-tell-title">{t.start.titleTellTitle}</p>
                <ol>
                  {TITLE_TELL_KEYS.map((key) => (
                    <li key={key}>{(t.start as unknown as Record<string, string>)[key]}</li>
                  ))}
                </ol>
              </div>
            ) : null}
            {/* A salvage answer opens the second question at once: what
                happens with it. Three cards, "not sure yet" among them, so
                the desk can say what it knows and no more. The guide asks
                the same question first and shows this answer. */}
            {titleAnswer === "salvage_unrebuilt" ? (
              <div className="ed-title-tell ed-title-follow" data-salvage-path role="radiogroup" aria-label={t.start.salvageWhat}>
                <p className="ed-title-tell-title">{t.start.salvageWhat}</p>
                <div className="ed-title-kinds mt-3">
                  {(["rebuild", "towAway", "undecided"] as const).map((path) => {
                    const words = t.plan as unknown as Record<string, string>;
                    const suffix = path === "rebuild" ? "Rebuild" : path === "towAway" ? "TowAway" : "Undecided";
                    const on = salvagePath === path;
                    return (
                      <label key={path} className="ed-title-kind ed-title-kind-sub" data-on={on ? "true" : "false"}>
                        <input
                          type="radio"
                          name="salvagePath"
                          value={path}
                          checked={on}
                          onChange={() => setSalvagePath(path)}
                        />
                        <span className="ed-title-kind-label">{words[`salvagePath${suffix}`]}</span>
                        <span className="ed-title-kind-paper">{words[`salvagePath${suffix}Gloss`]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {/* Where the title was issued, when it was not Texas. Not a
                brand: the brand above still decides the packet. What it
                adds is a VIN inspection before Texas titles the car, and
                the title step says so once this is recorded. */}
            {titleAnswer && titleAnswer !== "unknown" && titleAnswer !== "nonrepairable" ? (
              <div className="ed-title-origin" data-title-origin>
                <label className="ed-title-origin-toggle">
                  <input
                    type="checkbox"
                    name="titleFromElsewhere"
                    checked={titleFromElsewhere}
                    onChange={(event) => {
                      setTitleFromElsewhere(event.target.checked);
                      if (!event.target.checked) setTitleOrigin("");
                      setError(null);
                    }}
                  />
                  <span>{t.start.titleOriginLabel}</span>
                </label>
                {titleFromElsewhere ? (
                  <div className="ed-title-origin-which">
                    <label className="ed-field-label" htmlFor="start-title-origin">
                      {t.start.titleOriginWhich}
                      <Req />
                    </label>
                    <select
                      id="start-title-origin"
                      name="titleOriginState"
                      value={titleOrigin}
                      onChange={(event) => {
                        setTitleOrigin(event.target.value);
                        setError(null);
                      }}
                    >
                      <option value="">{t.start.titleOriginPick}</option>
                      {US_STATES.filter((state) => state.code !== "TX").map((state) => (
                        <option key={state.code} value={state.code}>
                          {state.name}
                        </option>
                      ))}
                    </select>
                    <p className="ed-fine mt-2 text-[color:var(--tj-muted)]">{t.start.titleOriginNeeds}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
            {chosen && !manual && gateTitleStatus(chosen.titleStatus).ok ? (
              <p className="ed-fine mt-2 text-[color:var(--tj-muted)]">
                {t.start.titleFromLot}
              </p>
            ) : null}
          </fieldset>
        ) : null}

        {stage === "name" ? (
          <fieldset
            data-start-stage="name"
            data-tj-stagger
            disabled={pending}
            aria-labelledby="start-sale-question"
            className="ed-start-fields border-0 p-0"
          >

              {/*
                The name in the boxes the government forms print.

                It used to be one box, and every form downstream then had to
                work out where the surname began. That cannot be done reliably:
                "Ana Maria Garcia" and "John Michael Smith" are the same shape
                and only one of the two splits is correct, and the wrong one
                goes on a title application. Four boxes here is a few seconds
                once, against a wrong name on a state form.

                First and last are required; middle and suffix are not, because
                plenty of people have neither.
              */}
              <label>
                <span className="ed-field-label">{t.start.firstName}<Req /></span>
                <input
                  ref={buyerRef}
                  name="buyerFirstName"
                  required
                  autoComplete="off"
                  className="ed-input"
                  placeholder={t.start.asOnId}
                  value={buyerFirstName}
                  onChange={(event) => {
                    setBuyerFirstName(event.target.value);
                    setError(null);
                  }}
                />
              </label>

              <label>
                <span className="ed-field-label">{t.start.middleName}</span>
                <input
                  name="buyerMiddleName"
                  autoComplete="off"
                  className="ed-input"
                  value={buyerMiddleName}
                  onChange={(event) => setBuyerMiddleName(event.target.value)}
                />
              </label>

              <label>
                <span className="ed-field-label">{t.start.lastName}<Req /></span>
                <input
                  ref={buyerLastRef}
                  name="buyerLastName"
                  required
                  autoComplete="off"
                  className="ed-input"
                  value={buyerLastName}
                  onChange={(event) => {
                    setBuyerLastName(event.target.value);
                    setError(null);
                  }}
                />
              </label>

              <label>
                <span className="ed-field-label">{t.start.suffix}</span>
                <input
                  name="buyerSuffix"
                  autoComplete="off"
                  className="ed-input"
                  placeholder={t.start.suffixHint}
                  value={buyerSuffix}
                  onChange={(event) => setBuyerSuffix(event.target.value)}
                />
              </label>

              {coBuyer ? (
                <label>
                  <span className="ed-field-label">{t.start.coBuyerName}</span>
                  <input
                    name="coBuyerName"
                    autoComplete="off"
                    className="ed-input"
                    value={coBuyerName}
                    onChange={(event) => setCoBuyerName(event.target.value)}
                  />
                </label>
              ) : null}

              <button
                type="button"
                onClick={() => setCoBuyer((on) => !on)}
                className="ed-start-quiet"
              >
                {coBuyer ? t.start.noCoBuyer : t.start.addCoBuyer}
              </button>
          </fieldset>
        ) : null}

        {stage === "contact" ? (
          <fieldset
            data-start-stage="contact"
            data-tj-stagger
            disabled={pending}
            aria-labelledby="start-sale-question"
            className="ed-start-fields border-0 p-0"
          >

              {/* Every control below names itself with aria-labelledby rather
                  than letting the browser build a name out of everything
                  inside the label.

                  Measured, on this screen: typing six digits turned the phone
                  field's accessible name into "Phone4 more", and seven digits
                  turned the ID field's into "ID numberA TX licence number is 8
                  characters. This one is 7." A control's name is how somebody
                  using a screen reader knows which box they are in, and it was
                  changing under them on every keystroke, while the hint got
                  read out twice: once as part of the name, once as the
                  description it already is. */}
              <label>
                <span id="label-buyer-phone" className="ed-field-label">{t.start.phone}<Req /></span>
                <input
                  name="buyerPhone"
                  type="tel"
                  required
                  inputMode="tel"
                  autoComplete="off"
                  className="ed-input"
                  placeholder="(000) 000-0000"
                  value={buyerPhone}
                  aria-labelledby="label-buyer-phone"
                  aria-describedby={
                    buyerPhone && phoneDigitsRemaining(buyerPhone) > 0
                      ? "phone-remaining"
                      : undefined
                  }
                  // Formatted as it grows rather than on blur. A number that
                  // rearranges itself once you look away reads as the field
                  // arguing, and hides a typo until you have stopped looking
                  // at the card.
                  onChange={(event) => {
                    setBuyerPhone(formatPhone(event.target.value));
                    setError(null);
                  }}
                />
                {buyerPhone && phoneDigitsRemaining(buyerPhone) > 0 ? (
                  <span id="phone-remaining" className="ed-fine text-[color:var(--tj-muted)]">
                    {phoneDigitsRemaining(buyerPhone)} more
                  </span>
                ) : null}
              </label>

              <label>
                <span className="ed-field-label">{t.start.email}</span>
                <input
                  name="buyerEmail"
                  type="email"
                  autoComplete="off"
                  className="ed-input"
                  value={buyerEmail}
                  onChange={(event) => setBuyerEmail(event.target.value)}
                />
              </label>
          </fieldset>
        ) : null}

        {stage === "identity" ? (
          <fieldset
            data-start-stage="identity"
            data-tj-stagger
            disabled={pending}
            aria-labelledby="start-sale-question"
            className="ed-start-fields border-0 p-0"
          >
              {/* The shared scanner stays beside the ID fields it can fill.
                  The previews make a bad photograph visible while the card is
                  still on the counter. */}
              <div className="ed-start-scan">
                <button
                  type="button"
                  className="ed-btn ed-btn-dark ed-start-scan-open"
                  onClick={() => {
                    setScanNote(null);
                    setScanning(true);
                  }}
                >
                  <IdentificationCard size={18} weight="regular" aria-hidden="true" />
                  {t.start.scanId}
                </button>

                {shot ? (
                  <div className="ed-start-shots">
                    <figure className="ed-start-shot">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={shot.front} alt={t.start.frontJustShot} />
                      <figcaption className="ed-fine">{t.start.front}</figcaption>
                    </figure>
                    {shot.back ? (
                      <figure className="ed-start-shot">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={shot.back} alt={t.start.backJustShot} />
                        <figcaption className="ed-fine">{t.start.back}</figcaption>
                      </figure>
                    ) : (
                      <p className="ed-start-shot-missing ed-fine">{t.start.noBack}</p>
                    )}
                  </div>
                ) : (
                  <div className="ed-start-shots ed-start-shots-hint" aria-hidden="true">
                    <figure className="ed-start-shot">
                      <IdCardFront />
                      <figcaption className="ed-fine">{t.start.front}</figcaption>
                    </figure>
                    <figure className="ed-start-shot">
                      <IdCardBack />
                      <figcaption className="ed-fine">{t.start.back}</figcaption>
                    </figure>
                  </div>
                )}

                {scanNote ? (
                  <p role="status" className="ed-start-scan-note">
                    {scanNote}
                  </p>
                ) : null}
              </div>

              <label>
                <span id="label-id-kind" className="ed-field-label">{t.start.idKind}</span>
                <select
                  name="buyerIdKind"
                  className="ed-input ed-select"
                  // Without this the name is the label plus every option in
                  // the list, read out as one run-on string.
                  aria-labelledby="label-id-kind"
                  value={idKind}
                  onChange={(event) => chooseIdKind(event.target.value as IdDocumentKind)}
                >
                  {ID_DOCUMENT_TYPES.map((type) => (
                    <option key={type.kind} value={type.kind}>
                      {t.start.idKinds[type.kind] ?? type.label}
                    </option>
                  ))}
                </select>
              </label>

              {idDocumentType(idKind).needsState ? (
                <label>
                  <span id="label-id-state" className="ed-field-label">{t.start.issuingState}</span>
                  {/* A list, not a text box. Every state is here, so the
                      typed "Tx", "tex" and "TX " family of answers cannot
                      happen. Code first, because the dealer who knows the
                      code scans for it faster than for the name. */}
                  <select
                    name="buyerIdState"
                    className="ed-input ed-select"
                    aria-labelledby="label-id-state"
                    value={idState}
                    onChange={(event) => setIdState(event.target.value)}
                  >
                    {US_STATES.map((state) => (
                      <option key={state.code} value={state.code}>
                        {state.code} - {state.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {idDocumentType(idKind).needsCountry ? (
                <label>
                  <span id="label-id-country" className="ed-field-label">{t.start.issuingCountry}</span>
                  {/* The countries whose passports actually walk into a lot
                      here, most common first, and "another country" for the
                      rest. The number check knows each one's shape. */}
                  <select
                    name="buyerIdCountry"
                    className="ed-input ed-select"
                    aria-labelledby="label-id-country"
                    value={idState}
                    onChange={(event) => setIdState(event.target.value)}
                  >
                    {PASSPORT_COUNTRIES.map((country) => (
                      <option key={country.code} value={country.code}>
                        {(t.start.countries as Record<string, string>)[country.code] ?? country.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label>
                <span id="label-id-number" className="ed-field-label">{t.start.idNumber}<Req /></span>
                <input
                  name="buyerIdNumber"
                  required
                  autoComplete="off"
                  inputMode={idIsAllDigits ? "numeric" : "text"}
                  className="ed-input uppercase"
                  placeholder={idDocumentType(idKind).placeholder}
                  value={idNumber}
                  maxLength={idMaxLength(idKind, idState)}
                  aria-labelledby="label-id-number"
                  aria-describedby={idWarning ? "id-warning" : undefined}
                  onChange={(event) => setIdNumber(normalizeIdNumber(event.target.value))}
                />
                {/* A warning, never a block. States reissue formats and
                    grandfather old numbers, and refusing a number that is
                    genuinely on the card would stop a real sale. */}
                {idWarning ? (
                  <span id="id-warning" role="status" className="ed-fine text-[color:var(--tj-copper)]">
                    {idWarning}
                  </span>
                ) : null}
              </label>

          </fieldset>
        ) : null}

        {stage === "address" ? (
          <fieldset
            data-start-stage="address"
            data-tj-stagger
            disabled={pending}
            aria-labelledby="start-sale-question"
            className="ed-start-fields border-0 p-0"
          >
              {/* The address is last because its Next is the final submit and
                  the read-back dialog belongs to that exact attempt. County
                  stays here because the 130-U prints it with this address. */}
              <label className="ed-start-wide">
                <span className="ed-field-label">{t.start.streetAddress}<Req /></span>
                <input
                  ref={buyerStreetRef}
                  name="buyerStreet"
                  required
                  value={buyerStreet}
                  autoComplete="off"
                  className="ed-input"
                  onChange={(event) => {
                    setBuyerStreet(event.target.value);
                    setMailingConfirmed(false);
                    // A new line is a new address. The old note would be
                    // describing boxes that no longer belong to it.
                    setAddressFilledFrom(null);
                    filledUndo.current = null;
                  }}
                />
                {/* What the lookup did, said plainly and undoable in one tap.
                    Nothing here blocks: while it is looking, the desk keeps
                    typing, and the fields it fills are only ever empty ones. */}
                {addressFilling ? (
                  <span className="ed-address-note" role="status">
                    {t.start.addressLookingUp}
                  </span>
                ) : addressFilledFrom ? (
                  <span className="ed-address-note" role="status">
                    {fillTemplate(t.start.addressFilled, { address: addressFilledFrom })}{" "}
                    <button
                      type="button"
                      className="ed-address-undo"
                      onClick={() => {
                        const before = filledUndo.current;
                        if (before) {
                          setBuyerCity(before.city);
                          setBuyerZip(before.zip);
                          setBuyerCounty(before.county);
                        }
                        filledUndo.current = null;
                        setAddressFilledFrom(null);
                      }}
                    >
                      {t.start.addressUndo}
                    </button>
                  </span>
                ) : null}
              </label>

              <label>
                <span className="ed-field-label">{t.start.city}<Req /></span>
                <input
                  name="buyerCity"
                  required
                  value={buyerCity}
                  autoComplete="off"
                  className="ed-input"
                  onChange={(event) => {
                    setBuyerCity(event.target.value);
                    setMailingConfirmed(false);
                  }}
                />
              </label>

              <div className="ed-start-pair">
                <label>
                  <span className="ed-field-label">{t.start.state}</span>
                  <select
                    name="buyerAddrState"
                    value={buyerAddrState}
                    className="ed-input ed-select"
                    onChange={(event) => {
                      setBuyerAddrState(event.target.value);
                      setMailingConfirmed(false);
                    }}
                  >
                    {US_STATES.map((state) => (
                      <option key={state.code} value={state.code}>
                        {state.code}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="ed-field-label">{t.start.zip}<Req /></span>
                  <input
                    name="buyerZip"
                    required
                    value={buyerZip}
                    inputMode="numeric"
                    autoComplete="off"
                    className="ed-input"
                    onChange={(event) => {
                      setBuyerZip(event.target.value);
                      setMailingConfirmed(false);
                    }}
                  />
                </label>
              </div>

              <label>
                <span className="ed-field-label">{t.start.county}<Req /></span>
                <input
                  name="buyerCounty"
                  required
                  value={buyerCounty}
                  list="tj-tx-counties"
                  autoComplete="off"
                  className="ed-input"
                  onChange={(event) => {
                    setBuyerCounty(event.target.value);
                    setMailingConfirmed(false);
                  }}
                />
                <datalist id="tj-tx-counties">
                  {TEXAS_COUNTIES.map((county) => (
                    <option key={county} value={county} />
                  ))}
                </datalist>
              </label>

          </fieldset>
        ) : null}

      {error ? (
        <p role="alert" className="ed-start-error">
          {error}
          {openDealId ? (
            <>
              {" "}
              <Link href={`/admin/sales/${openDealId}`}>{t.start.openIt}</Link>.
            </>
          ) : null}
          {titleBlock ? (
            <>
              {" "}
              {/* A salvage title is not a dead end: the car has a path to a
                  rebuilt title, and the refusal opens it. */}
              {titleBlock.status === "salvage_unrebuilt" ? (
                <Link href={`/admin/inventory/${titleBlock.vehicleId}/title-work`}>
                  {t.start.titleWorkLink}
                </Link>
              ) : (
                <Link href="/admin/inventory/title-status">
                  {t.start.titleResolveLink}
                </Link>
              )}
              .
            </>
          ) : null}
        </p>
      ) : null}

      {/* One action per screen. Next while there is another question, Start
          Sale on the last one, and a way back that does not lose what was
          already typed. */}
      {carSettled ? (
        <>
        {/* What the mark means, said once, where the eye lands before Next. */}
        <p className="ed-req-legend">
          <span className="ed-req" aria-hidden="true">
            *
          </span>
          {t.chrome.required}
        </p>
        <div className="ed-flow-actions">
          {stageIndex > 0 ? (
            <button
              type="button"
              onClick={() => {
                const previous = stages[stageIndex - 1];
                if (previous) moveStage(previous, "back");
              }}
              className="tj-action-base tj-action-ghost tj-action-md"
            >
              <ArrowLeft size={16} weight="regular" aria-hidden="true" />
              {t.chrome.back}
            </button>
          ) : null}

          {stageIndex < stages.length - 1 ? (
            <button
              type="button"
              onClick={(event) => {
                const form = event.currentTarget.form;
                if (form) advance(form);
              }}
              disabled={!stageReady}
              className="tj-action-base tj-action-primary tj-action-md"
            >
              {t.chrome.next}
              <ArrowRight size={16} weight="regular" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={pending || !stageReady}
              className="tj-action-base tj-action-primary tj-action-md"
            >
              {pending ? t.start.starting : t.start.startSale}
            </button>
          )}
        </div>
        </>
      ) : null}
      </div>
      </main>
      <DeskConfirm pending={mailingAsk.pending} onAnswer={mailingAsk.answer} />
    </form>
  );
}
