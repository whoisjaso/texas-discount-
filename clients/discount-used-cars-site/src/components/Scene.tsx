import type { ReactNode } from 'react';
import type { BodyStyle } from '../data/inventory';
import { CarSilhouette } from './CarSilhouette';

export type SceneKind = 'studio' | 'road' | 'glass' | 'dusk' | 'pale';

interface Props {
  kind: SceneKind;
  body?: BodyStyle;
  paint?: string;
  /** A real photograph. When present it replaces the drawn scene. */
  photo?: string;
  /** Optional portrait crop served to phones. */
  photoMobile?: string;
  /** CSS object-position for the photo, e.g. "65% 50%" to keep the subject in frame. */
  focus?: string;
  /** Load the photo immediately (the hero). */
  eager?: boolean;
  alt?: string;
  className?: string;
  children?: ReactNode;
}

const WINDSHIELD = 'M40 70 C120 30 360 30 440 70 L468 250 C330 268 150 268 12 250 Z';

/**
 * A full-bleed picture plane. Photographs when they exist; otherwise a lit
 * set: a showroom with ceiling strips and a polished floor, a road at dusk
 * with headlight throw, or a windshield catching the sky.
 */
export function Scene({ kind, body = 'Coupe', paint = '#15161a', photo, photoMobile, focus, eager = false, alt = '', className = '', children }: Props) {
  return (
    <div className={`scene scene--${kind} ${className}`}>
      {photo ? (
        <picture>
          {photoMobile && <source media="(max-width: 760px)" srcSet={photoMobile} />}
          <img
            className="scene__photo"
            src={photo}
            alt={alt}
            style={focus ? { objectPosition: focus } : undefined}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
          />
        </picture>
      ) : (
        <div className="scene__set" aria-hidden="true">
          <div className="scene__bg" />
          {kind === 'studio' && (
            <div className="scene__lights">
              <span />
              <span />
              <span />
            </div>
          )}
          {kind === 'road' && (
            <>
              <div className="scene__horizon" />
              <div className="scene__road" />
            </>
          )}
          {kind === 'glass' ? (
            <svg className="scene__glass" viewBox="0 0 480 290">
              <defs>
                <linearGradient id="scene-ws" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#3b4f5c" />
                  <stop offset="0.5" stopColor="#141c22" />
                  <stop offset="1" stopColor="#050709" />
                </linearGradient>
                <linearGradient id="scene-sheen" x1="0" y1="0" x2="1" y2="0.25">
                  <stop offset="0" stopColor="#fff" stopOpacity="0" />
                  <stop offset="0.48" stopColor="#fff" stopOpacity="0.28" />
                  <stop offset="0.56" stopColor="#fff" stopOpacity="0.04" />
                  <stop offset="1" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
                <clipPath id="scene-ws-clip">
                  <path d={WINDSHIELD} />
                </clipPath>
              </defs>
              <path d={WINDSHIELD} fill="url(#scene-ws)" stroke="#1d2125" strokeWidth="9" strokeLinejoin="round" />
              <g clipPath="url(#scene-ws-clip)">
                <rect className="scene__sweep" x="-260" y="0" width="260" height="290" fill="url(#scene-sheen)" />
                <path d="M60 82 C170 50 310 50 420 82" stroke="#fff" strokeOpacity="0.16" strokeWidth="1.2" fill="none" />
              </g>
            </svg>
          ) : kind === 'dusk' ? (
            <div className="scene__pin">
              <span />
            </div>
          ) : (
            <div className="scene__car">
              {kind === 'road' && <div className="scene__beam" />}
              <CarSilhouette body={body} paint={paint} className="scene__car-body" />
              <CarSilhouette body={body} paint={paint} className="scene__car-reflection" />
            </div>
          )}
        </div>
      )}
      <div className="scene__shade" />
      {children}
    </div>
  );
}
