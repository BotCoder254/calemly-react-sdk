import React, { forwardRef } from 'react';
import clsx from 'clsx';

export const Input = forwardRef(function Input({
  label,
  type = 'text',
  error,
  helperText,
  className = '',
  id,
  icon: Icon,
  iconPosition = 'left',
  ...props
}, ref) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  const hasIcon = Boolean(Icon);

  return (
    <div className={clsx('w-full', className)}>
      {label ? (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-neutral-dark mb-1.5 dark:text-slate-100"
        >
          {label}
        </label>
      ) : null}

      <div className="relative">
        {hasIcon && iconPosition === 'left' ? (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon className={clsx('w-5 h-5', error ? 'text-error' : 'text-gray-400')} />
          </div>
        ) : null}

        <input
          ref={ref}
          id={inputId}
          type={type}
          className={clsx(
            'w-full py-2.5 rounded-lg border transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
            'placeholder:text-gray-400 dark:placeholder:text-slate-500 dark:bg-slate-900 dark:text-slate-100',
            hasIcon && iconPosition === 'left' && 'pl-10 pr-4',
            hasIcon && iconPosition === 'right' && 'pl-4 pr-10',
            !hasIcon && 'px-4',
            error
              ? 'border-error text-error focus:ring-error'
              : 'border-gray-300 text-neutral-dark dark:border-slate-700'
          )}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />

        {hasIcon && iconPosition === 'right' ? (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon className={clsx('w-5 h-5', error ? 'text-error' : 'text-gray-400')} />
          </div>
        ) : null}
      </div>

      {error ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}

      {!error && helperText ? (
        <p className="mt-1.5 text-sm text-gray-500 dark:text-slate-400">{helperText}</p>
      ) : null}
    </div>
  );
});
