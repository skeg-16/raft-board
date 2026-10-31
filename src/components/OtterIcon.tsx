import React from 'react';

interface OtterIconProps {
  className?: string;
  size?: number;
}

export function OtterIcon({ className = 'w-6 h-6', size }: OtterIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={size ? { width: size, height: size } : undefined}
    >
      {/* Outer Otter Head Profile with Ears */}
      <path d="M7 6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2a5 5 0 0 1-10 0V6z" fill="currentColor" fillOpacity="0.15" />
      {/* Ears */}
      <circle cx="6.5" cy="5.5" r="1.5" fill="currentColor" fillOpacity="0.25" />
      <circle cx="17.5" cy="5.5" r="1.5" fill="currentColor" fillOpacity="0.25" />
      {/* Eyes */}
      <circle cx="9.5" cy="7.5" r="1" fill="currentColor" />
      <circle cx="14.5" cy="7.5" r="1" fill="currentColor" />
      {/* Snout & Nose */}
      <ellipse cx="12" cy="10" rx="2.5" ry="1.8" fill="currentColor" fillOpacity="0.2" />
      <polygon points="11,9.5 13,9.5 12,10.5" fill="currentColor" />
      {/* Whiskers */}
      <line x1="6.5" y1="10" x2="9" y2="10" />
      <line x1="6.5" y1="11.5" x2="9" y2="11" />
      <line x1="15" y1="10" x2="17.5" y2="10" />
      <line x1="15" y1="11" x2="17.5" y2="11.5" />
      {/* Water ripple underneath */}
      <path d="M3 17c2-1 4-1 6 0s4 1 6 0 4-1 6 0" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 20c2-.8 3.5-.8 5.5 0s3.5.8 5.5 0 2.5-.5 3-.2" stroke="currentColor" strokeWidth="1.4" opacity="0.6" />
    </svg>
  );
}
