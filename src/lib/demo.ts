import { summarize, type Activity, type TrackPoint } from './gpx';

// An illustrative route, not a navigational trail or a recorded activity.
const anchors = [
  [121.2813, 24.1377, 2980], [121.2801, 24.1411, 3035],
  [121.2810, 24.1442, 3080], [121.2794, 24.1470, 3160],
  [121.2804, 24.1501, 3205], [121.2784, 24.1530, 3250],
  [121.2778, 24.1561, 3310], [121.2756, 24.1580, 3365],
  [121.2739, 24.1600, 3422], [121.2728, 24.1621, 3380],
  [121.2701, 24.1640, 3355], [121.2682, 24.1662, 3390],
];
const points: TrackPoint[] = [];
for (let i = 0; i < anchors.length - 1; i++) {
  for (let j = 0; j < 20; j++) {
    const t = j / 20;
    const a = anchors[i];
    const b = anchors[i + 1];
    points.push({ lon: a[0] + (b[0] - a[0]) * t + Math.sin(t * Math.PI * 2) * 0.00012,
      lat: a[1] + (b[1] - a[1]) * t, elevation: a[2] + (b[2] - a[2]) * t,
      time: Date.UTC(2026, 9, 10, 0, 15) + (i * 20 + j) * 45000, segment: 0, distance: 0 });
  }
}
const last = anchors[anchors.length - 1];
points.push({ lon: last[0], lat: last[1], elevation: last[2], time: Date.UTC(2026, 9, 10, 0, 15) + 220 * 45000, segment: 0, distance: 0 });

export const demoActivity: Activity = {
  id: 'demo', name: '合歡山・稜線上的日常', importedAt: 0, points, ...summarize(points), demo: true,
};
