// Sepak takraw ball — the "serving next rally" indicator on scorer/display.
export function TakrawBall({ size = '1.4rem', color = '#fbbf24', className = '' }: {
  size?: string; color?: string; className?: string
}) {
  return (
    <img src="/sepak-takraw.png" alt="Serving" className={className}
      style={{ width: size, height: size, objectFit: 'contain', filter: `drop-shadow(0 0 6px ${color}aa)` }} />
  )
}
