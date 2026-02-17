import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  fullWidth?: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  base: {
    padding: '12px 16px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 500,
    fontFamily: "'DM Mono', monospace",
    cursor: 'pointer',
    border: 'none',
    transition: 'background 0.15s',
    lineHeight: '1.4',
  },
  primary: {
    background: '#7c3aed',
    color: '#ffffff',
  },
  primaryDisabled: {
    background: '#c4b5fd',
    color: '#ffffff',
    cursor: 'not-allowed',
  },
  secondary: {
    background: '#f5f5f5',
    color: '#333333',
    border: '1px solid #e0e0e0',
  },
  secondaryDisabled: {
    background: '#f5f5f5',
    color: '#999999',
    cursor: 'not-allowed',
  },
  fullWidth: {
    width: '100%',
  },
};

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  fullWidth = false,
}: ButtonProps): React.ReactElement {
  const variantStyle = disabled
    ? variant === 'primary'
      ? styles.primaryDisabled
      : styles.secondaryDisabled
    : variant === 'primary'
      ? styles.primary
      : styles.secondary;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        ...styles.base,
        ...variantStyle,
        ...(fullWidth ? styles.fullWidth : {}),
      }}
    >
      {children}
    </button>
  );
}
