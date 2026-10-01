import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 24, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IconMenu = (p: P) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);
export const IconClose = (p: P) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
export const IconArrowRight = (p: P) => (
  <Icon {...p}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </Icon>
);
export const IconArrowDown = (p: P) => (
  <Icon {...p}>
    <path d="M12 4v15M6 13l6 6 6-6" />
  </Icon>
);
export const IconArrowUp = (p: P) => (
  <Icon {...p}>
    <path d="M12 20V5M6 11l6-6 6 6" />
  </Icon>
);
export const IconPhone = (p: P) => (
  <Icon {...p}>
    <path d="M6.6 3.5h2.6l1.4 4-2 1.3a11 11 0 0 0 6.6 6.6l1.3-2 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" />
  </Icon>
);
export const IconPin = (p: P) => (
  <Icon {...p}>
    <path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </Icon>
);
export const IconChat = (p: P) => (
  <Icon {...p}>
    <path d="M4 5.5h16v10H9l-5 4z" />
  </Icon>
);
export const IconSearch = (p: P) => (
  <Icon {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15 15l5 5" />
  </Icon>
);
export const IconPause = (p: P) => (
  <Icon {...p}>
    <path d="M9 6v12M15 6v12" />
  </Icon>
);
export const IconPlay = (p: P) => (
  <Icon {...p}>
    <path d="M8 5.5v13l10.5-6.5z" />
  </Icon>
);
export const IconClock = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4.5l3 1.8" />
  </Icon>
);
