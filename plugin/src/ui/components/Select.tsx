import React, { useState, useRef, useEffect } from 'react';

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
    position: 'relative',
  },
  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#666666',
  },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid #e0e0e0',
    fontSize: '13px',
    fontFamily: 'inherit',
    background: '#ffffff',
    cursor: 'pointer',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  triggerFocused: {
    borderColor: '#7c3aed',
    boxShadow: '0 0 0 2px rgba(124, 58, 237, 0.1)',
  },
  triggerText: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  placeholder: {
    color: '#999999',
  },
  chevron: {
    marginLeft: '8px',
    transition: 'transform 0.2s',
  },
  chevronOpen: {
    transform: 'rotate(180deg)',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: '4px',
    background: '#ffffff',
    border: '1px solid #e0e0e0',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
    zIndex: 100,
    maxHeight: '200px',
    overflowY: 'auto',
    padding: '4px',
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    fontSize: '13px',
    cursor: 'pointer',
    borderRadius: '8px',
    transition: 'background 0.1s',
  },
  optionHovered: {
    background: '#f3e8ff',
  },
  optionSelected: {
    background: 'transparent',
  },
  checkmark: {
    marginLeft: 'auto',
    color: '#7c3aed',
  },
};

export function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
}: SelectProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);
  const displayText = selectedOption?.label || placeholder || 'Select...';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    setIsOpen(false);
  };

  return (
    <div style={styles.wrapper} ref={wrapperRef}>
      {label && <label style={styles.label}>{label}</label>}
      <div
        style={{
          ...styles.trigger,
          ...(isOpen ? styles.triggerFocused : {}),
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span
          style={{
            ...styles.triggerText,
            ...(!selectedOption ? styles.placeholder : {}),
          }}
        >
          {displayText}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            ...styles.chevron,
            ...(isOpen ? styles.chevronOpen : {}),
          }}
        >
          <path
            d="M2.5 4.5L6 8L9.5 4.5"
            stroke="#666666"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {isOpen && options.length > 0 && (
        <div style={styles.dropdown}>
          {options.map((opt, index) => {
            const isSelected = opt.value === value;
            const isHovered = hoveredIndex === index;

            return (
              <div
                key={opt.value}
                style={{
                  ...styles.option,
                  ...(isHovered ? styles.optionHovered : {}),
                }}
                onClick={() => handleSelect(opt.value)}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <span>{opt.label}</span>
                {isSelected && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    style={styles.checkmark}
                  >
                    <path
                      d="M2.5 7L5.5 10L11.5 4"
                      stroke="#7c3aed"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
