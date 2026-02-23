import React from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { LogoIcon } from './Logo';

export function InlineSpinner({ text = 'Loading...' }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300" role="status" aria-live="polite">
      <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
      <span>{text}</span>
    </div>
  );
}

export function Spinner({ size = 'md', text = 'Loading...', showLogo = true, className = '' }) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  return (
    <div className={clsx('flex flex-col items-center justify-center py-6', className)} role="status" aria-live="polite">
      <div className={clsx('relative', sizeClasses[size] || sizeClasses.md)}>
        <div className="absolute inset-0 border-4 border-primary-100 rounded-full" />
        <div className="absolute inset-0 border-4 border-transparent border-t-primary-500 rounded-full animate-spin" />
        {showLogo ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <LogoIcon size={size === 'sm' ? 16 : size === 'lg' ? 28 : 20} className="text-primary-500" />
          </div>
        ) : null}
      </div>
      {text ? <p className="mt-3 text-sm text-gray-600 dark:text-slate-300">{text}</p> : null}
    </div>
  );
}
