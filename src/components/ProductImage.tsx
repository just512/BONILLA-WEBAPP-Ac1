import React, { useState } from 'react';
import { Utensils } from 'lucide-react';

interface ProductImageProps {
  src?: string | null;
  alt: string;
  className?: string;
}

export const ProductImage: React.FC<ProductImageProps> = ({ src, alt, className = '' }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#FFF8ED] to-neutral-100 dark:from-[#1E1C1A] dark:to-neutral-900 text-[#171717]/60 dark:text-neutral-400 p-4 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <Utensils className="w-7 h-7 text-[#D62828]/70 mb-2" />
        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300 line-clamp-2 max-w-[160px]">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
