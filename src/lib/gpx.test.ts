import { describe, expect, it, vi } from 'vitest';
import { formatDuration, haversine, nearestBearing, parseGpx, pointAt, routeBearing } from './gpx';

const gpx = (body: string) => `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">${body}</gpx>`;
const point = (lat: number, lon: number, ele?: number, time?: string) => `<trkpt lat="${lat}" lon="${lon}">${ele === undefined ? '' : `<ele>${ele}</ele>`}${time ? `<time>${time}</time>` : ''}</trkpt>`;
const track = (points: string) => gpx(`<trk><name>山的故事</name><trkseg>${points}</trkseg></trk>`);

describe('GPX import', () => {
  it('reads names, coordinates, elevation and elapsed time', () => {
    const item = parseGpx(track(point(24, 121, 100, '2026-10-10T00:00:00Z') + point(24.001, 121, 130, '2026-10-10T00:02:00Z') + point(24.002, 121, 120, '2026-10-10T00:03:00Z')));
    expect(item.name).toBe('山的故事');
    expect(item.distance).toBeCloseTo(222.39, 1);
    expect(item.ascent).toBe(30);
    expect(item.descent).toBe(10);
    expect(item.maxElevation).toBe(130);
    expect(item.duration).toBe(180);
    expect(item.points[2].distance).toBe(item.distance);
  });

  it('does not invent missing or partial elevation and time', () => {
    const item = parseGpx(track(point(24, 121, 100, '2026-10-10T00:00:00Z') + point(24.001, 121)));
    expect(item.ascent).toBeNull();
    expect(item.descent).toBeNull();
    expect(item.duration).toBeNull();
    expect(item.points[1].elevation).toBeNull();
    expect(item.maxElevation).toBe(100);
  });

  it('does not bridge disjoint segments or include gaps in elapsed time', () => {
    const item = parseGpx(gpx(`<trk><trkseg>${point(24, 121, 0, '2026-10-10T00:00:00Z')}${point(24.001, 121, 10, '2026-10-10T00:01:00Z')}</trkseg><trkseg>${point(25, 121, 1000, '2026-10-10T01:00:00Z')}${point(25.001, 121, 1010, '2026-10-10T01:01:00Z')}</trkseg></trk>`));
    expect(item.distance).toBeCloseTo(222.39, 1);
    expect(item.ascent).toBe(20);
    expect(item.duration).toBe(120);
    expect(item.points[1].segment).not.toBe(item.points[2].segment);
  });

  it('supports route points and filenames', () => {
    const item = parseGpx(gpx('<rte><rtept lat="0" lon="0"/><rtept lat="0.01" lon="0"/></rte>'), 'Coast.gpx');
    expect(item.name).toBe('Coast');
    expect(item.distance).toBeGreaterThan(1000);
    expect(item.startTime).toBeNull();
  });

  it('supports explicitly namespaced GPX elements', () => {
    const item = parseGpx('<g:gpx xmlns:g="http://www.topografix.com/GPX/1/1"><g:trk><g:name>小徑</g:name><g:trkseg><g:trkpt lat="24" lon="121"/><g:trkpt lat="24.01" lon="121"/></g:trkseg></g:trk></g:gpx>');
    expect(item.name).toBe('小徑');
  });

  it('rejects malformed XML, unrelated XML, empty GPX and stationary tracks', () => {
    for (const input of ['not xml', '<gpx><trk></gpx>', '<html/>', gpx(''), track(point(24, 121) + point(24, 121))]) {
      expect(() => parseGpx(input)).toThrow();
    }
  });

  it('splits the route on invalid coordinates rather than connecting across them', () => {
    const item = parseGpx(track(point(24, 121) + point(24.001, 121) + '<trkpt lat="" lon="121"/>' + point(25, 121) + point(25.001, 121)));
    expect(item.points).toHaveLength(4);
    expect(item.distance).toBeCloseTo(222.39, 1);
    expect(item.points[1].segment).not.toBe(item.points[2].segment);
  });

  it('keeps zero and negative elevation values', () => {
    const item = parseGpx(track(point(24, 121, -10) + point(24.001, 121, 0)));
    expect(item.maxElevation).toBe(0);
    expect(item.ascent).toBe(10);
  });

  it('does not report a duration for reversed timestamps', () => {
    const item = parseGpx(track(point(24, 121, 10, '2026-10-10T00:01:00Z') + point(24.001, 121, 20, '2026-10-10T00:00:00Z')));
    expect(item.duration).toBeNull();
  });

  it('imports over plain http without crypto.randomUUID (insecure context)', () => {
    const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    vi.stubGlobal('crypto', { getRandomValues });
    try {
      const item = parseGpx(track(point(24, 121) + point(24.001, 121)));
      expect(item.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('imports even without Web Crypto available', () => {
    vi.stubGlobal('crypto', undefined);
    try {
      const item = parseGpx(track(point(24, 121) + point(24.001, 121)));
      expect(item.id).toMatch(/^id-/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('replay and display', () => {
  it('changes the camera heading along a bend and retains the arrival heading', () => {
    const item = parseGpx(track(point(0, 0) + point(0.01, 0) + point(0.01, 0.01)));
    expect(routeBearing(item.points, 0)).toBeCloseTo(0);
    expect(routeBearing(item.points, item.distance * 0.75)).toBeCloseTo(90, 2);
    expect(routeBearing(item.points, item.distance)).toBeCloseTo(90, 2);
    const nearTurn = routeBearing(item.points, item.points[1].distance - 20)!;
    expect(nearTurn).toBeGreaterThan(0);
    expect(nearTurn).toBeLessThan(90);
  });

  it('does not use disconnected segments to determine the camera heading', () => {
    const item = parseGpx(gpx(`<trk><trkseg>${point(0, 0)}${point(0.0001, 0)}</trkseg><trkseg>${point(10, 10)}${point(10, 10.0001)}</trkseg></trk>`));
    expect(routeBearing(item.points, 5)).toBeCloseTo(0);
    expect(routeBearing(item.points, item.distance - 5)).toBeCloseTo(90, 2);
  });

  it('handles duplicate points, missing elevation and antimeridian crossings', () => {
    const item = parseGpx(track(point(0, 179.999) + point(0, 179.999) + point(0, -179.999)));
    expect(routeBearing(item.points, 0)).toBeCloseTo(90);
    expect(routeBearing([item.points[0]], 0)).toBeNull();
    expect(routeBearing([item.points[0], item.points[1]], 0)).toBeNull();
  });

  it('turns along the shortest angular path across north and south', () => {
    expect(nearestBearing(179, -179)).toBe(181);
    expect(nearestBearing(-179, 179)).toBe(-181);
    expect(nearestBearing(350, 10)).toBe(370);
    expect(nearestBearing(0, 90)).toBe(90);
    expect(nearestBearing(1080, 10)).toBe(1090);
  });

  it('interpolates position and elevation by distance', () => {
    const item = parseGpx(track(point(24, 121, 100) + point(24.002, 121, 200)));
    const middle = pointAt(item.points, item.distance / 2);
    expect(middle.lat).toBeCloseTo(24.001);
    expect(middle.elevation).toBeCloseTo(150);
    expect(pointAt(item.points, 0).lat).toBe(24);
    expect(pointAt(item.points, item.distance).lat).toBe(24.002);
  });

  it('uses the short path over the antimeridian', () => {
    const item = parseGpx(track(point(0, 179.9) + point(0, -179.9)));
    expect(item.distance).toBeLessThan(23000);
    expect(Math.abs(pointAt(item.points, item.distance / 2).lon)).toBeCloseTo(180);
  });

  it('uses great-circle distance and formats missing time', () => {
    expect(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111195, -1);
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(3660)).toBe('1 小時 1 分');
  });
});
