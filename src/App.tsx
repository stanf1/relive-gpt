import { memo, useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowRight, ArrowUp, Check, ChevronDown, ChevronRight, Clock3, Compass, Crosshair, Flag, FolderHeart, Footprints, Info, Layers3, LoaderCircle, Map as MapIcon, MapPin, Mountain, MountainSnow, Navigation, Pause, Pencil, Play, Plus, RotateCcw, Route, Satellite, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import TerrainMap from './components/TerrainMap';
import ElevationChart from './components/ElevationChart';
import { demoActivity } from './lib/demo';
import { formatDate, parseGpx, pointAt, type Activity } from './lib/gpx';
import { deleteActivity, loadActivities, saveActivity } from './lib/storage';

const RouteThumbnail = memo(function RouteThumbnail({ activity }: { activity: Activity }) {
  const points = activity.points;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) { minX = Math.min(minX, p.lon); maxX = Math.max(maxX, p.lon); minY = Math.min(minY, p.lat); maxY = Math.max(maxY, p.lat); }
  const scale = Math.max(maxX - minX, maxY - minY, 0.0001);
  let path = '';
  const step = Math.max(1, Math.floor(points.length / 100));
  for (let i = 0; i < points.length; i += step) {
    const p = points[i];
    path += `${i === 0 || p.segment !== points[Math.max(0, i - step)].segment ? 'M' : 'L'}${(10 + ((p.lon - minX) + (scale - maxX + minX) / 2) / scale * 40).toFixed(1)},${(50 - ((p.lat - minY) + (scale - maxY + minY) / 2) / scale * 40).toFixed(1)} `;
  }
  return <svg viewBox="0 0 60 60" className="route-thumbnail" aria-hidden="true"><path d="M0 16 Q25 4 60 20 M0 32 Q35 18 60 38 M0 48 Q30 32 60 54" fill="none" stroke="currentColor" strokeOpacity="0.13" /><path d={path} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
});

export default function App() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedId, setSelectedId] = useState('demo');
  const [loaded, setLoaded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [is3d, setIs3d] = useState(true);
  const [basemap, setBasemap] = useState<'map' | 'satellite'>('map');
  const [follow, setFollow] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null);
  const [mobileLibrary, setMobileLibrary] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const progressRef = useRef(0);
  const activity = activities.find((item) => item.id === selectedId) ?? demoActivity;
  const currentPoint = pointAt(activity.points, progress * activity.distance);

  useEffect(() => {
    let cancelled = false;
    loadActivities().then((items) => {
      if (cancelled) return;
      setActivities(items);
      if (items.length) setSelectedId(items[0].id);
    }).catch(() => {
      if (!cancelled) setNotice({ text: '無法讀取本機資料庫。請確認瀏覽器允許網站儲存資料，並重新整理。', error: true });
    }).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setPlaying(false); setProgress(0); progressRef.current = 0; setFollow(false); setEditing(false);
  }, [selectedId]);

  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let previous = 0;
    let lastPaint = 0;
    const tick = (now: number) => {
      if (previous) progressRef.current = Math.min(1, progressRef.current + Math.min(now - previous, 100) / (60000 / speed));
      previous = now;
      if (now - lastPaint > 32 || progressRef.current === 1) { setProgress(progressRef.current); lastPaint = now; }
      if (progressRef.current >= 1) { setPlaying(false); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);

  const seek = (value: number) => { progressRef.current = value; setProgress(value); };
  const stopFollow = useCallback(() => setFollow(false), []);
  const select = (id: string) => { setSelectedId(id); setMobileLibrary(false); };
  const requestImport = () => inputRef.current?.click();

  async function importFiles(files: File[]) {
    if (importing || !loaded || !files.length) return;
    setImporting(true);
    setDragging(false);
    const imported: Activity[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        if (!/\.gpx$/i.test(file.name)) throw new Error('請選擇 .gpx 檔案。');
        if (file.size > 20 * 1024 * 1024) throw new Error('檔案超過 20 MB，請先簡化路徑。');
        const item = parseGpx(await file.text(), file.name);
        try { await saveActivity(item); }
        catch { throw new Error('無法保存，可能是儲存空間不足或瀏覽器限制。請保留原始 GPX。'); }
        imported.push(item);
      } catch (err) { errors.push(`${file.name}：${err instanceof Error ? err.message : '匯入失敗'}`); }
    }
    if (imported.length) {
      const newestFirst = [...imported].reverse();
      setActivities((previous) => [...newestFirst, ...previous]);
      select(newestFirst[0].id);
    }
    setNotice({ text: [imported.length ? `已匯入並保存 ${imported.length} 筆旅程。` : '', ...errors].filter(Boolean).join('\n'), error: errors.length > 0 });
    setImporting(false);
  }

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    void importFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  }

  async function rename() {
    if (!draftName.trim() || saving) return;
    setSaving(true);
    try {
      const updated = { ...activity, name: draftName.trim().slice(0, 100) };
      await saveActivity(updated);
      setActivities((items) => items.map((item) => item.id === updated.id ? updated : item));
      setEditing(false);
    } catch { setNotice({ text: '重新命名未保存，請檢查本機儲存空間後再試。', error: true }); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!deleteTarget || saving) return;
    setSaving(true);
    try {
      await deleteActivity(deleteTarget.id);
      const remaining = activities.filter((item) => item.id !== deleteTarget.id);
      setActivities(remaining);
      if (selectedId === deleteTarget.id) setSelectedId(remaining[0]?.id ?? 'demo');
      setDeleteTarget(null);
      setNotice({ text: '旅程已從此瀏覽器移除。' });
    } catch { setNotice({ text: '刪除失敗，紀錄仍保留在瀏覽器中。', error: true }); }
    finally { setSaving(false); }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault(); dragDepth.current = 0; setDragging(false);
    void importFiles(Array.from(event.dataTransfer.files));
  }

  return <div className="app" onDragEnter={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); dragDepth.current++; setDragging(true); } }} onDragLeave={(e) => { e.preventDefault(); if (--dragDepth.current <= 0) setDragging(false); }} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
    <input ref={inputRef} type="file" accept=".gpx,application/gpx+xml" multiple hidden onChange={onFiles} disabled={importing || !loaded} />
    <header className="header">
      <a className="brand" href="./" aria-label="山徑首頁"><div className="brand-mark"><MountainSnow size={28} strokeWidth={1.7} /></div><div className="brand-word">山徑<span>TRAILOGUE</span></div></a>
      <div className="header-separator" /><span className="header-tagline">每一步，都值得重溫。</span>
      <nav className="header-actions" aria-label="主要功能"><span className="local-badge"><span />本機儲存・不需登入</span><button className="button primary import-top" onClick={requestImport} disabled={importing || !loaded}>{importing ? <LoaderCircle size={17} className="spin" /> : <Plus size={18} />}<span>{importing ? '匯入中…' : '匯入 GPX'}</span></button><button className="icon-button help-button" aria-label="使用說明與資料隱私" onClick={() => setInfoOpen(true)}><Info size={20} /></button></nav>
    </header>

    <div className="workspace">
      <aside className={`sidebar ${mobileLibrary ? 'mobile-open' : ''}`}>
        <div className="library-heading"><div><span className="eyebrow">YOUR COLLECTION</span><h2>我的旅程 <span>{activities.length.toString().padStart(2, '0')}</span></h2></div><button className="icon-button mobile-close" aria-label="關閉旅程列表" onClick={() => setMobileLibrary(false)}><X size={20} /></button><FolderHeart className="library-icon" size={23} strokeWidth={1.5} /></div>
        <div className="library-list">
          {!loaded ? <div className="library-empty"><LoaderCircle className="spin" size={22} /><p>正在讀取旅程…</p></div> : activities.length === 0 ? <div className="library-empty"><div className="empty-icon"><Footprints size={27} strokeWidth={1.4} /></div><h3>下一段故事，從這裡開始</h3><p>匯入你的第一份 GPX，<br />把走過的風景好好收藏。</p><button className="text-button" onClick={requestImport} disabled={importing}>加入第一段旅程 <ArrowRight size={14} /></button></div> : activities.map((item) => <button key={item.id} className={`activity-card ${activity.id === item.id ? 'selected' : ''}`} onClick={() => select(item.id)}><div className="activity-card-top"><RouteThumbnail activity={item} /><div className="activity-card-info"><span className="activity-card-date">{formatDate(item.startTime)}</span><h3>{item.name}</h3><span className="activity-card-stats">{(item.distance / 1000).toFixed(2)} km <span>·</span> {item.ascent === null ? '海拔未提供' : `↗ ${Math.round(item.ascent)} m`}</span></div><ChevronRight size={15} /></div></button>)}
          <button className="add-journey" onClick={requestImport} disabled={importing || !loaded}><Plus size={18} />{importing ? '正在保存旅程…' : '匯入新旅程'}<span>.GPX</span></button>
          <div className="sidebar-divider"><span>探索靈感</span></div>
          <button className={`demo-card ${activity.demo ? 'active' : ''}`} onClick={() => select('demo')}><div className="demo-illustration"><svg viewBox="0 0 260 108" aria-hidden="true"><defs><linearGradient id="mountain-bg" x2="0" y2="1"><stop stopColor="#a6bba3" /><stop offset="1" stopColor="#536f60" /></linearGradient></defs><circle cx="203" cy="29" r="15" fill="#eddbac" opacity=".75" /><path d="M0 77 43 31 79 65 121 16 177 76 215 46 260 83V108H0Z" fill="#9faf94" /><path d="m64 108 58-92 23 39 18 8 37 45Z" fill="url(#mountain-bg)" /><path d="m122 16-19 31 16-7 9 8 5-13Z" fill="#e5e8d9" /><path d="M0 108 46 63 94 108 161 75 225 108Z" fill="#3e5b4c" /><path d="m123 102 12-17-4-10 8-12-2-10" fill="none" stroke="#efb27b" strokeWidth="2" strokeDasharray="3 3" /></svg><span>示範旅程</span></div><div className="demo-card-content"><div><h3>走進合歡山的稜線</h3><p>先看看，你的旅程會是什麼模樣。</p></div><ArrowRight size={17} /></div></button>
        </div>
        <div className="sidebar-footer"><ShieldCheck size={16} /><p>你的路線，只屬於你。<span>紀錄保存在此瀏覽器，不上傳 GPX。</span></p></div>
      </aside>
      {mobileLibrary && <button className="sidebar-scrim" aria-label="關閉旅程列表" onClick={() => setMobileLibrary(false)} />}

      <main className="main">
        <div className="breadcrumb"><button onClick={() => setMobileLibrary(true)}><FolderHeart size={14} />我的旅程</button><ChevronRight size={13} /><span>{activity.demo ? '示範旅程' : activity.name}</span><span className="breadcrumb-right"><Compass size={13} /> A LITTLE FURTHER, A LITTLE FREER</span></div>
        <section className="journey-heading">
          <div><div className="journey-label"><span><Mountain size={12} />{activity.demo ? '山野漫步' : 'GPX 活動'}</span>{activity.demo && <span className="sample-label">示意路線・非實際紀錄</span>}{!activity.demo && <span className="saved-label"><Check size={11} />已保存至本機</span>}</div>
          {editing ? <form className="rename-form" onSubmit={(e) => { e.preventDefault(); void rename(); }}><input autoFocus aria-label="旅程名稱" value={draftName} maxLength={100} onChange={(e) => setDraftName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }} /><button className="icon-button" aria-label="保存名稱" disabled={saving || !draftName.trim()}><Check size={19} /></button><button className="icon-button" type="button" aria-label="取消重新命名" onClick={() => setEditing(false)}><X size={18} /></button></form> : <h1>{activity.name}{!activity.demo && <button className="icon-button edit-name" aria-label="重新命名旅程" onClick={() => { setDraftName(activity.name); setEditing(true); }}><Pencil size={15} /></button>}</h1>}
          <div className="journey-meta"><span><Clock3 size={13} />{formatDate(activity.startTime)}</span><span className="meta-dot">·</span><span><Route size={13} />{activity.demo ? '合歡山區・示範資料' : `${activity.points.length.toLocaleString()} 個路徑點`}</span></div></div>
          <div className="heading-actions">{!activity.demo && <button className="icon-button delete-button" aria-label="刪除目前旅程" onClick={() => setDeleteTarget(activity)}><Trash2 size={17} /></button>}<span className="journey-stamp"><MountainSnow size={22} /><span>GO OUTSIDE<br /><strong>FEEL ALIVE</strong></span></span></div>
        </section>

        <section className="stats-grid" aria-label="活動數據">
          <div className="stat"><span className="stat-label"><Route size={15} />總距離</span><div className="stat-number">{(activity.distance / 1000).toFixed(2)}<span>km</span></div><span className="stat-caption">每一步的累積</span></div>
          <div className="stat"><span className="stat-label"><ArrowUp size={15} />累積爬升</span><div className="stat-number">{activity.ascent === null ? '—' : Math.round(activity.ascent).toLocaleString()}<span>m</span></div><span className="stat-caption">下降 {activity.descent === null ? '—' : Math.round(activity.descent).toLocaleString()} m <ArrowDown size={10} /></span></div>
          <div className="stat"><span className="stat-label"><Mountain size={15} />最高海拔</span><div className="stat-number">{activity.maxElevation === null ? '—' : Math.round(activity.maxElevation).toLocaleString()}<span>m</span></div><span className="stat-caption">旅途中的高點</span></div>
          <div className="stat"><span className="stat-label"><Clock3 size={15} />活動時間</span><div className="stat-number time-number">{activity.duration === null ? '—' : <>{Math.floor(activity.duration / 3600)}<span>h</span>{Math.floor(activity.duration / 60) % 60}<span>m</span></>}</div><span className="stat-caption">{activity.duration === null ? 'GPX 時間資料不足' : '各路段時間總和・含停留'}</span></div>
        </section>

        <section className="map-section" aria-label="路線地圖與重播">
          <TerrainMap activity={activity} progress={progress} is3d={is3d} basemap={basemap} follow={follow} fitSignal={fitSignal} onInteract={stopFollow} />
          <div className="map-toolbar"><div className="map-mode" role="group" aria-label="底圖切換"><button className={basemap === 'map' ? 'active' : ''} onClick={() => setBasemap('map')} aria-pressed={basemap === 'map'} aria-label="地圖底圖"><MapIcon size={14} />地圖</button><button className={basemap === 'satellite' ? 'active' : ''} onClick={() => setBasemap('satellite')} aria-pressed={basemap === 'satellite'} aria-label="衛星影像底圖"><Satellite size={14} />衛星</button></div><div className="map-mode"><button className={is3d ? 'active' : ''} onClick={() => setIs3d(true)} aria-pressed={is3d}><Layers3 size={14} />3D 地形</button><button className={!is3d ? 'active' : ''} onClick={() => setIs3d(false)} aria-pressed={!is3d}>2D</button></div><button className="map-fit" onClick={() => { setFollow(false); setFitSignal((n) => n + 1); }} aria-label="顯示完整路線" title="顯示完整路線"><Crosshair size={18} /></button></div>
          <div className="route-legend"><span />你的足跡</div>
          <div className="playback-panel">
            <div className="playback-top"><div className="playback-title"><span className="live-dot" /><h2>重溫這段旅程</h2><span className="playback-subtitle">讓風景，再走一次。</span></div><button className={`follow-button ${follow ? 'active' : ''}`} aria-pressed={follow} onClick={() => setFollow(!follow)}><Navigation size={13} />視角跟隨<span className="toggle"><span /></span></button></div>
            <div className="playback-controls"><button className="play-button" aria-label={playing ? '暫停重播' : '開始重播'} onClick={() => { if (progress >= 1) seek(0); if (!playing) setFollow(true); setPlaying(!playing); }}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button><button className="icon-button restart-button" aria-label="從頭重播" onClick={() => { seek(0); setPlaying(false); }}><RotateCcw size={16} /></button><div className="timeline"><input aria-label="重播進度" type="range" min="0" max="1" step="0.001" value={progress} onChange={(e) => seek(Number(e.target.value))} style={{ '--progress': `${progress * 100}%` } as React.CSSProperties} /><div className="timeline-labels"><span><MapPin size={10} />起點</span><span>{(progress * activity.distance / 1000).toFixed(2)} / {(activity.distance / 1000).toFixed(2)} km</span><span>終點<Flag size={10} /></span></div></div><label className="speed-select"><span className="sr-only">重播速度</span><select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select><ChevronDown size={12} /></label></div>
          </div>
        </section>

        <section className="elevation-section"><div className="elevation-heading"><div><span className="section-icon"><Mountain size={16} /></span><h2>海拔剖面</h2><span className="elevation-hint">每一次起伏，都是旅程的一部分。</span></div><span className="current-elevation">目前海拔<strong>{currentPoint.elevation === null ? '—' : Math.round(currentPoint.elevation).toLocaleString()}<small> m</small></strong></span></div><ElevationChart activity={activity} progress={progress} onSeek={seek} /></section>
        <footer className="main-footer"><span><ShieldCheck size={12} />{activity.demo ? '示範資料僅供體驗，不可作為登山導航。' : '爬升依 GPX 原始海拔計算，未濾除 GPS 誤差；缺漏資料以 — 顯示。'}</span><span>留住路徑，也留住當下。<MountainSnow size={15} /></span></footer>
      </main>
    </div>

    {notice && <div className={`notice ${notice.error ? 'notice-error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.error ? <Info size={18} /> : <Check size={18} />}<span>{notice.text}</span><button className="icon-button" aria-label="關閉通知" onClick={() => setNotice(null)}><X size={17} /></button></div>}
    {dragging && <div className="drop-overlay"><div><ArrowDownToLine size={48} strokeWidth={1.3} /><h2>讓旅程，落在這裡。</h2><p>放開以匯入 GPX・支援多個檔案</p></div></div>}
    {importing && <div className="import-status" role="status"><LoaderCircle size={15} className="spin" />正在解析並保存 GPX，請勿關閉分頁。</div>}

    {infoOpen && <div className="modal-backdrop" onClick={() => setInfoOpen(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="info-title" ref={(el) => el?.focus()} tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') setInfoOpen(false); if (e.key === 'Tab') { e.preventDefault(); (e.currentTarget.querySelector('button') as HTMLButtonElement)?.focus(); } }} onClick={(e) => e.stopPropagation()}><button className="icon-button modal-close" aria-label="關閉使用說明" onClick={() => setInfoOpen(false)}><X size={20} /></button><div className="modal-emblem"><MountainSnow size={30} /></div><span className="eyebrow">A SPACE FOR YOUR ADVENTURES</span><h2 id="info-title">把走過的路，變成風景。</h2><div className="info-row"><Upload size={19} /><div><h3>帶上你的 GPX</h3><p>選擇或拖入 .gpx 檔案，單檔上限 20 MB、200,000 個路徑點。支援多筆匯入、軌跡與路線資料。</p></div></div><div className="info-row"><Play size={19} /><div><h3>從另一個角度，再走一次</h3><p>切換 3D 地形、開啟視角跟隨，或拖曳海拔圖探索。1× 重播約 60 秒，是視覺化重播而非實際活動速度。</p></div></div><div className="info-row"><ShieldCheck size={19} /><div><h3>不需帳號，也不上傳 GPX</h3><p>紀錄存於目前瀏覽器的 IndexedDB，不會跨裝置同步。清除網站資料、無痕模式或瀏覽器自動釋放空間可能導致紀錄消失，請保留原始 GPX。</p></div></div><div className="info-note">底圖與地形需連網，圖磚供應商會收到目前檢視區域的請求。活動時間為各連續路段時間總和（包含停留）；時間與爬升資料不完整時顯示「—」。地圖不可替代登山導航。</div><button className="button primary modal-confirm" onClick={() => setInfoOpen(false)}>開始探索<ArrowRight size={16} /></button></section></div>}
    {deleteTarget && <div className="modal-backdrop" onClick={() => !saving && setDeleteTarget(null)}><section className="modal delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title" tabIndex={-1} ref={(el) => el?.focus()} onKeyDown={(e) => { if (e.key === 'Escape' && !saving) setDeleteTarget(null); if (e.key === 'Tab') { const buttons = Array.from(e.currentTarget.querySelectorAll('button:not(:disabled)')); const index = buttons.indexOf(document.activeElement as HTMLButtonElement); e.preventDefault(); (buttons[(index + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length] as HTMLButtonElement)?.focus(); } }} onClick={(e) => e.stopPropagation()}><Trash2 size={27} className="danger-icon" /><h2 id="delete-title">刪除這段旅程？</h2><p>「{deleteTarget.name}」將從此瀏覽器移除，無法復原。原始 GPX 檔案不受影響。</p><div className="modal-actions"><button className="button secondary" disabled={saving} onClick={() => setDeleteTarget(null)}>保留旅程</button><button className="button danger" disabled={saving} onClick={() => void remove()}>{saving ? '刪除中…' : '確認刪除'}</button></div></section></div>}
  </div>;
}
