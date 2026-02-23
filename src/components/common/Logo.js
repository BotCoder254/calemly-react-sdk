import React from 'react';

const SIZES = {
  sm: { icon: 24, text: 'text-base' },
  md: { icon: 32, text: 'text-lg' },
  lg: { icon: 40, text: 'text-xl' },
  xl: { icon: 48, text: 'text-2xl' },
};

export function Logo({ size = 'lg', className = '' }) {
  const sizeConfig = typeof size === 'string' ? SIZES[size] || SIZES.lg : { icon: size, text: 'text-xl' };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={sizeConfig.icon}
        height={sizeConfig.icon}
        viewBox="0 0 24 24"
        fill="currentColor"
        className="text-primary-500"
      >
        <rect x="3" y="3" width="6" height="18" rx="3" ry="3" />
        <rect x="13" y="3" width="6" height="12" rx="3" ry="3" />
      </svg>
      <span className={`font-display font-bold ${sizeConfig.text} text-neutral-dark dark:text-slate-100`}>Calemly</span>
    </div>
  );
}

export function LogoIcon({ size = 32, className = '' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`text-primary-500 ${className}`}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="6" height="18" rx="3" ry="3" />
      <rect x="13" y="3" width="6" height="12" rx="3" ry="3" />
    </svg>
  );
}

export function PoweredByCalemly({ className = '' }) {
  return (
    <div className={`inline-flex items-center gap-2 text-xs text-gray-400 dark:text-slate-400 ${className}`}>
      <LogoIcon size={14} />
      <span>Powered by Calemly</span>
    </div>
  );
}
