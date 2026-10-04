import type { SVGProps } from 'react';

const paths = {
  settings:
    'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Zm7 9a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  play: 'm8 5 11 7-11 7V5z',
  chat: 'M3 4h18v13H8l-5 4Zm4 5h10M7 13h7',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-9 12a3 3 0 0 0 6 0',
  rocket:
    'M13 4c3-2 7-2 7-2s0 4-2 7l-7 7-5-5Zm-7 7-4 1 2-5 5-1m2 10-1 4 5-2 1-5M7 17l-4 4m10-13h.01',
  trophy: 'M7 3h10v7a5 5 0 0 1-10 0Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 3v5m-4 1h8',
  megaphone: 'M4 9h4l11-5v16L8 15H4Zm4 6 2 6h3l-2-5M22 9v6',
  gamepad:
    'M7 6h10a4 4 0 0 1 4 3l2 8a2 2 0 0 1-3.3 2l-3.2-3h-9L4.3 19A2 2 0 0 1 1 17l2-8a4 4 0 0 1 4-3Zm-2 5h6m-3-3v6m8-3h.01m3 2h.01',
  graduation: 'm2 8 10-5 10 5-10 5Zm4 3v6l6 3 6-3v-6m4-3v8',
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  book: 'M12 5v16M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z',
  target: 'M21 12a9 9 0 1 1-9-9m5 9a5 5 0 1 1-5-5m0 5 9-9m-5 0h5v5',
  clipboard: 'M9 4H5v17h14V4h-4M9 2h6v5H9ZM8 12h8m-8 4h5',
  chart: 'M4 3v18h17M8 16v-4m5 4V7m5 9v-6',
  user: 'M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0m4-3.87a4 4 0 0 1 0 7.75',
  school: 'm3 10 9-7 9 7M5 9v12h14V9M9 21v-6h6v6M10 9h4',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0m-9-5v5l3 2',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  chevron: 'm9 5 7 7-7 7',
  back: 'm15 5-7 7 7 7',
  search: 'M20 20l-5-5m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  lock: 'M6 10h12v11H6ZM8 10V6a4 4 0 0 1 8 0v4m-4 5v2',
  check: 'm5 12 4 4L19 6',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
  logout: 'M9 4H4v16h5m0-8h12m-4-4 4 4-4 4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M6 18 18 6',
  info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0m-9-1v6m0-10v.01',
  mail: 'M3 5h18v14H3Zm0 0 9 8 9-8',
} as const;

export type IconName = keyof typeof paths;
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
