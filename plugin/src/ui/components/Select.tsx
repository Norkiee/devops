import React from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#666666',
  },
  select: {
    padding: '8px 10px',
    borderRadius: '6px',
    border: '1px solid #e0e0e0',
    fontSize: '13px',
    fontFamily: 'inherit',
    background: '#ffffff',
    outline: 'none',
    cursor: 'pointer',
  },
};

export function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
}: SelectProps): React.ReactElement {
  return (
    <div style={styles.wrapper}>
      {label && <label style={styles.label}>{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={styles.select}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
