import { useEffect, useRef, useState } from "react";

export interface LanguageOption {
  locale: string;
  label: string;
  nativeLabel: string;
  flag: string;
}

interface Props {
  current: string;
  /** Map of locale -> current equivalent path (so switching keeps you on the same page). */
  paths: Record<string, string>;
  options: LanguageOption[];
}

/**
 * Accessible language dropdown using the listbox pattern.
 * Full keyboard support: ArrowUp/Down, Home/End, Enter/Space selects,
 * Escape/outside click closes, and focus returns to the trigger on close.
 */
export default function LanguageSwitcher({ current, paths, options }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, options.findIndex((o) => o.locale === current)),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const active = options.find((o) => o.locale === current);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Focus the highlighted option whenever the menu is open / index changes.
  useEffect(() => {
    if (open) {
      const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [open, activeIndex]);

  function openMenu() {
    setActiveIndex(Math.max(0, options.findIndex((o) => o.locale === current)));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function selectAt(i: number) {
    const opt = options[i];
    if (!opt) return;
    if (opt.locale === current) {
      // Re-clicking the active language just closes the menu.
      close();
      return;
    }
    window.location.href = paths[opt.locale] ?? "/";
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    switch (e.key) {
      case "Enter":
      case " ":
      case "ArrowDown":
        e.preventDefault();
        if (!open) openMenu();
        else setActiveIndex((i) => (i + 1) % options.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openMenu();
        else setActiveIndex((i) => (i - 1 + options.length) % options.length);
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      case "Escape":
        if (!open) break;
        e.preventDefault();
        close();
        break;
    }
  }

  function onOptionKeyDown(e: React.KeyboardEvent<HTMLAnchorElement>, i: number) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((x) => (x + 1) % options.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((x) => (x - 1 + options.length) % options.length);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        selectAt(i);
        break;
      case "Tab":
        close();
        break;
    }
  }

  return (
    <div className="lang-switcher" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="lang-switcher__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="lang-listbox"
        aria-label="Language"
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="lang-switcher__flag" aria-hidden="true">{active?.flag ?? "🌐"}</span>
        <span className="lang-switcher__code">{active?.locale.toUpperCase() ?? "EN"}</span>
        <svg className="lang-switcher__caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <ul
          id="lang-listbox"
          ref={listRef}
          className="lang-switcher__menu"
          role="listbox"
          aria-activedescendant={activeIndex >= 0 ? `lang-opt-${options[activeIndex].locale}` : undefined}
          aria-label="Language"
        >
          {options.map((opt, i) => (
            <li key={opt.locale} role="presentation">
              <a
                id={`lang-opt-${opt.locale}`}
                role="option"
                aria-selected={opt.locale === current}
                data-index={i}
                tabIndex={opt.locale === current || i === activeIndex ? 0 : -1}
                className={`lang-switcher__item${opt.locale === current ? " is-active" : ""}${i === activeIndex ? " is-highlighted" : ""}`}
                href={paths[opt.locale] ?? "/"}
                onClick={() => selectAt(i)}
                onKeyDown={(e) => onOptionKeyDown(e, i)}
              >
                <span className="lang-switcher__flag" aria-hidden="true">{opt.flag}</span>
                <span className="lang-switcher__label">{opt.label}</span>
                <span className="lang-switcher__native">{opt.nativeLabel}</span>
                {opt.locale === current && (
                  <svg className="lang-switcher__check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
