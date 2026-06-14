interface Props {
  src: string
  alt: string
  accent: string
  className?: string
  frameClassName?: string
  imageClassName?: string
  jerseyNumber?: number
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showTestBadge?: boolean
}

export function AnimatedPlayerPhoto({
  src,
  alt,
  accent,
  className,
  frameClassName,
  imageClassName,
  jerseyNumber,
  size = 'lg',
  showTestBadge = false,
}: Props) {
  const sizeClasses = {
    sm: 'w-12 h-12 rounded-xl',
    md: 'w-24 h-32 rounded-2xl',
    lg: 'w-24 h-32 sm:w-32 sm:h-44 rounded-2xl',
    xl: 'w-[15rem] h-[18rem] sm:w-[18rem] sm:h-[22rem] lg:w-[22rem] lg:h-[26rem] rounded-[2rem]',
  }[size]

  return (
    <div
      className={`relative overflow-hidden group ${sizeClasses} ${frameClassName ?? ''} ${className ?? ''}`.trim()}
      style={{
        boxShadow: `0 0 35px ${accent}25, 0 0 0 1px ${accent}20`,
        background: `linear-gradient(135deg, ${accent}0b 0%, rgba(255,255,255,0.01) 100%)`,
      }}
    >
      <img
        src={src}
        alt={alt}
        className={`h-full w-full object-cover transition-transform duration-[1500ms] ease-out group-hover:scale-105 ${imageClassName ?? ''}`.trim()}
      />
      {/* Premium overlay gradients/borders */}
      <div className="absolute inset-0 pointer-events-none rounded-inherit border border-white/10" />
      <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: `inset 0 0 20px ${accent}12` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-dark-950/20 via-transparent to-transparent pointer-events-none" />

      {showTestBadge && (
        <div className="absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.35em]"
          style={{ borderColor: `${accent}44`, color: accent, backgroundColor: `${accent}12` }}>
          Active
        </div>
      )}

      {typeof jerseyNumber === 'number' && (
        <div 
          className="absolute bottom-3 right-3 w-9 h-9 rounded-full flex items-center justify-center text-xs font-black select-none z-10 transition-transform duration-300 group-hover:scale-110"
          style={{ 
            background: `linear-gradient(135deg, #fff 0%, #f0f0f0 100%)`, 
            color: '#000', 
            boxShadow: `0 4px 12px rgba(0,0,0,0.5), 0 0 12px ${accent}60` 
          }}
        >
          {jerseyNumber}
        </div>
      )}
    </div>
  )
}