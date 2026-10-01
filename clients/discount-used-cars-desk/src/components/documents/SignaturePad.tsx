"use client";

import { useRef, useEffect, useState, useCallback } from 'react';
import { ArrowsOut as Maximize2, X } from "@phosphor-icons/react";
import SignaturePadLib from 'signature_pad';
import { tapHaptic } from '@/lib/haptics';

interface Props {
  label: string;
  value: string;
  dateValue: string;
  onChange: (signature: string) => void;
  onDateChange: (date: string) => void;
}

function initCanvas(canvas: HTMLCanvasElement, pad: SignaturePadLib | null, value: string): SignaturePadLib | null {
  const ratio = Math.min(window.devicePixelRatio || 1, 2); // Cap DPR at 2x (~33MB vs 74MB)
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  const ctx = canvas.getContext('2d');
  // No 2d context means no pad. jsdom, where component tests render this,
  // returns null here, and signature_pad's constructor throws on it.
  if (!ctx) return null;
  ctx.scale(ratio, ratio);
  if (pad) { pad.off(); }
  const newPad = new SignaturePadLib(canvas, {
    backgroundColor: 'rgba(255,255,255,0)',
    penColor: '#1a1a1a',
    minWidth: 1,
    maxWidth: 2.5,
  });
  if (value) {
    newPad.fromDataURL(value, { ratio: 1, width: rect.width, height: rect.height });
  }
  return newPad;
}

export default function SignaturePad({ label, value, dateValue, onChange, onDateChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modalCanvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const modalPadRef = useRef<SignaturePadLib | null>(null);
  const [isEmpty, setIsEmpty] = useState(!value);
  const [showModal, setShowModal] = useState(false);

  const handleStrokeEnd = useCallback(() => {
    const pad = showModal ? modalPadRef.current : padRef.current;
    if (!pad) return;
    const data = pad.toDataURL('image/png');
    onChange(data);
    setIsEmpty(false);
    if (!dateValue) onDateChange(new Date().toISOString().split('T')[0]);
    tapHaptic();
  }, [showModal, onChange, dateValue, onDateChange]);

  // Init inline canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = initCanvas(canvas, padRef.current, value);
    if (!pad) return;
    pad.addEventListener('endStroke', () => {
      const data = pad.toDataURL('image/png');
      onChange(data);
      setIsEmpty(false);
      if (!dateValue) onDateChange(new Date().toISOString().split('T')[0]);
    });
    if (value) setIsEmpty(false);
    padRef.current = pad;
    return () => { pad.off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Init modal canvas + orientation resize
  useEffect(() => {
    if (!showModal) return;
    const canvas = modalCanvasRef.current;
    if (!canvas) return;

    const setupPad = () => {
      const pad = initCanvas(canvas, modalPadRef.current, value);
      if (!pad) return;
      pad.addEventListener('endStroke', handleStrokeEnd);
      if (value) setIsEmpty(false);
      modalPadRef.current = pad;
    };

    // Small delay for modal to render
    const timer = setTimeout(setupPad, 50);

    const handleResize = () => {
      // Save current signature before resize
      const currentData = modalPadRef.current?.toDataURL('image/png');
      if (modalPadRef.current) modalPadRef.current.off();
      const newPad = initCanvas(canvas, null, currentData || value);
      if (!newPad) return;
      newPad.addEventListener('endStroke', handleStrokeEnd);
      modalPadRef.current = newPad;
    };

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      if (modalPadRef.current) { modalPadRef.current.off(); modalPadRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal]);

  const handleClear = () => {
    padRef.current?.clear();
    modalPadRef.current?.clear();
    onChange('');
    onDateChange('');
    setIsEmpty(true);
  };

  const handleOpenModal = () => setShowModal(true);

  const handleCloseModal = () => {
    // Sync modal signature back to inline pad
    if (modalPadRef.current && value && padRef.current) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        padRef.current.fromDataURL(value, { ratio: 1, width: rect.width, height: rect.height });
      }
    }
    setShowModal(false);
  };

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold tracking-widest uppercase text-[color:var(--tj-muted)]">{label}</label>
          <div className="flex items-center space-x-3">
            {!isEmpty && (
              <span className="text-[11px] text-[#3F5A43] font-semibold uppercase tracking-wider flex items-center space-x-1">
                <span className="w-1.5 h-1.5 bg-[#3F5A43] rounded-full inline-block" />
                <span>Signed</span>
              </span>
            )}
            {/* type="button" throughout: this pad now also lives inside forms,
                where a typeless button is a submit button. */}
            <button type="button" onClick={handleOpenModal} className="text-[11px] font-semibold tracking-wider uppercase text-[color:var(--tj-muted)] hover:text-[color:var(--tj-ink)] transition-colors flex items-center space-x-1" title="Sign in fullscreen">
              <Maximize2 size={10} />
              <span>Expand</span>
            </button>
            {/* Clear used to be the only coloured thing on the pad, and on the
                expanded view it was the only coloured thing on the screen: the
                accent pointing at the destructive action while the primary one
                was plain. It now matches Expand beside it, so the eye goes to
                the pad and to Done. */}
            <button type="button" onClick={handleClear} className="text-[11px] font-semibold tracking-wider uppercase text-[color:var(--tj-muted)] hover:text-[color:var(--tj-ink)] transition-colors">
              Clear
            </button>
          </div>
        </div>
        <div className="border border-[color:var(--tj-line)] rounded-lg overflow-hidden bg-white relative">
          <canvas ref={canvasRef} className="w-full cursor-crosshair touch-none" style={{ height: '120px' }} />
          {isEmpty && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[color:var(--tj-muted-light)] text-sm italic">Sign here</span>
            </div>
          )}
          <div className="border-t border-dashed border-black/20 mx-4" />
        </div>
        {dateValue && (
          <div className="text-[11px] text-[color:var(--tj-muted)] text-right">
            Signed: {(() => {
              // Handles both YYYY-MM-DD and full ISO timestamps.
              // See SignatureLinePreview.tsx for the same fix.
              const iso = dateValue.includes('T') ? dateValue : `${dateValue}T12:00:00`;
              const d = new Date(iso);
              return Number.isNaN(d.getTime())
                ? dateValue
                : d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
            })()}
          </div>
        )}
      </div>

      {/* Full-screen signature modal */}
      {showModal && (
        <div className="fixed inset-0 bg-[color:var(--tj-surface)] backdrop-blur-sm z-[60] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <span className="text-[color:var(--tj-ink)] text-sm font-semibold">{label}</span>
            <div className="flex items-center space-x-3">
              <button type="button" onClick={handleClear} className="text-[11px] font-semibold tracking-wider uppercase text-[color:var(--tj-muted)] hover:text-[color:var(--tj-ink)] transition-colors">
                Clear
              </button>
              {/* Named, because an icon is not a name. A screen reader on a
                  row of these announces "Button. Button. Button." */}
              <button
                type="button"
                aria-label="Close"
                onClick={handleCloseModal}
                className="w-8 h-8 bg-[color:var(--tj-plane)] rounded-full flex items-center justify-center text-[color:var(--tj-ink)] hover:text-[color:var(--tj-ink)] hover:bg-[color:var(--tj-plane)] transition-all"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl bg-white rounded-2xl overflow-hidden relative">
              <canvas
                ref={modalCanvasRef}
                className="w-full cursor-crosshair touch-none"
                style={{ height: 'min(60vh, 400px)' }}
              />
              {isEmpty && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-[color:var(--tj-muted-light)] text-lg italic">Sign here</span>
                </div>
              )}
              <div className="border-t border-dashed border-black/20 mx-8" />
            </div>
          </div>
          {/* This was a gold pill with widely tracked uppercase, which is the
              dark/gold direction DESIGN.md retired and names as residue rather
              than intent. It is the primary action of this pad, and the pad
              renders on the customer signing ceremony, so it now looks like
              every other primary action in the product instead of like the
              only survivor of an older one. */}
          <div className="px-4 py-3 flex justify-center shrink-0">
            <button
              type="button"
              onClick={handleCloseModal}
              className="tj-action-base tj-action-primary tj-action-md px-8"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
