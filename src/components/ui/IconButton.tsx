import type { ButtonHTMLAttributes } from 'react';

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  'aria-label': string;
  visuallyHiddenText?: string;
};

export const IconButton = ({
  children,
  'aria-label': ariaLabel,
  visuallyHiddenText,
  ...buttonProps
}: IconButtonProps) => (
  <button {...buttonProps} aria-label={ariaLabel}>
    {children}
    {visuallyHiddenText ? <span className="sr-only">{visuallyHiddenText}</span> : null}
  </button>
);
