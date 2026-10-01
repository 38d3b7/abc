// import React from 'react';
import { MemeCoinDisplayProps } from "../types";

export function MemeCoinDisplay({
  imageUrl,
  tokenName,
  tokenSymbol,
  timeRemaining,
  progressPercentage,
  currentPrice,
}: MemeCoinDisplayProps) {
  return (
    <div className="meme-coin-display">
      <div className="meme-banner-top">
        <div className="banner-left"></div>
        <div className="banner-right">
          <span className="lp-text">LP : {progressPercentage.toFixed(0)}%</span>
        </div>
      </div>

      <div className="meme-content">
        <div className="meme-coin-container">
          {imageUrl ? (
            <div className="coin-with-sunglasses">
              <img src={imageUrl} alt={tokenName} className="coin-image" />
              <div className="sunglasses-overlay">
                <div className="sunglasses-left"></div>
                <div className="sunglasses-bridge"></div>
                <div className="sunglasses-right"></div>
              </div>
            </div>
          ) : (
            <div className="coin-placeholder">
              <div className="coin-circle">
                <div className="coin-text-top">MEME</div>
                <div className="coin-text-bottom">COIN</div>
              </div>
              <div className="sunglasses-overlay">
                <div className="sunglasses-left"></div>
                <div className="sunglasses-bridge"></div>
                <div className="sunglasses-right"></div>
              </div>
            </div>
          )}
        </div>

        <div className="meme-timer">
          <div className="timer-item">
            <span className="timer-value">{timeRemaining.days}</span>
            <span className="timer-unit">d</span>
          </div>
          <div className="timer-item">
            <span className="timer-value">{timeRemaining.hours}</span>
            <span className="timer-unit">h</span>
          </div>
          <div className="timer-item">
            <span className="timer-value">{timeRemaining.minutes}</span>
            <span className="timer-unit">m</span>
          </div>
          <div className="timer-item">
            <span className="timer-value">{timeRemaining.seconds}</span>
            <span className="timer-unit">s</span>
          </div>
        </div>
      </div>

      <div className="meme-banner-bottom">
        <span className="token-info">
          ${tokenSymbol} – ${currentPrice}
        </span>
      </div>
    </div>
  );
}
