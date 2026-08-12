import type { StandardSection } from './types';

// Indian Standard Medium Weight Beams (IS 808)
export const ISMB: StandardSection[] = [
  { designation: 'ISMB 100', type: 'ISMB', mass: 11.5, area: 1462, depth: 100, width: 75, tw: 4.0, tf: 7.2, Ix: 2.57e6, Iy: 0.41e6, Zx: 51.4e3, Zy: 10.9e3, rx: 41.9, ry: 16.7 },
  { designation: 'ISMB 150', type: 'ISMB', mass: 14.9, area: 1900, depth: 150, width: 80, tw: 4.8, tf: 7.6, Ix: 7.26e6, Iy: 0.53e6, Zx: 96.8e3, Zy: 13.2e3, rx: 61.8, ry: 16.7 },
  { designation: 'ISMB 200', type: 'ISMB', mass: 25.4, area: 3233, depth: 200, width: 100, tw: 5.7, tf: 10.8, Ix: 22.35e6, Iy: 1.50e6, Zx: 223.5e3, Zy: 30.0e3, rx: 83.1, ry: 21.5 },
  { designation: 'ISMB 250', type: 'ISMB', mass: 37.3, area: 4755, depth: 250, width: 125, tw: 6.9, tf: 12.5, Ix: 51.31e6, Iy: 3.34e6, Zx: 410.5e3, Zy: 53.5e3, rx: 103.9, ry: 26.5 },
  { designation: 'ISMB 300', type: 'ISMB', mass: 44.2, area: 5626, depth: 300, width: 140, tw: 7.7, tf: 13.1, Ix: 86.04e6, Iy: 4.53e6, Zx: 573.6e3, Zy: 64.7e3, rx: 123.7, ry: 28.4 },
  { designation: 'ISMB 350', type: 'ISMB', mass: 52.4, area: 6671, depth: 350, width: 140, tw: 8.1, tf: 14.2, Ix: 136.3e6, Iy: 5.38e6, Zx: 778.9e3, Zy: 76.8e3, rx: 142.9, ry: 28.4 },
  { designation: 'ISMB 400', type: 'ISMB', mass: 61.6, area: 7846, depth: 400, width: 140, tw: 8.9, tf: 16.0, Ix: 204.6e6, Iy: 6.22e6, Zx: 1022.9e3, Zy: 88.9e3, rx: 161.5, ry: 28.2 },
  { designation: 'ISMB 450', type: 'ISMB', mass: 72.4, area: 9227, depth: 450, width: 150, tw: 9.4, tf: 17.4, Ix: 303.9e6, Iy: 8.34e6, Zx: 1350.7e3, Zy: 111.2e3, rx: 181.5, ry: 30.1 },
  { designation: 'ISMB 500', type: 'ISMB', mass: 86.9, area: 11074, depth: 500, width: 180, tw: 10.2, tf: 17.2, Ix: 452.2e6, Iy: 13.7e6, Zx: 1808.7e3, Zy: 152.2e3, rx: 202.2, ry: 35.2 },
  { designation: 'ISMB 550', type: 'ISMB', mass: 103.7, area: 13211, depth: 550, width: 190, tw: 11.2, tf: 19.3, Ix: 649.5e6, Iy: 18.0e6, Zx: 2361.8e3, Zy: 189.5e3, rx: 221.7, ry: 36.9 },
  { designation: 'ISMB 600', type: 'ISMB', mass: 122.6, area: 15621, depth: 600, width: 210, tw: 12.0, tf: 20.8, Ix: 918.1e6, Iy: 26.5e6, Zx: 3060.4e3, Zy: 252.4e3, rx: 242.4, ry: 41.2 },
];

// Indian Standard Heavy Weight Beams
export const ISHB: StandardSection[] = [
  { designation: 'ISHB 150', type: 'ISHB', mass: 27.1, area: 3454, depth: 150, width: 150, tw: 5.4, tf: 9.0, Ix: 14.6e6, Iy: 5.08e6, Zx: 194.7e3, Zy: 67.7e3, rx: 65.0, ry: 38.3 },
  { designation: 'ISHB 200', type: 'ISHB', mass: 37.3, area: 4755, depth: 200, width: 200, tw: 6.1, tf: 9.0, Ix: 36.2e6, Iy: 12.1e6, Zx: 362.0e3, Zy: 121.0e3, rx: 87.2, ry: 50.5 },
  { designation: 'ISHB 225', type: 'ISHB', mass: 43.1, area: 5494, depth: 225, width: 225, tw: 6.5, tf: 9.1, Ix: 52.8e6, Iy: 17.1e6, Zx: 469.3e3, Zy: 152.0e3, rx: 98.0, ry: 55.8 },
  { designation: 'ISHB 300', type: 'ISHB', mass: 58.8, area: 7485, depth: 300, width: 250, tw: 7.6, tf: 10.6, Ix: 125.5e6, Iy: 27.8e6, Zx: 836.7e3, Zy: 222.0e3, rx: 129.5, ry: 60.9 },
  { designation: 'ISHB 350', type: 'ISHB', mass: 67.4, area: 8591, depth: 350, width: 250, tw: 8.3, tf: 11.6, Ix: 191.6e6, Iy: 30.4e6, Zx: 1094.9e3, Zy: 243.4e3, rx: 149.3, ry: 59.5 },
  { designation: 'ISHB 400', type: 'ISHB', mass: 77.4, area: 9864, depth: 400, width: 250, tw: 9.1, tf: 12.7, Ix: 280.8e6, Iy: 33.5e6, Zx: 1404.0e3, Zy: 268.0e3, rx: 168.7, ry: 58.3 },
  { designation: 'ISHB 450', type: 'ISHB', mass: 87.2, area: 11113, depth: 450, width: 250, tw: 9.8, tf: 13.7, Ix: 392.1e6, Iy: 36.5e6, Zx: 1742.7e3, Zy: 291.7e3, rx: 187.8, ry: 57.3 },
];

// Indian Standard Wide Flange Beams
export const ISWB: StandardSection[] = [
  { designation: 'ISWB 150', type: 'ISWB', mass: 17.0, area: 2167, depth: 150, width: 100, tw: 5.4, tf: 7.0, Ix: 8.39e6, Iy: 1.17e6, Zx: 111.9e3, Zy: 23.4e3, rx: 62.2, ry: 23.2 },
  { designation: 'ISWB 200', type: 'ISWB', mass: 28.8, area: 3671, depth: 200, width: 140, tw: 6.1, tf: 9.0, Ix: 26.3e6, Iy: 4.11e6, Zx: 262.5e3, Zy: 58.7e3, rx: 84.6, ry: 33.5 },
  { designation: 'ISWB 250', type: 'ISWB', mass: 37.3, area: 4755, depth: 250, width: 200, tw: 6.7, tf: 9.0, Ix: 52.9e6, Iy: 12.0e6, Zx: 423.5e3, Zy: 120.0e3, rx: 105.5, ry: 50.2 },
  { designation: 'ISWB 300', type: 'ISWB', mass: 48.1, area: 6133, depth: 300, width: 200, tw: 7.4, tf: 10.0, Ix: 98.2e6, Iy: 13.3e6, Zx: 654.7e3, Zy: 133.0e3, rx: 126.5, ry: 46.6 },
  { designation: 'ISWB 350', type: 'ISWB', mass: 56.9, area: 7249, depth: 350, width: 200, tw: 8.0, tf: 11.4, Ix: 155.2e6, Iy: 15.3e6, Zx: 886.9e3, Zy: 152.7e3, rx: 146.3, ry: 45.9 },
  { designation: 'ISWB 400', type: 'ISWB', mass: 66.7, area: 8501, depth: 400, width: 200, tw: 8.6, tf: 13.0, Ix: 234.3e6, Iy: 17.6e6, Zx: 1171.4e3, Zy: 176.0e3, rx: 166.0, ry: 45.5 },
  { designation: 'ISWB 450', type: 'ISWB', mass: 79.4, area: 10114, depth: 450, width: 200, tw: 9.2, tf: 15.4, Ix: 350.6e6, Iy: 21.0e6, Zx: 1558.2e3, Zy: 210.0e3, rx: 186.2, ry: 45.6 },
  { designation: 'ISWB 500', type: 'ISWB', mass: 95.2, area: 12124, depth: 500, width: 250, tw: 9.9, tf: 14.7, Ix: 522.9e6, Iy: 32.7e6, Zx: 2091.5e3, Zy: 261.6e3, rx: 207.7, ry: 51.9 },
  { designation: 'ISWB 550', type: 'ISWB', mass: 112.5, area: 14333, depth: 550, width: 250, tw: 10.5, tf: 17.6, Ix: 749.1e6, Iy: 40.2e6, Zx: 2723.9e3, Zy: 321.6e3, rx: 228.6, ry: 53.0 },
  { designation: 'ISWB 600', type: 'ISWB', mass: 133.7, area: 17038, depth: 600, width: 250, tw: 11.2, tf: 21.3, Ix: 1062.0e6, Iy: 49.0e6, Zx: 3540.0e3, Zy: 392.0e3, rx: 249.6, ry: 53.6 },
];

// Indian Standard Medium Weight Channels
export const ISMC: StandardSection[] = [
  { designation: 'ISMC 75', type: 'ISMC', mass: 6.8, area: 867, depth: 75, width: 40, tw: 4.4, tf: 7.3, Ix: 0.76e6, Iy: 0.13e6, Zx: 20.3e3, Zy: 4.6e3, rx: 29.6, ry: 12.2 },
  { designation: 'ISMC 100', type: 'ISMC', mass: 9.6, area: 1220, depth: 100, width: 50, tw: 5.0, tf: 7.5, Ix: 1.87e6, Iy: 0.26e6, Zx: 37.3e3, Zy: 7.7e3, rx: 39.1, ry: 14.6 },
  { designation: 'ISMC 150', type: 'ISMC', mass: 16.4, area: 2090, depth: 150, width: 75, tw: 5.7, tf: 9.0, Ix: 7.18e6, Iy: 1.03e6, Zx: 95.7e3, Zy: 20.0e3, rx: 58.6, ry: 22.2 },
  { designation: 'ISMC 200', type: 'ISMC', mass: 22.1, area: 2821, depth: 200, width: 75, tw: 6.1, tf: 11.4, Ix: 18.2e6, Iy: 1.41e6, Zx: 181.7e3, Zy: 26.4e3, rx: 80.3, ry: 22.4 },
  { designation: 'ISMC 250', type: 'ISMC', mass: 30.4, area: 3867, depth: 250, width: 80, tw: 7.1, tf: 14.1, Ix: 38.4e6, Iy: 1.88e6, Zx: 307.0e3, Zy: 33.6e3, rx: 99.6, ry: 22.1 },
  { designation: 'ISMC 300', type: 'ISMC', mass: 36.3, area: 4629, depth: 300, width: 90, tw: 7.6, tf: 13.6, Ix: 63.6e6, Iy: 3.11e6, Zx: 424.0e3, Zy: 46.0e3, rx: 117.2, ry: 25.9 },
  { designation: 'ISMC 400', type: 'ISMC', mass: 50.1, area: 6381, depth: 400, width: 100, tw: 8.6, tf: 15.3, Ix: 150.2e6, Iy: 5.04e6, Zx: 751.0e3, Zy: 67.2e3, rx: 153.4, ry: 28.1 },
];

// Indian Standard Equal Angles
export const ISA: StandardSection[] = [
  { designation: 'ISA 50×50×5', type: 'ISA', mass: 3.8, area: 480, depth: 50, width: 50, tw: 5, tf: 5, Ix: 0.11e6, Iy: 0.11e6, Zx: 3.1e3, Zy: 3.1e3, rx: 15.1, ry: 15.1 },
  { designation: 'ISA 65×65×6', type: 'ISA', mass: 5.8, area: 744, depth: 65, width: 65, tw: 6, tf: 6, Ix: 0.28e6, Iy: 0.28e6, Zx: 6.2e3, Zy: 6.2e3, rx: 19.4, ry: 19.4 },
  { designation: 'ISA 75×75×6', type: 'ISA', mass: 6.8, area: 866, depth: 75, width: 75, tw: 6, tf: 6, Ix: 0.44e6, Iy: 0.44e6, Zx: 8.4e3, Zy: 8.4e3, rx: 22.5, ry: 22.5 },
  { designation: 'ISA 80×80×8', type: 'ISA', mass: 9.6, area: 1221, depth: 80, width: 80, tw: 8, tf: 8, Ix: 0.69e6, Iy: 0.69e6, Zx: 12.4e3, Zy: 12.4e3, rx: 23.8, ry: 23.8 },
  { designation: 'ISA 90×90×8', type: 'ISA', mass: 10.8, area: 1379, depth: 90, width: 90, tw: 8, tf: 8, Ix: 1.00e6, Iy: 1.00e6, Zx: 15.8e3, Zy: 15.8e3, rx: 26.9, ry: 26.9 },
  { designation: 'ISA 100×100×8', type: 'ISA', mass: 12.1, area: 1539, depth: 100, width: 100, tw: 8, tf: 8, Ix: 1.39e6, Iy: 1.39e6, Zx: 19.7e3, Zy: 19.7e3, rx: 30.1, ry: 30.1 },
  { designation: 'ISA 100×100×10', type: 'ISA', mass: 14.9, area: 1903, depth: 100, width: 100, tw: 10, tf: 10, Ix: 1.68e6, Iy: 1.68e6, Zx: 24.0e3, Zy: 24.0e3, rx: 29.7, ry: 29.7 },
  { designation: 'ISA 110×110×10', type: 'ISA', mass: 16.6, area: 2106, depth: 110, width: 110, tw: 10, tf: 10, Ix: 2.27e6, Iy: 2.27e6, Zx: 29.3e3, Zy: 29.3e3, rx: 32.8, ry: 32.8 },
  { designation: 'ISA 130×130×10', type: 'ISA', mass: 19.7, area: 2503, depth: 130, width: 130, tw: 10, tf: 10, Ix: 3.83e6, Iy: 3.83e6, Zx: 41.7e3, Zy: 41.7e3, rx: 39.1, ry: 39.1 },
  { designation: 'ISA 150×150×12', type: 'ISA', mass: 27.3, area: 3478, depth: 150, width: 150, tw: 12, tf: 12, Ix: 7.15e6, Iy: 7.15e6, Zx: 67.6e3, Zy: 67.6e3, rx: 45.3, ry: 45.3 },
  { designation: 'ISA 200×200×16', type: 'ISA', mass: 48.5, area: 6179, depth: 200, width: 200, tw: 16, tf: 16, Ix: 22.4e6, Iy: 22.4e6, Zx: 159.0e3, Zy: 159.0e3, rx: 60.2, ry: 60.2 },
];

export const allStandardSections: StandardSection[] = [
  ...ISMB,
  ...ISHB,
  ...ISWB,
  ...ISMC,
  ...ISA,
];

export function searchSections(query: string): StandardSection[] {
  const q = query.toLowerCase();
  return allStandardSections.filter(s =>
    s.designation.toLowerCase().includes(q) || s.type.toLowerCase().includes(q)
  );
}
