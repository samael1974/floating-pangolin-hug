// src/components/relief/reliefGeometry.ts

export const generateReliefGeometry = (width: number, height: number): number[][] => {
  const geometry: number[][] = [];

  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      // Generate a random value between -1 and 1 to simulate elevation
      const elevation = Math.random() * 2 - 1;
      row.push(elevation);
    }
    geometry.push(row);
  }

  return geometry;
};