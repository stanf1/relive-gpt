export interface TrackPoint {
  lat: number;
  lon: number;
  elevation: number | null;
  time: number | null;
  segment: number;
  distance: number;
}

export interface Activity {
  id: string;
  name: string;
  importedAt: number;
  points: TrackPoint[];
  distance: number;
  ascent: number | null;
  descent: number | null;
  maxElevation: number | null;
  duration: number | null;
  startTime: number | null;
  demo?: boolean;
}

const EARTH_RADIUS = 6371008.8;
export function haversine(a: Pick<TrackPoint, 'lat' | 'lon'>, b: Pick<TrackPoint, 'lat' | 'lon'>): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function summarize(points: TrackPoint[]): Pick<Activity, 'distance' | 'ascent' | 'descent' | 'maxElevation' | 'duration' | 'startTime'> {
  let distance = 0;
  let ascent = 0;
  let descent = 0;
  let elevationPairs = 0;
  let maxElevation: number | null = null;
  let duration = 0;
  let timePairs = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[i - 1];
    if (p.elevation !== null) maxElevation = Math.max(maxElevation ?? -Infinity, p.elevation);
    if (prev && prev.segment === p.segment) {
      distance += haversine(prev, p);
      if (p.elevation !== null && prev.elevation !== null) {
        const delta = p.elevation - prev.elevation;
        ascent += Math.max(0, delta);
        descent += Math.max(0, -delta);
        elevationPairs++;
      }
      if (p.time !== null && prev.time !== null && p.time >= prev.time) {
        duration += p.time - prev.time;
        timePairs++;
      }
    }
    p.distance = distance;
  }
  // Partial or non-monotonic timestamps cannot describe total elapsed time reliably.
  const expectedPairs = points.filter((p, i) => i > 0 && p.segment === points[i - 1].segment).length;
  return {
    distance,
    ascent: elevationPairs === expectedPairs && expectedPairs > 0 ? ascent : null,
    descent: elevationPairs === expectedPairs && expectedPairs > 0 ? descent : null,
    maxElevation,
    duration: timePairs === expectedPairs && expectedPairs > 0 ? duration / 1000 : null,
    startTime: points[0]?.time ?? null,
  };
}

function children(element: Element, name: string): Element[] {
  return Array.from(element.children).filter((el) => el.localName === name);
}

function numberText(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function generateId(): string {
  // crypto.randomUUID() needs a secure context (localhost or HTTPS).
  // Plain-http LAN access (e.g. http://192.168.x.x:8090) does not have it,
  // so fall back instead of breaking GPX import.
  const cryptoObject = (globalThis as { crypto?: Crypto }).crypto;
  if (typeof cryptoObject?.randomUUID === 'function') {
    try {
      return cryptoObject.randomUUID();
    } catch {
      // Fall through to the generators below.
    }
  }
  if (typeof cryptoObject?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoObject.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `id-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

export function parseGpx(text: string, filename = '未命名旅程'): Activity {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'gpx') {
    throw new Error('這不是有效的 GPX 檔案，請確認檔案內容後再試一次。');
  }
  const tracks = children(doc.documentElement, 'trk');
  let segments = tracks.flatMap((track) => children(track, 'trkseg'));
  if (!segments.length) segments = children(doc.documentElement, 'rte');
  const points: TrackPoint[] = [];
  let segment = 0;
  for (const source of segments) {
    for (const el of children(source, source.localName === 'rte' ? 'rtept' : 'trkpt')) {
      const lat = numberText(el.getAttribute('lat'));
      const lon = numberText(el.getAttribute('lon'));
      if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        // Never join a line over an invalid track point.
        segment++;
        continue;
      }
      const timeText = children(el, 'time')[0]?.textContent;
      const time = timeText ? Date.parse(timeText) : NaN;
      points.push({ lat, lon, elevation: numberText(children(el, 'ele')[0]?.textContent), time: Number.isFinite(time) ? time : null, segment, distance: 0 });
      if (points.length > 200000) throw new Error('路徑超過 200,000 個點，請先簡化 GPX 後再匯入。');
    }
    segment++;
  }
  if (points.length < 2) throw new Error('GPX 中找不到足夠的路徑點，至少需要兩個有效座標。');
  const stats = summarize(points);
  if (stats.distance === 0) throw new Error('這份 GPX 沒有可連接的有效路徑。');
  const metadata = children(doc.documentElement, 'metadata')[0];
  const name = tracks.map((t) => children(t, 'name')[0]?.textContent?.trim()).find(Boolean)
    || children(doc.documentElement, 'rte').map((r) => children(r, 'name')[0]?.textContent?.trim()).find(Boolean)
    || (metadata && children(metadata, 'name')[0]?.textContent?.trim())
    || filename.replace(/\.gpx$/i, '');
  return { id: generateId(), name, importedAt: Date.now(), points, ...stats };
}

export function pointAt(points: TrackPoint[], distance: number): TrackPoint {
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (points[mid].distance < distance) lo = mid + 1;
    else hi = mid;
  }
  const b = points[lo];
  const a = points[Math.max(0, lo - 1)];
  if (a.segment !== b.segment || b.distance === a.distance) return b;
  const t = Math.max(0, Math.min(1, (distance - a.distance) / (b.distance - a.distance)));
  // Interpolate across the antimeridian along the short arc.
  const lonDelta = ((b.lon - a.lon + 540) % 360) - 180;
  return { ...a, lat: a.lat + (b.lat - a.lat) * t, lon: ((a.lon + lonDelta * t + 540) % 360) - 180, distance,
    elevation: a.elevation !== null && b.elevation !== null ? a.elevation + (b.elevation - a.elevation) * t : null };
}

export function routeBearing(points: TrackPoint[], distance: number): number | null {
  const current = pointAt(points, distance);
  // Locate the current segment without scanning a potentially large GPX on every frame.
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (points[mid].segment < current.segment) lo = mid + 1;
    else hi = mid;
  }
  const start = lo;
  hi = points.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (points[mid].segment <= current.segment) lo = mid + 1;
    else hi = mid;
  }
  const end = lo - 1;
  if (start === end) return null;

  // Look ahead in metres rather than point counts, so dense GPS jitter does not
  // shake the camera. Clamp both samples to this segment, including at the finish.
  const sample = (d: number) => {
    if (d <= points[start].distance) return points[start];
    if (d >= points[end].distance) return points[end];
    return pointAt(points, d);
  };
  const a = sample(Math.max(points[start].distance, distance - 30));
  const b = sample(Math.min(points[end].distance, distance + 80));
  if (haversine(a, b) < 0.5) return null;
  const rad = Math.PI / 180;
  const deltaLon = (b.lon - a.lon) * rad;
  const y = Math.sin(deltaLon) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad)
    - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos(deltaLon);
  return Math.atan2(y, x) / rad;
}

export function nearestBearing(current: number, target: number): number {
  // For example, 179° → -179° should rotate 2°, not a full 358° turn.
  return current + ((target - current + 540) % 360 + 360) % 360 - 180;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const mins = Math.floor(seconds / 60);
  return mins >= 60 ? `${Math.floor(mins / 60)} 小時 ${mins % 60} 分` : `${mins} 分 ${Math.floor(seconds % 60)} 秒`;
}

export function formatDate(timestamp: number | null): string {
  return timestamp === null ? '未提供日期' : new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(timestamp);
}
