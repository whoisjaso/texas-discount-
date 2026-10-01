"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Paperclip, X } from "@phosphor-icons/react";
import { receiveRebuiltTitle, removeTitleWorkFile, saveVtr61Data, setTitleWorkStep } from "@/lib/actions/title-work";
import {
  AFTER_REBUILT_TITLE,
  TITLE_PATH_STEPS,
  titlePathProgress,
  type TitlePathStepKey,
  type TitleWorkRow,
} from "@/lib/vehicles/title-path";
import {
  FILE_KINDS,
  STEP_FILE_KINDS,
  VTR61_COMPONENTS,
  readFiles,
  readVtr61,
  stepReadiness,
  vtr61Missing,
  type TitleWorkFile,
  type TitleWorkFileKind,
  type Vtr61Data,
  type Vtr61Part,
} from "@/lib/vehicles/title-work-evidence";

/**
 * The checklist. A tap marks a step done or undone and the meter follows;
 * the last row is a button, because the county's title is an event, not a
 * tick, and it changes the car.
 *
 * Each step now carries its proof. The paper in hand takes the title scan
 * and the purchase receipt; the repairs take a receipt per part; the
 * VTR-61 takes the form's own facts, typed here and printed onto the
 * state's PDF; the photos and the inspection take theirs. A tick on a step
 * whose proof is missing is refused, and the refusal names what is missing,
 * so the packet is complete because the checklist would not let it not be.
 *
 * Lives in components because two screens draw it: the inventory's Title
 * Work page, and the sale guide's "Rebuild The Title First" step.
 */
export default function TitleWorkChecklist({ vehicleId, rows }: { vehicleId: string; rows: TitleWorkRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [work, setWork] = useState<TitleWorkRow[]>(rows);
  const [busy, setBusy] = useState<TitlePathStepKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<TitlePathStepKey | null>(null);
  // Measured here rather than handed down: the path's steps carry a
  // function (the form link), which a server component cannot pass.
  const progress = titlePathProgress(work);

  function rowFor(step: TitlePathStepKey): TitleWorkRow | undefined {
    return work.find((row) => row.step === step);
  }

  function patchRow(step: TitlePathStepKey, patch: Partial<TitleWorkRow>) {
    setWork((current) => {
      const existing = current.find((row) => row.step === step);
      const next: TitleWorkRow = { step, completed_at: null, note: null, data: {}, files: [], ...existing, ...patch };
      return [...current.filter((row) => row.step !== step), next];
    });
  }

  function toggle(step: TitlePathStepKey) {
    const done = Boolean(progress.done[step]);
    if (!done) {
      // Said on the screen before the round trip says it back.
      const readiness = stepReadiness(step, work);
      if (!readiness.ok) {
        setError(`Not yet. This step still needs ${readiness.missing.join("; ")}.`);
        setOpen(step);
        return;
      }
    }
    setBusy(step);
    setError(null);
    startTransition(async () => {
      const result = await setTitleWorkStep({ vehicleId, step, done: !done });
      setBusy(null);
      if (!result.success) {
        setError(result.error);
        return;
      }
      patchRow(step, { completed_at: done ? null : new Date().toISOString() });
    });
  }

  function receive() {
    setBusy("received");
    setError(null);
    startTransition(async () => {
      const result = await receiveRebuiltTitle({ vehicleId });
      setBusy(null);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  async function upload(step: TitlePathStepKey, kind: TitleWorkFileKind, file: File) {
    setBusy(step);
    setError(null);
    try {
      const body = new FormData();
      body.set("vehicleId", vehicleId);
      body.set("step", step);
      body.set("kind", kind);
      body.set("file", file);
      const response = await fetch("/api/title-work/upload", { method: "POST", body });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; file?: TitleWorkFile };
      if (!response.ok || !payload.file) {
        setError(payload.error ?? "The file did not save. Try again.");
        return;
      }
      const files = [...readFiles(rowFor(step)?.files), payload.file];
      patchRow(step, { files });
    } catch {
      setError("The file did not save. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function remove(step: TitlePathStepKey, path: string) {
    setBusy(step);
    setError(null);
    startTransition(async () => {
      const result = await removeTitleWorkFile({ vehicleId, step, path });
      setBusy(null);
      if (!result.success) {
        setError(result.error);
        return;
      }
      patchRow(step, { files: readFiles(rowFor(step)?.files).filter((file) => file.path !== path) });
    });
  }

  const required = TITLE_PATH_STEPS.filter((step) => !step.optional && step.key !== "received");

  return (
    <div>
      <div className="ed-titlework-meter" aria-hidden="true">
        {required.map((step) => (
          <span key={step.key} data-done={progress.done[step.key] ? "true" : "false"} />
        ))}
      </div>
      <p className="ed-fine mt-2 text-[color:var(--tj-muted)]" aria-live="polite">
        {progress.readyToReceive
          ? "Filed. Waiting on the county."
          : progress.next
            ? `Next: ${progress.next.label}`
            : ""}
      </p>

      <ol className="ed-titlework-steps">
        {TITLE_PATH_STEPS.filter((step) => step.key !== "received").map((step) => {
          const done = progress.done[step.key];
          const kinds = STEP_FILE_KINDS[step.key] ?? [];
          const files = readFiles(rowFor(step.key)?.files);
          const readiness = stepReadiness(step.key, work);
          const expanded = open === step.key;
          const hasBody = kinds.length > 0 || step.key === "vtr61";
          return (
            <li key={step.key} className="ed-titlework-step" data-done={done ? "true" : "false"} data-step={step.key} data-open={expanded ? "true" : "false"}>
              <button
                type="button"
                className="ed-titlework-check"
                data-done={done ? "true" : "false"}
                aria-pressed={Boolean(done)}
                aria-label={`${done ? "Undo" : "Done"}: ${step.label}`}
                disabled={busy !== null}
                onClick={() => toggle(step.key)}
              >
                <Check size={14} weight="bold" aria-hidden="true" />
              </button>
              <span className="ed-titlework-label">
                {step.label}
                {step.optional ? <span className="ed-titlework-optional">If asked</span> : null}
              </span>
              <span className="ed-titlework-what">{step.what}</span>
              <span className="ed-titlework-tools">
                {step.form ? (
                  <a href={step.form.href(vehicleId)} target="_blank" rel="noreferrer">
                    {step.form.label}
                  </a>
                ) : null}
                {hasBody ? (
                  <button
                    type="button"
                    className="ed-titlework-open"
                    aria-expanded={expanded}
                    data-titlework-open={step.key}
                    onClick={() => setOpen(expanded ? null : step.key)}
                  >
                    <Paperclip size={13} aria-hidden="true" />
                    {step.key === "vtr61"
                      ? expanded
                        ? "Close the form"
                        : "Fill in the facts"
                      : files.length > 0
                        ? `${files.length} on file`
                        : "Add the proof"}
                  </button>
                ) : null}
                {!done && !readiness.ok && !expanded ? (
                  <span className="ed-titlework-needs" data-titlework-needs>
                    Needs {readiness.missing[0]}
                    {readiness.missing.length > 1 ? ` and ${readiness.missing.length - 1} more` : ""}
                  </span>
                ) : null}
                {done ? (
                  <span className="ed-titlework-when">
                    Done {new Date(done.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                ) : null}
              </span>

              {expanded && kinds.length > 0 ? (
                <div className="ed-titlework-body">
                  <FileList
                    step={step.key}
                    kinds={kinds}
                    files={files}
                    busy={busy === step.key}
                    onUpload={(kind, file) => void upload(step.key, kind, file)}
                    onRemove={(path) => remove(step.key, path)}
                  />
                </div>
              ) : null}

              {expanded && step.key === "vtr61" ? (
                <div className="ed-titlework-body">
                  <Vtr61Form
                    vehicleId={vehicleId}
                    initial={readVtr61(rowFor("vtr61")?.data)}
                    onSaved={(data) => patchRow("vtr61", { data })}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="ed-titlework-receive">
        <button
          type="button"
          className="tj-action-base tj-action-primary tj-action-md"
          disabled={!progress.readyToReceive || busy !== null}
          onClick={receive}
          data-titlework-receive
        >
          {busy === "received" ? "Recording…" : "Rebuilt Title Received"}
        </button>
        {!progress.readyToReceive ? (
          <p className="ed-fine mt-2 text-[color:var(--tj-muted)]">
            Opens once the packet is with the county.
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="ed-start-error mt-4">
          {error}
        </p>
      ) : null}

      <div className="ed-titlework-after">
        <p className="ed-body text-[color:var(--tj-ink)]">Once the rebuilt title is in hand, the sale does the rest:</p>
        <ul>
          {AFTER_REBUILT_TITLE.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The files on one step, and a way to add one of each kind the step takes. */
function FileList({
  step,
  kinds,
  files,
  busy,
  onUpload,
  onRemove,
}: {
  step: TitlePathStepKey;
  kinds: TitleWorkFileKind[];
  files: TitleWorkFile[];
  busy: boolean;
  onUpload: (kind: TitleWorkFileKind, file: File) => void;
  onRemove: (path: string) => void;
}) {
  const inputs = useRef<Partial<Record<TitleWorkFileKind, HTMLInputElement | null>>>({});
  return (
    <div className="ed-titlework-files" data-titlework-files={step}>
      {kinds.map((kind) => {
        const here = files.filter((file) => file.kind === kind);
        return (
          <div key={kind} className="ed-titlework-kind" data-kind={kind}>
            <div className="ed-titlework-kind-head">
              <span className="ed-titlework-kind-label">{FILE_KINDS[kind].label}</span>
              <span className="ed-titlework-kind-what">{FILE_KINDS[kind].what}</span>
            </div>
            {here.length > 0 ? (
              <ul className="ed-titlework-file-list">
                {here.map((file) => (
                  <li key={file.path}>
                    {file.url ? (
                      <a href={file.url} target="_blank" rel="noreferrer">
                        {file.name}
                      </a>
                    ) : (
                      <span>{file.name}</span>
                    )}
                    <button type="button" aria-label={`Remove ${file.name}`} disabled={busy} onClick={() => onRemove(file.path)}>
                      <X size={12} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <input
              ref={(node) => {
                inputs.current[kind] = node;
              }}
              type="file"
              accept="image/*,application/pdf"
              aria-label={`Attach ${FILE_KINDS[kind].label}`}
              className="sr-only"
              data-titlework-input={kind}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUpload(kind, file);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className="ed-titlework-add"
              disabled={busy}
              data-titlework-add={kind}
              onClick={() => inputs.current[kind]?.click()}
            >
              <Paperclip size={13} aria-hidden="true" />
              {here.length > 0 ? "Add another" : "Add a photo or PDF"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The VTR-61's facts, typed once, printed onto the state's form.
 *
 * The parts logic is the brief's: no parts used means a written statement
 * of the labour instead; a part means where it came from, its number when
 * the form requires one (engine, frame, body), and a donor VIN when it
 * came off another car.
 */
function Vtr61Form({
  vehicleId,
  initial,
  onSaved,
}: {
  vehicleId: string;
  initial: Vtr61Data;
  onSaved: (data: Vtr61Data) => void;
}) {
  const [data, setData] = useState<Vtr61Data>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const missing = vtr61Missing(data);

  function setPart(index: number, patch: Partial<Vtr61Part>) {
    setData((current) => ({
      ...current,
      parts: current.parts.map((part, at) => (at === index ? { ...part, ...patch } : part)),
    }));
  }

  function addPart() {
    const used = new Set(data.parts.map((part) => part.component));
    const next = VTR61_COMPONENTS.find((component) => !used.has(component.key)) ?? VTR61_COMPONENTS[0];
    setData((current) => ({
      ...current,
      noPartsUsed: false,
      parts: [...current.parts, { component: next.key, origin: "", partNumber: "", donorVin: "" }],
    }));
  }

  function save() {
    setSaving(true);
    setError(null);
    setSaved(null);
    void (async () => {
      const result = await saveVtr61Data({ vehicleId, data });
      setSaving(false);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onSaved(data);
      setSaved(
        result.missing && result.missing.length > 0
          ? `Saved. Still needs ${result.missing.join("; ")}.`
          : "Saved. The VTR-61 fills from this.",
      );
    })();
  }

  return (
    <form
      className="ed-titlework-vtr"
      data-vtr61-form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="ed-titlework-grid">
        <label>
          <span className="ed-field-label">Date the work was finished</span>
          <input
            type="date"
            className="ed-input"
            name="dateWorkCompleted"
            value={data.dateWorkCompleted}
            onChange={(event) => setData({ ...data, dateWorkCompleted: event.target.value })}
          />
        </label>
        <label>
          <span className="ed-field-label">Who rebuilt it</span>
          <input
            type="text"
            className="ed-input"
            name="rebuilderName"
            placeholder="Leave blank if we did"
            value={data.rebuilderName}
            onChange={(event) => setData({ ...data, rebuilderName: event.target.value })}
          />
        </label>
      </div>
      <label className="block mt-4">
        <span className="ed-field-label">What work was done</span>
        <textarea
          className="ed-input"
          name="workPerformed"
          rows={3}
          value={data.workPerformed}
          onChange={(event) => setData({ ...data, workPerformed: event.target.value })}
        />
      </label>

      <label className="ed-titlework-noparts">
        <input
          type="checkbox"
          name="noPartsUsed"
          checked={data.noPartsUsed}
          onChange={(event) => setData({ ...data, noPartsUsed: event.target.checked, parts: event.target.checked ? [] : data.parts })}
        />
        <span>No component part was replaced. The repair was labour only.</span>
      </label>

      {data.noPartsUsed ? (
        <label className="block mt-3">
          <span className="ed-field-label">The written statement of the labour, for the form</span>
          <textarea
            className="ed-input"
            name="laborStatement"
            rows={3}
            placeholder="No component part listed on this form was replaced. The repairs consisted of..."
            value={data.laborStatement}
            onChange={(event) => setData({ ...data, laborStatement: event.target.value })}
          />
        </label>
      ) : (
        <div className="ed-titlework-parts" data-vtr61-parts>
          {data.parts.map((part, index) => {
            const component = VTR61_COMPONENTS.find((entry) => entry.key === part.component);
            return (
              <div key={index} className="ed-titlework-part" data-part={part.component}>
                <div className="ed-titlework-grid">
                  <label>
                    <span className="ed-field-label">Component</span>
                    <select
                      className="ed-input"
                      value={part.component}
                      onChange={(event) => setPart(index, { component: event.target.value as Vtr61Part["component"] })}
                    >
                      {VTR61_COMPONENTS.map((entry) => (
                        <option key={entry.key} value={entry.key}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="ed-field-label">
                      Part number{component?.numberRequired ? "" : " (if it has one)"}
                    </span>
                    <input
                      type="text"
                      className="ed-input"
                      value={part.partNumber}
                      onChange={(event) => setPart(index, { partNumber: event.target.value })}
                    />
                  </label>
                </div>
                <label className="block mt-3">
                  <span className="ed-field-label">Where it came from: seller&apos;s name and complete address</span>
                  <input
                    type="text"
                    className="ed-input"
                    value={part.origin}
                    onChange={(event) => setPart(index, { origin: event.target.value })}
                  />
                </label>
                <label className="block mt-3">
                  <span className="ed-field-label">Donor VIN, if it came off another vehicle</span>
                  <input
                    type="text"
                    className="ed-input"
                    maxLength={17}
                    value={part.donorVin}
                    onChange={(event) => setPart(index, { donorVin: event.target.value.toUpperCase() })}
                  />
                </label>
                <button
                  type="button"
                  className="ed-titlework-remove"
                  onClick={() => setData({ ...data, parts: data.parts.filter((_, at) => at !== index) })}
                >
                  Remove this part
                </button>
              </div>
            );
          })}
          <button type="button" className="ed-titlework-add" data-vtr61-add-part onClick={addPart}>
            {data.parts.length > 0 ? "Add another part" : "Add a component part"}
          </button>
        </div>
      )}

      {missing.length > 0 ? (
        <p className="ed-fine mt-4 text-[color:var(--tj-muted)]" data-vtr61-missing>
          Still needs {missing.join("; ")}.
        </p>
      ) : null}

      <div className="ed-titlework-save">
        <button type="submit" className="tj-action-base tj-action-primary tj-action-md" disabled={saving} data-vtr61-save>
          {saving ? "Saving…" : "Save the VTR-61 facts"}
        </button>
        {saved ? <span className="ed-fine text-[color:var(--tj-muted)]">{saved}</span> : null}
      </div>
      {error ? (
        <p role="alert" className="ed-start-error mt-3">
          {error}
        </p>
      ) : null}
    </form>
  );
}
