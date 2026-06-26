// WalletVibeLogo — unique SVG logo for WalletVibe
// Props: size (number), animate (bool), variant: 'full'|'icon'|'light'
export default function WalletVibeLogo({ size = 32, animate = false, variant = 'icon', className = '' }) {
  const id = `wv-grad-${size}-${variant}`
  const waveId = `wv-wave-${size}`
  const glowId = `wv-glow-${size}`

  if (variant === 'icon') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`wallet-vibe-logo${animate ? ' logo-float' : ''} ${className}`}
        aria-label="WalletVibe Logo"
      >
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="50%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <linearGradient id={`${id}-shine`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Background shield/card shape */}
        <rect x="2" y="4" width="36" height="32" rx="9" fill={`url(#${id})`} />
        {/* Shine overlay */}
        <rect x="2" y="4" width="36" height="16" rx="9" fill={`url(#${id}-shine)`} opacity="0.6" />

        {/* Wave lines — vibration motif */}
        <path
          d="M8 22 Q12 17 16 22 Q20 27 24 22 Q28 17 32 22"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M8 26 Q12 21 16 26 Q20 31 24 26 Q28 21 32 26"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />

        {/* Rupee ₹ symbol */}
        <text
          x="20"
          y="18"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="13"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
          fill="white"
          filter={`url(#${glowId})`}
          style={{ userSelect: 'none' }}
        >
          ₹
        </text>
      </svg>
    )
  }

  // Full variant: icon + "WalletVibe" text
  if (variant === 'full') {
    return (
      <span className={`wallet-vibe-logo-full${animate ? ' logo-float' : ''} ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <WalletVibeLogo size={size} variant="icon" />
        <span className="brand-wordmark">
          <span className="brand-word-wallet">Wallet</span>
          <span className="brand-word-vibe">Vibe</span>
        </span>
      </span>
    )
  }

  // Light variant (for dark backgrounds — white icon)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`wallet-vibe-logo${animate ? ' logo-float' : ''} ${className}`}
      aria-label="WalletVibe"
    >
      <defs>
        <linearGradient id={`${id}-light`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
          <stop offset="100%" stopColor="rgba(165,180,252,0.18)" />
        </linearGradient>
      </defs>
      <rect x="2" y="4" width="36" height="32" rx="9" fill={`url(#${id}-light)`} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
      <path
        d="M8 22 Q12 17 16 22 Q20 27 24 22 Q28 17 32 22"
        stroke="rgba(255,255,255,0.65)"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M8 26 Q12 21 16 26 Q20 31 24 26 Q28 21 32 26"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
      <text
        x="20" y="18"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="13"
        fontWeight="900"
        fontFamily="system-ui, sans-serif"
        fill="white"
        style={{ userSelect: 'none' }}
      >
        ₹
      </text>
    </svg>
  )
}
