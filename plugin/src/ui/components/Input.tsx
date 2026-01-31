import React from 'react';

interface InputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  error?: string;
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
  input: {
    padding: '8px 10px',
    borderRadius: '6px',
    border: '1px solid #e0e0e0',
    fontSize: '13px',
    fontFamily: 'inherit',
    resize: 'vertical' as const,
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  error: {
    fontSize: '11px',
    color: '#dc3545',
  },
};

export function Input({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  rows = 3,
  error,
}: InputProps): React.ReactElement {
  const inputStyle = {
    ...styles.input,
    ...(error ? { borderColor: '#dc3545' } : {}),
  };

  return (
    <div style={styles.wrapper}>
      {label && <label style={styles.label}>{label}</label>}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          style={inputStyle}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={inputStyle}
        />
      )}
      {error && <span style={styles.error}>{error}</span>}
    </div>
  );
}
