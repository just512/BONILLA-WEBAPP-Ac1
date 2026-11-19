import React from 'react';

interface BrandLogoProps {
  inverted?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ inverted = false }) => {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <svg
        width="32"
        height="32"
        viewBox="0 0 36 36"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="36" height="36" rx="9" fill="#D62828" />
        {/* Top Sesame Bun Dome */}
        <path
          d="M8 15.5C8 10.8 12.2 8 18 8C23.8 8 28 10.8 28 15.5H8Z"
          fill="#FFC928"
        />
        {/* Patty & Flame Layer */}
        <rect x="7" y="17.5" width="22" height="4" rx="2" fill="#171717" />
        {/* Melted Cheese Wave */}
        <path
          d="M8.5 17.5H27.5L24.5 21L21 18.8L18 21.3L14.5 18.8L11.5 21L8.5 17.5Z"
          fill="#FFC928"
        />
        {/* Bottom Bun */}
        <path
          d="M8.5 23.5H27.5V25C27.5 26.6 26.2 28 24.5 28H11.5C9.8 28 8.5 26.6 8.5 25V23.5Z"
          fill="#FFF8ED"
        />
      </svg>
      <span
        className={`font-display text-xl font-extrabold tracking-tight ${
          inverted ? 'text-white' : 'text-[#171717]'
        }`}
      >
        JUST BURGER
      </span>
    </span>
  );
};
