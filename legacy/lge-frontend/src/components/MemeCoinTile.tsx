import { useEffect, useRef } from "react";
import styles from "../styles/_meme-coin-tile.module.scss";
import { MemeCoinTileProps } from "../types";

export function MemeCoinTile({
  width = 360,
  height: _height = 360, // Reserved for future use
  lpProgress = 0,
  timeProgress = 0,
  priceProgress = 0,
  tokenName = "HACKERCOIN",
  tokenSymbol = "$HACK",
  minPrice = 0.001,
  maxPrice = 0.05,
  countdown = { days: "00", hours: "00", minutes: "00", seconds: "00" },
  className = "",
  onClick,
  disabled = false,
  animateProgress = true,
  showGlitch = true,
  customContent,
}: MemeCoinTileProps) {
  const tileRef = useRef<HTMLDivElement>(null);

  const w = typeof width === "number" ? `${width}px` : width;

  const lpProg = Math.min(100, Math.max(0, lpProgress));
  const timeProg = Math.min(100, Math.max(0, timeProgress));
  const priceProg = Math.min(100, Math.max(0, priceProgress));

  const currentPrice = minPrice + (maxPrice - minPrice) * (priceProg / 100);

  const formatPrice = (price: number) => {
    if (price < 0.000001) {
      return `$${price.toFixed(9)}`;
    } else if (price < 0.0001) {
      return `$${price.toFixed(7)}`;
    } else if (price < 0.01) {
      return `$${price.toFixed(5)}`;
    } else if (price < 1) {
      return `$${price.toFixed(3)}`;
    } else {
      return `$${price.toFixed(2)}`;
    }
  };

  useEffect(() => {
    if (!showGlitch || !tileRef.current) return;

    const interval = setInterval(() => {
      if (Math.random() > 0.95 && tileRef.current) {
        tileRef.current.style.transform = `scale(1.02) translateX(${Math.random() * 4 - 2}px)`;
        setTimeout(() => {
          if (tileRef.current) {
            tileRef.current.style.transform = "scale(1.02)";
          }
        }, 100);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [showGlitch]);

  const handleClick = () => {
    if (!disabled && onClick) {
      onClick();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " ") && !disabled) {
      handleClick();
    }
  };

  const tileClasses = [
    styles.memeCoinTile,
    disabled && styles.disabled,
    animateProgress && styles.animated,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={tileRef}
      className={tileClasses}
      style={
        {
          "--tile-size": w,
          "--lp-progress": `${lpProg}%`,
          "--right-progress": `${timeProg}%`,
          "--bottom-progress": `${priceProg}%`,
        } as React.CSSProperties
      }
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Terminal meme coin tile"
      aria-disabled={disabled}
    >
      <div className={styles.frameTop}>
        <div className={styles.progressTop}></div>
        <div className={styles.lpText}>[LP:{Math.round(lpProg)}%]</div>
      </div>

      <div className={styles.frameRight}>
        <div className={styles.progressRight}></div>
        <div className={styles.countdown}>
          <div className={styles.countdownLine}>
            <span className={styles.countdownValue}>{countdown.days}</span>
            <span className={styles.countdownUnit}>D</span>
          </div>
          <div className={styles.countdownLine}>
            <span className={styles.countdownValue}>{countdown.hours}</span>
            <span className={styles.countdownUnit}>H</span>
          </div>
          <div className={styles.countdownLine}>
            <span className={styles.countdownValue}>{countdown.minutes}</span>
            <span className={styles.countdownUnit}>M</span>
          </div>
          <div className={styles.countdownLine}>
            <span className={styles.countdownValue}>{countdown.seconds}</span>
            <span className={styles.countdownUnit}>S</span>
          </div>
        </div>
      </div>

      <div className={styles.frameBottom}>
        <div className={styles.progressBottom}></div>
        <div className={styles.priceLeft}>{formatPrice(minPrice)}</div>
        <div className={styles.priceCenter}>{formatPrice(currentPrice)}</div>
        <div className={styles.priceRight}>{formatPrice(maxPrice)}</div>
      </div>

      <div className={styles.frameLeft}>
        <div className={styles.tokenInfo}>
          <div className={styles.tokenName}>{tokenName}</div>
          <div className={styles.tokenSymbol}>{tokenSymbol}</div>
        </div>
      </div>

      <div className={styles.innerFrame}></div>
      <div className={styles.tileContent}>{customContent}</div>
    </div>
  );
}
