import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'text';
  disabled?: boolean;
  fullWidth?: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  base: {
    padding: '12px 16px',
    borderRadius: '9999px',
    fontSize: '14px',
    fontWeight: 500,
    fontFamily: "'General Sans', -apple-system, BlinkMacSystemFont, sans-serif",
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
  text: {
    background: 'transparent',
    color: '#7c3aed',
    padding: '8px 16px',
  },
  textDisabled: {
    background: 'transparent',
    color: '#cccccc',
    cursor: 'not-allowed',
    padding: '8px 16px',
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
  const getVariantStyle = () => {
    if (disabled) {
      if (variant === 'primary') return styles.primaryDisabled;
      if (variant === 'text') return styles.textDisabled;
      return styles.secondaryDisabled;
    }
    if (variant === 'primary') return styles.primary;
    if (variant === 'text') return styles.text;
    return styles.secondary;
  };

  const variantStyle = getVariantStyle();

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
