import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGpx, pointAt, type Activity } from '../lib/gpx';
import TerrainMap from './TerrainMap';

const { fakeMap, listeners } = vi.hoisted(() => {
  const listeners = new Map<string, (event?: { originalEvent?: unknown }) => void>();
  return {
    listeners,
    fakeMap: {
      addControl: vi.fn(), addSource: vi.fn(), addLayer: vi.fn(), setTerrain: vi.fn(),
      fitBounds: vi.fn(), easeTo: vi.fn(), stop: vi.fn(), resize: vi.fn(), remove: vi.fn(),
      setLayoutProperty: vi.fn(),
      getZoom: vi.fn(() => 14), getBearing: vi.fn(() => -25),
      getSource: vi.fn(() => ({ setData: vi.fn() })),
      on: vi.fn((name: string, handler: () => void) => {
        listeners.set(name, handler);
        if (name === 'style.load') queueMicrotask(handler);
      }),
    },
  };
});

vi.mock('maplibre-gl', () => ({
  Map: class { constructor() { return fakeMap; } },
  NavigationControl: class {},
  LngLatBounds: class { extend() { return this; } },
  setWorkerUrl: vi.fn(),
}));
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({ default: 'worker.js' }));

describe('dynamic follow camera', () => {
  let root: Root;
  let container: HTMLDivElement;
  let activity: Activity;
  const onInteract = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    vi.useFakeTimers();
    vi.advanceTimersByTime(1000);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    activity = parseGpx('<gpx><trk><trkseg><trkpt lat="0" lon="0"/><trkpt lat="0.01" lon="0"/><trkpt lat="0.01" lon="0.01"/></trkseg></trk></gpx>');
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function render(progress: number, follow = true, is3d = true, basemap: 'map' | 'satellite' = 'map') {
    await act(async () => {
      root.render(createElement(TerrainMap, { activity, progress, follow, is3d, basemap, fitSignal: 0, onInteract }));
    });
  }

  it('moves and turns the 3D camera and applies the trailing position after seeking', async () => {
    await render(0);
    expect(fakeMap.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [0, 0], bearing: 0, pitch: 60 }));
    await render(0.75);
    await act(async () => { vi.advanceTimersByTime(120); });
    const p = pointAt(activity.points, activity.distance * 0.75);
    expect(fakeMap.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [p.lon, p.lat], bearing: expect.closeTo(90, 2), pitch: 60 }));
  });

  it('cancels pending movement when follow is switched off', async () => {
    await render(0);
    await render(0.5);
    await render(0.5, false);
    const calls = fakeMap.easeTo.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(fakeMap.easeTo).toHaveBeenCalledTimes(calls);
    expect(fakeMap.stop).toHaveBeenCalled();
  });

  it('keeps 2D north-up and resumes the route heading in 3D', async () => {
    await render(0.75, true, false);
    expect(fakeMap.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ bearing: 0, pitch: 0 }));
    await render(0.75, true, true);
    await act(async () => { vi.advanceTimersByTime(120); });
    expect(fakeMap.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ bearing: expect.closeTo(90, 2), pitch: 60 }));
  });

  it('switches the base layer between map and satellite imagery', async () => {
    await render(0, false);
    expect(fakeMap.setLayoutProperty).toHaveBeenCalledWith('base', 'visibility', 'visible');
    expect(fakeMap.setLayoutProperty).toHaveBeenCalledWith('satellite', 'visibility', 'none');
    await render(0, false, true, 'satellite');
    expect(fakeMap.setLayoutProperty).toHaveBeenCalledWith('base', 'visibility', 'none');
    expect(fakeMap.setLayoutProperty).toHaveBeenCalledWith('satellite', 'visibility', 'visible');
  });

  it('ignores programmatic movement but pauses follow for manual map interaction', async () => {
    await render(0);
    listeners.get('rotatestart')?.({});
    expect(onInteract).not.toHaveBeenCalled();
    for (const name of ['dragstart', 'rotatestart', 'zoomstart', 'pitchstart']) {
      listeners.get(name)?.({ originalEvent: new Event('pointerdown') });
    }
    expect(onInteract).toHaveBeenCalledTimes(4);
  });
});
