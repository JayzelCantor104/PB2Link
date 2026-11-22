import React, { useId, useRef, useState } from 'react';

/**
 * A dropdown of common answers with an "Other" choice that opens a text box,
 * so residents pick instead of typing, and can still type an answer that
 * isn't listed.
 *
 * Works as a drop-in for an <input>: it takes the same name / value / id /
 * className / aria-* props and its onChange sends
 * { target: { name, value, type: 'text' } }, so existing form handlers work.
 * A saved value that isn't one of the choices (old records, typed answers)
 * opens with "Other" picked and the text shown. Choices compare without case
 * or accents, because residents' details are stored in capitals.
 *
 * props: options (strings or { value, label }), placeholder (empty choice),
 *        otherLabel, otherPlaceholder, maxLength, label (for the text box's
 *        screen-reader name), plus any input props.
 */
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const OTHER = '__other__';

const SelectOrOther = ({
  id, name, value, onChange, options = [], placeholder = 'Choose one',
  otherLabel = 'Other (type it)', otherPlaceholder = 'Type it here', maxLength = 100,
  label, className = '', inputClassName = '', required, disabled, ...rest
}) => {
  const autoId = useId();
  const selectId = id || autoId;
  const textRef = useRef(null);
  const items = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const match = value ? items.find((o) => norm(o.value) === norm(value) || norm(o.label) === norm(value)) : null;
  // "Other" stays open while its box is empty (just picked), and whenever the
  // value isn't one of the choices.
  const [otherPicked, setOtherPicked] = useState(false);
  const showOther = (!!value && !match) || (otherPicked && !match);
  const emit = (v) => onChange && onChange({ target: { name, value: v, type: 'text' } });

  // No choices for this case (e.g. a birth city in a province without a list): a plain text box.
  if (items.length === 0) {
    return (
      <input id={selectId} type="text" name={name} value={value || ''} maxLength={maxLength}
        className={className} required={required} disabled={disabled}
        onChange={(e) => emit(e.target.value)} {...rest} />
    );
  }

  const onSelect = (e) => {
    const v = e.target.value;
    if (v === OTHER) {
      setOtherPicked(true);
      emit('');
      // Put the cursor in the box that just opened.
      setTimeout(() => textRef.current && textRef.current.focus(), 0);
    } else {
      setOtherPicked(false);
      emit(v);
    }
  };

  return (
    <div className="pb2-select-other">
      <select id={selectId} name={name} className={className} required={required} disabled={disabled}
        value={match ? match.value : showOther ? OTHER : ''} onChange={onSelect} {...rest}>
        <option value="">{placeholder}</option>
        {items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        <option value={OTHER}>{otherLabel}</option>
      </select>
      {showOther && (
        <input
          ref={textRef}
          id={`${selectId}-other`}
          type="text"
          className={`pb2-select-other-input ${inputClassName || className}`.trim()}
          value={match ? '' : (value || '')}
          maxLength={maxLength}
          placeholder={otherPlaceholder}
          aria-label={`${label || 'Your answer'} (type it)`}
          aria-invalid={rest['aria-invalid']}
          aria-describedby={rest['aria-describedby']}
          required={required}
          disabled={disabled}
          onChange={(e) => emit(e.target.value)}
        />
      )}
    </div>
  );
};

export default SelectOrOther;
