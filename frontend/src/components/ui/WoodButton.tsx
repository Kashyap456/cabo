import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface WoodButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'large'
}

const WoodButton = forwardRef<HTMLButtonElement, WoodButtonProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'relative inline-flex items-center justify-center overflow-hidden',
          'bg-gradient-to-br from-amber-700 via-amber-800 to-amber-900',
          'border-4 border-yellow-500/80',
          'shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),0_4px_8px_rgba(0,0,0,0.5)]',
          'transition-all duration-200',
          'hover:shadow-[inset_0_2px_6px_rgba(0,0,0,0.4),0_6px_12px_rgba(0,0,0,0.6)]',
          'hover:border-yellow-400',
          'hover:scale-105',
          'active:scale-95',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'rounded-lg',
          // Wood grain texture effect using pseudo elements
          'before:absolute before:inset-0 before:opacity-30',
          'before:bg-[repeating-linear-gradient(90deg,transparent,transparent_2px,rgba(0,0,0,0.1)_2px,rgba(0,0,0,0.1)_4px)]',
          'after:absolute after:inset-0 after:opacity-20',
          'after:bg-[repeating-linear-gradient(0deg,transparent,transparent_1px,rgba(92,51,23,0.3)_1px,rgba(92,51,23,0.3)_3px)]',
          'after:mix-blend-multiply',
          variant === 'default' && 'px-8 py-3 text-lg',
          variant === 'large' && 'px-10 py-4 text-xl',
          className
        )}
        style={{
          backgroundImage: `
            radial-gradient(ellipse at top left, rgba(139, 69, 19, 0.4) 0%, transparent 50%),
            radial-gradient(ellipse at bottom right, rgba(160, 82, 45, 0.3) 0%, transparent 50%),
            linear-gradient(180deg, #8B4513 0%, #A0522D 50%, #8B4513 100%)
          `,
        }}
        {...props}
      >
        {/* Wood grain noise overlay */}
        <div 
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.4 0 0 0 0 0.2 0 0 0 0 0 0 0 0 1 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            mixBlendMode: 'multiply',
          }}
        />
        
        {/* Painted text effect */}
        <span className={cn(
          "relative z-10",
          "text-yellow-100",
          "font-black uppercase tracking-wider",
          // Painted effect with multiple shadows
          "drop-shadow-[0_1px_0_rgba(0,0,0,0.8)]",
          "[text-shadow:_1px_1px_0_rgba(92,51,23,0.8),_2px_2px_2px_rgba(0,0,0,0.5),_0_0_8px_rgba(255,223,0,0.3)]",
          // Slightly uneven painted look
          "[font-variation-settings:'wght'_900]",
          "[-webkit-text-stroke:_0.5px_rgba(92,51,23,0.3)]"
        )}>
          {children}
        </span>
      </button>
    )
  }
)

WoodButton.displayName = 'WoodButton'

export default WoodButton