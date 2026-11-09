export function NumoraOwl({ eyesClassName }: { eyesClassName?: string | undefined }) {
  return (
    <g>
      <path d="M52 96c13-4 44-4 61-11 3 7-3 21-16 23l-18 2z" fill="#62269a" />
      <path
        d="M31 96c3-4 9-3 14 0l8 5c3 3 0 9-5 9l-12-2c-6-1-8-8-5-12Zm45 9 9-3c6-2 10 2 10 6-1 3-4 6-9 6l-11 1c-5 0-5-8 1-10Z"
        fill="#f4af42"
      />
      <path
        d="M28 34C17 29 15 13 19 6c2-3 6-2 8 0l19 15c15-4 32-3 47 1l15-14c4-3 8-1 8 3 2 10 0 21-8 28 7 9 9 18 8 28-3 24-25 40-50 40-27 0-49-17-51-40-1-13 4-25 13-33Z"
        fill="#7935ba"
      />
      <path
        d="M36 75c9-10 19-13 29-13 13 0 25 5 34 15-6 15-17 23-33 23-12 0-23-6-30-16Z"
        fill="#c28ce9"
      />
      <path
        d="M34 35c12-13 21-11 31-5 11-7 25-8 35 4 11 12 7 31-2 40-9 8-22 8-33 1-12 6-23 5-32-2-10-10-11-27 1-38Z"
        fill="#fff1d9"
      />
      <path d="m46 21 20 20 23-20c-12-4-32-4-43 0Z" fill="#fa9a71" />
      <g className={eyesClassName}>
        <circle cx="46" cy="53" r="15" fill="#f6c452" />
        <circle cx="85" cy="53" r="15" fill="#f6c452" />
        <circle cx="46" cy="53" r="11.5" fill="#fff" />
        <circle cx="85" cy="53" r="11.5" fill="#fff" />
        <circle cx="43" cy="54" r="6.5" fill="#321944" />
        <circle cx="82" cy="54" r="6.5" fill="#321944" />
        <circle cx="45" cy="51.5" r="2.3" fill="#fff" />
        <circle cx="84" cy="51.5" r="2.3" fill="#fff" />
      </g>
      <ellipse cx="36" cy="69" rx="6" ry="2.8" fill="#f5a4a8" />
      <ellipse cx="94" cy="69" rx="6" ry="2.8" fill="#f5a4a8" />
      <path d="M58 67q7-9 14 0l-7 9Z" fill="#eda333" />
      <path d="M58 67q7-9 14 0Z" fill="#ffd064" />
      <g>
        <path
          d="M26 64C14 67 7 63 1 55c-2-2-5-1-5 3 0 17 15 29 35 29 6-1 7-8 2-14Z"
          fill="#7935ba"
        />
        <path d="M-2 62q11 12 30 12l4 10C16 84 2 74-2 62Z" fill="#9752cc" />
      </g>
      <path d="M104 69c7-4 14-3 23-8 3-2 5 1 4 4-3 14-15 23-31 23-4-1-5-4-3-8Z" fill="#9752cc" />
    </g>
  );
}
