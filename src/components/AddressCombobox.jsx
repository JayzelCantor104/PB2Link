import { useId, useMemo, useRef, useState } from 'react';
import { normalizeName, refreshAddressOptionsIfStale, useAddressOptions } from '../lib/addressOptions';
import '../styles/address-combobox.css';

/**
 * Searchable Street / Subdivision field (migration 026). Behaves like the text
 * input it replaces: onChange gets { target: { name, value } }, so existing form
 * handlers keep working. Residents can always type a name that isn't listed
 * ("Other / not listed"); staff review those on the Address List page.
 *
 * kind: 'subdivision' | 'street'. For streets, pass the chosen `subdivision`:
 * its streets are listed first, then the rest of the barangay's.
 */
const AddressCombobox = ({
  kind,
  name,
  id,
  value,
  onChange,
  subdivision,
  className = '',
  placeholder,
  required,
  disabled,
  title,
}) => {
  const options = useAddressOptions();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [typing, setTyping] = useState(false);
  const inputRef = useRef(null);
  const listId = useId();

  const query = typing ? normalizeName(value) : '';
  const current = normalizeName(value);

  // Groups of names to show, filtered by what's typed.
  const groups = useMemo(() => {
    if (!options) return [];
    const match = (n) => !query || n.includes(query);
    const rank = (a, b) => (a.startsWith(query) === b.startsWith(query) ? a.localeCompare(b) : a.startsWith(query) ? -1 : 1);
    if (kind === 'subdivision') {
      return [{ label: null, names: options.subdivisions.map((s) => s.name).filter(match).sort(rank) }];
    }
    const sub = options.subdivisions.find((s) => s.name === normalizeName(subdivision));
    const unique = (list) => [...new Set(list)];
    if (!sub) {
      return [{ label: null, names: unique(options.streets.map((s) => s.name)).filter(match).sort(rank) }];
    }
    const inSub = unique(options.streets.filter((s) => s.subdivision_id === sub.id).map((s) => s.name));
    const others = unique(options.streets.filter((s) => s.subdivision_id !== sub.id).map((s) => s.name)).filter((n) => !inSub.includes(n));
    return [
      { label: `Streets in ${sub.name}`, names: inSub.filter(match).sort(rank) },
      { label: 'Other streets in Pasong Buaya II', names: others.filter(match).sort(rank) },
    ];
  }, [options, kind, subdivision, query]);

  // Every name staff keep active is listed (a few hundred at most); typing
  // narrows it. Flat copy for keyboard navigation.
  const flat = [];
  const shownGroups = groups.filter((g) => g.names.length);
  shownGroups.forEach((g) => g.names.forEach((n) => flat.push(n)));
  const listed = options ? (kind === 'subdivision' ? options.subdivisions : options.streets).some((o) => o.name === current) : true;
  const offerTyped = current !== '' && !listed;
  if (offerTyped) flat.push(null); // the "use what I typed" row

  const emit = (next) => onChange?.({ target: { name, value: next, type: 'text' } });

  const choose = (next) => {
    if (next !== null) emit(next);
    setOpen(false);
    setTyping(false);
    setActive(-1);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') { setActive((i) => Math.min(flat.length - 1, i + 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setActive((i) => Math.max(0, i - 1)); e.preventDefault(); }
    else if (e.key === 'Enter') {
      if (active >= 0 && active < flat.length) { e.preventDefault(); choose(flat[active]); }
      else setOpen(false);
    } else if (e.key === 'Escape') { setOpen(false); e.preventDefault(); }
  };

  const optionId = (i) => `${listId}-opt-${i}`;
  let index = -1;

  return (
    <div className={`addr-combo${open ? ' is-open' : ''}`}>
      <input
        ref={inputRef}
        type="text"
        id={id}
        name={name}
        className={className}
        value={value || ''}
        placeholder={placeholder || (kind === 'subdivision' ? 'Pick or type your subdivision' : 'Pick or type your street')}
        title={title}
        required={required}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        onFocus={() => { setOpen(true); refreshAddressOptionsIfStale(); }}
        onClick={() => { setOpen(true); refreshAddressOptionsIfStale(); }}
        onBlur={() => setTimeout(() => { setOpen(false); setTyping(false); }, 150)}
        onChange={(e) => { setTyping(true); setOpen(true); setActive(-1); emit(e.target.value); }}
        onKeyDown={onKeyDown}
      />
      <i className="bi bi-chevron-down addr-combo-chevron" aria-hidden="true" onMouseDown={(e) => { e.preventDefault(); inputRef.current?.focus(); setOpen((o) => !o); }}></i>

      {open && !disabled && (
        <div className="addr-combo-list" id={listId} role="listbox">
          {!options && <div className="addr-combo-note">Loading the list…</div>}
          {options && shownGroups.length === 0 && !offerTyped && (
            <div className="addr-combo-note">No match. Type the full name: it will be saved as you type it.</div>
          )}
          {shownGroups.map((g) => (
            <div key={g.label || 'all'} role="group" aria-label={g.label || undefined}>
              {g.label && <div className="addr-combo-group">{g.label}</div>}
              {g.names.map((n) => {
                index += 1;
                const i = index;
                return (
                  <div
                    key={n}
                    id={optionId(i)}
                    role="option"
                    aria-selected={n === current}
                    className={`addr-combo-option${i === active ? ' is-active' : ''}${n === current ? ' is-selected' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); choose(n); }}
                    onMouseEnter={() => setActive(i)}
                  >
                    {n}
                    {n === current && <i className="bi bi-check-lg" aria-hidden="true"></i>}
                  </div>
                );
              })}
            </div>
          ))}
          {offerTyped && (() => {
            index += 1;
            const i = index;
            return (
              <div
                id={optionId(i)}
                role="option"
                aria-selected={false}
                className={`addr-combo-option is-other${i === active ? ' is-active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); choose(null); }}
                onMouseEnter={() => setActive(i)}
              >
                <i className="bi bi-pencil" aria-hidden="true"></i> Use “{current}” (not on the list)
              </div>
            );
          })()}
        </div>
      )}
      {!open && offerTyped && (
        <small className="addr-combo-hint">Not on our list yet. It will be saved as typed and staff will add it.</small>
      )}
    </div>
  );
};

export default AddressCombobox;
