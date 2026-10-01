export function Logo({ className = "", size = 48 }: { className?: string; size?: number }) {
  return (
    <div
      className={`terminal-logo ${className}`}
      style={{
        fontSize: `${size * 0.5}px`,
        fontFamily: 'Orbitron, sans-serif',
        fontWeight: '900',
        color: '#00FF00',
        textShadow: '0 0 10px #00FF00, 0 0 20px #00FF00, 0 0 30px #00FF00',
        letterSpacing: '0.2em',
        position: 'relative',
        display: 'inline-block',
        background: 'transparent',
        padding: '0',
        animation: 'logo-flicker 4s infinite',
        isolation: 'isolate',
        zIndex: 1000
      }}
    >
      <span style={{ color: '#00FFFF', fontWeight: '900' }}>L</span>
      <span style={{ color: '#FF0040', fontWeight: '700' }}>-</span>
      <span style={{ color: '#00FF00', fontWeight: '900' }}>G</span>
      <span style={{ color: '#FF0040', fontWeight: '700' }}>-</span>
      <span style={{ color: '#FFA500', fontWeight: '900' }}>E</span>
    </div>
  );
}
