"use client";

export const buildFrameRectPhi = (width: number, height: number) => {
  const phi = (1 + Math.sqrt(5)) / 2;
  const padding = width * 0.1; // 10% padding
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  return {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
    phiRatio: phi,
  };
};