import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { type GeoJSONSource, type StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { LoaderCircle, MapPin, WifiOff, X } from 'lucide-react';
import { nearestBearing, pointAt, routeBearing, type Activity } from '../lib/gpx';

maplibregl.setWorkerUrl(workerUrl);

const style: StyleSpecification = {
  version: 8,
  sources: {
    osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors', maxzoom: 19 },
    satellite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256,
      attribution: 'Imagery © <a href="https://www.esri.com/" target="_blank">Esri</a> & contributors', maxzoom: 19 },
    terrain: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium', tileSize: 256, maxzoom: 15,
      attribution: 'Elevation: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank">Tilezen / AWS Open Data</a>' },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#dce4d6' } },
    { id: 'base', type: 'raster', source: 'osm', paint: { 'raster-saturation': -0.65, 'raster-contrast': -0.08, 'raster-opacity': 0.94 } },
    { id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.96 } },
    { id: 'shade', type: 'hillshade', source: 'terrain', paint: { 'hillshade-shadow-color': '#3d5849', 'hillshade-highlight-color': '#f6f4dc', 'hillshade-exaggeration': 0.3 } },
  ],
};

interface Props {
  activity: Activity;
  progress: number;
  is3d: boolean;
  basemap: 'map' | 'satellite';
  follow: boolean;
  fitSignal: number;
  onInteract: () => void;
}

export default function TerrainMap({ activity, progress, is3d, basemap, follow, fitSignal, onInteract }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState(false);
  const lastFollow = useRef(0);

  useEffect(() => {
    if (!container.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({ container: container.current, style, center: [121.277, 24.153], zoom: 12,
        pitch: 60, bearing: -25, maxPitch: 80, attributionControl: { compact: true } });
    } catch {
      setFatal(true);
      setError('無法啟動 3D 地圖，請使用支援 WebGL 的瀏覽器並開啟硬體加速。');
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.on('error', () => setError('部分地圖圖磚載入失敗。請檢查網路連線；活動數據仍可正常瀏覽。'));
    // Set up the route as soon as the style is ready; do not block it on remote tiles.
    map.on('style.load', () => {
      map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('position', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'route-outline', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#fff9e9', 'line-width': 8, 'line-opacity': 0.9 } });
      map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#e97639', 'line-width': 4 } });
      map.addLayer({ id: 'position-halo', type: 'circle', source: 'position', paint: { 'circle-radius': 13, 'circle-color': '#e97639', 'circle-opacity': 0.2 } });
      map.addLayer({ id: 'position-dot', type: 'circle', source: 'position', paint: { 'circle-radius': 6, 'circle-color': '#e97639', 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' } });
      setReady(true);
    });
    const interact = (event: { originalEvent?: unknown }) => { if (event.originalEvent) onInteractRef.current(); };
    map.on('dragstart', interact);
    map.on('rotatestart', interact);
    map.on('zoomstart', interact);
    map.on('pitchstart', interact);
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setLayoutProperty('base', 'visibility', basemap === 'map' ? 'visible' : 'none');
    map.setLayoutProperty('satellite', 'visibility', basemap === 'satellite' ? 'visible' : 'none');
  }, [ready, basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setTerrain(is3d ? { source: 'terrain', exaggeration: 1.25 } : null);
    map.easeTo({ pitch: is3d ? 60 : 0, duration: 700 });
  }, [ready, is3d]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const lines: number[][][] = [];
    let segment = -1;
    for (const p of activity.points) {
      if (segment !== p.segment) { lines.push([]); segment = p.segment; }
      lines[lines.length - 1].push([p.lon, p.lat]);
    }
    (map.getSource('route') as GeoJSONSource).setData({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines.filter((line) => line.length > 1) } });
    const bounds = new maplibregl.LngLatBounds();
    for (const p of activity.points) bounds.extend([p.lon, p.lat]);
    map.fitBounds(bounds, { padding: { top: 80, bottom: 165, left: 60, right: 60 }, maxZoom: 15, duration: 900, pitch: is3d ? 60 : 0, bearing: is3d ? -25 : 0 });
    // Fit only on selection / explicit request; changing 3D mode should preserve location.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, ready, fitSignal]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const p = pointAt(activity.points, progress * activity.distance);
    (map.getSource('position') as GeoJSONSource).setData({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } });
  }, [activity, progress, ready]);

  useEffect(() => {
    lastFollow.current = 0;
    if (follow) return () => { mapRef.current?.stop(); };
  }, [follow, activity.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !follow) return;
    const updateCamera = () => {
      const distance = progress * activity.distance;
      const p = pointAt(activity.points, distance);
      const heading = routeBearing(activity.points, distance);
      map.easeTo({
        center: [p.lon, p.lat],
        bearing: is3d ? nearestBearing(map.getBearing(), heading ?? map.getBearing()) : 0,
        pitch: is3d ? 60 : 0,
        zoom: Math.max(map.getZoom(), 14),
        duration: lastFollow.current === 0 ? 700 : 350,
        easing: (t) => t,
      });
      lastFollow.current = performance.now();
    };
    // Throttle camera work, but always apply the final position after a pause or seek.
    const delay = Math.max(0, 120 - (performance.now() - lastFollow.current));
    if (lastFollow.current === 0 || delay === 0) {
      updateCamera();
      return;
    }
    const timer = window.setTimeout(updateCamera, delay);
    return () => window.clearTimeout(timer);
  }, [activity, progress, follow, ready, is3d]);

  return <div className="map-wrap">
    <div className="terrain-map" ref={container} aria-label="活動路線 3D 地形地圖" />
    {!ready && !fatal && <div className="map-loading"><LoaderCircle className="spin" size={22} /><span>正在展開山的輪廓…</span></div>}
    {error && <div className={`map-warning ${fatal ? 'fatal' : ''}`} role="status"><WifiOff size={17} /><span>{error}</span>{!fatal && <button className="icon-button" aria-label="關閉地圖提示" onClick={() => setError(null)}><X size={16} /></button>}</div>}
    <div className="map-location"><MapPin size={13} /><span>{activity.demo ? '台灣・合歡山' : '你的旅程'}</span><span className="map-location-dot" />{is3d ? '3D 地形' : '2D 地圖'}</div>
    <div className="map-scale-note">{is3d ? '地形高度 × 1.25' : '平面檢視'}<span>拖曳探索 · 雙指縮放</span></div>
  </div>;
}
