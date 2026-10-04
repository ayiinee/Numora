'use client';

import { useId, useRef, type ReactNode } from 'react';

export interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}

/** Controlled tabs with linked panels and automatic keyboard activation. */
export function Tabs({ items, value, onChange, label }: TabsProps) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = items.findIndex((item) => item.value === value);
  return (
    <div className="numora-tabs">
      <div className="numora-tabs__list" role="tablist" aria-label={label}>
        {items.map((item, index) => (
          <button
            key={item.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={index === selected}
            tabIndex={index === selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => {
              if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const enabled = items
                .map((tab, position) => (tab.disabled ? -1 : position))
                .filter((position) => position >= 0);
              const current = enabled.indexOf(index);
              const target =
                event.key === 'Home'
                  ? enabled[0]
                  : event.key === 'End'
                    ? enabled.at(-1)
                    : enabled[
                        (current + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) %
                          enabled.length
                      ];
              if (target === undefined) return;
              refs.current[target]?.focus();
              onChange(items[target]!.value);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item, index) => (
        <div
          key={item.value}
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          hidden={index !== selected}
          tabIndex={0}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
