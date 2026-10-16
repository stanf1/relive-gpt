# relive-gpt｜山徑 TRAILOGUE

**每一步，都值得重溫。**

將 GPX 活動紀錄化為可重播的山野旅程：透過 3D 地形、衛星底圖與海拔剖面，從另一個角度回顧走過的路。

這是一個純前端應用，不需註冊帳號或部署後端資料庫。GPX 在瀏覽器內解析，旅程保存在目前瀏覽器的 IndexedDB。

- 原始碼：[stanf1/relive-gpt](https://github.com/stanf1/relive-gpt)
- Docker 映像：[stanf1/relive-gpt](https://hub.docker.com/r/stanf1/relive-gpt)

## 功能

- **GPX 匯入**：選擇檔案或拖放匯入，支援多檔、軌跡（`trk` / `trkseg`）與路線（`rte`）。
- **2D / 3D 地圖**：切換地形、一般地圖與衛星影像，並可一鍵顯示完整路線。
- **旅程重播**：播放、暫停、重新開始、拖曳進度、視角跟隨，以及 1× / 2× / 4× / 8× 速度。
- **活動數據**：總距離、累積爬升與下降、最高海拔、活動時間。
- **海拔剖面**：顯示路線高度變化，拖曳圖表可調整重播位置。
- **本機收藏**：保存多筆旅程、重新命名與刪除，重新整理後仍可讀取。
- **響應式介面**：支援桌面與行動裝置，附合歡山示意旅程供體驗。

> 重播以路線距離推進，1× 約 60 秒播完整段路線，並非依原始活動時間等比例還原速度。示範旅程並非實際活動紀錄。

## 快速啟動：Docker Hub

主機需已安裝 Docker。目前發布映像支援 **`linux/amd64`**。

```bash
docker pull stanf1/relive-gpt:latest
docker run -d \
  --name relive-gpt \
  --restart unless-stopped \
  -p 8090:80 \
  stanf1/relive-gpt:latest
```

開啟 `http://localhost:8090`；從其他電腦連線時，改用 `http://主機IP:8090`，並確認防火牆規則。

- 修改 `8090` 可調整主機對外連接埠；容器內仍使用 `80`。
- `-p 8090:80` 預設對主機所有網路介面開放；若只供本機或反向代理使用，可改為 `-p 127.0.0.1:8090:80`。
- 對外提供服務時，建議透過反向代理啟用 HTTPS。
- 容器僅提供靜態網頁，**不需掛載活動資料 volume**；使用者資料存在各自的瀏覽器，不在容器內。

## 從原始碼以 Docker Compose 啟動

需安裝 Git、Docker 與 Docker Compose。

```bash
git clone https://github.com/stanf1/relive-gpt.git
cd relive-gpt
docker compose up -d --build
```

開啟 `http://localhost:8090`。

```bash
# 查看服務日誌
docker compose logs -f web

# 停止並移除 Compose 容器與網路
docker compose down
```

專案內的 `compose.yaml` 會**從原始碼建置**為 `relive-gpt-web:1.0`，不是直接下載 Docker Hub 映像。若要直接使用已發布版本，請採用上一節的啟動方式。

Dockerfile 使用 Node.js 建置前端，再以 Nginx 提供 `dist/` 靜態檔案，並設定單頁應用的路由回退。

## 本機開發

建議使用 **Node.js 22** 與 npm，與 Docker 建置環境一致。

```bash
git clone https://github.com/stanf1/relive-gpt.git
cd relive-gpt
npm ci
npm run dev
```

開啟 Vite 顯示的網址，預設為 `http://localhost:5173`。開發伺服器預設監聽所有網路介面，請僅在可信任網路使用。

### 建置與預覽

```bash
# TypeScript 檢查與正式建置，輸出至 dist/
npm run build

# 預覽建置結果，預設 http://localhost:4173
npm run preview
```

正式部署請使用 Nginx 或其他靜態網站服務，而非 Vite 開發／預覽伺服器。

### 測試

```bash
# 單元測試：GPX 解析、資料儲存與地圖互動邏輯
npm test

# 首次執行 E2E 前安裝 Chromium
npx playwright install chromium

# 桌面與行動尺寸的端對端測試
npm run test:e2e
```

Playwright 會自動啟動 `http://127.0.0.1:5173` 的開發伺服器。Linux 若缺少瀏覽器系統依賴，可執行 `npx playwright install --with-deps chromium`（安裝系統套件可能需要管理員權限）。

## 使用方式與資料限制

1. 開啟網站，先體驗內建示範旅程，或選擇「匯入 GPX」。
2. 選取或拖入一個以上的 `.gpx` 檔案。
3. 從「我的旅程」選擇活動，切換底圖、地形與重播設定。
4. 透過時間軸或海拔圖調整位置；已匯入的旅程可重新命名或刪除。

- 單一檔案上限 **20 MB**、**200,000 個有效路徑點**。
- 至少需要兩個有效座標及可連接、非零距離的路徑；不支援單獨以航點（`wpt`）構成的檔案。
- 多段路線不會跨段連線；無效座標會中斷連線，避免產生錯誤路徑。
- 缺少或不完整的海拔／時間資料以「—」顯示，不會補成零值。
- 活動時間為各連續路段有效時間差的總和，包含停留，不是移動時間。
- 爬升／下降依 GPX 原始海拔計算，未濾除 GPS 誤差，不能視為精密測量。

## 隱私、儲存與地圖來源

- **GPX 不會上傳到此應用的伺服器**；解析與保存皆在瀏覽器內完成。
- 資料依網站來源（協定、主機與連接埠）隔離，不會跨瀏覽器或裝置同步。更換網域、IP、連接埠或切換 HTTP / HTTPS 時，原有收藏不會自動搬移。
- 清除網站資料、無痕模式或瀏覽器回收儲存空間，可能導致收藏消失。**請保留原始 GPX 作為備份**，不要將瀏覽器收藏視為唯一備份。
- 地圖需要支援 WebGL 的瀏覽器，建議啟用硬體加速。
- 底圖與地形需要網路連線；即使 GPX 不上傳，圖磚供應商仍會收到目前檢視區域的圖磚請求。
- 一般底圖：[OpenStreetMap](https://www.openstreetmap.org/copyright)；衛星影像：[Esri World Imagery](https://www.esri.com/)；地形：[Tilezen / AWS Open Data](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)。部署與使用時請遵守各供應商條款及流量政策，保留圖資標示。

> 本工具用於活動回顧與視覺化，不能替代登山導航、離線地圖或安全規劃；目前不提供影片匯出、雲端備份或跨裝置同步。

## 技術與目錄

React 19、TypeScript、Vite、MapLibre GL JS、IndexedDB、Lucide React；測試使用 Vitest 與 Playwright，Docker 部署使用 Nginx。

```text
src/
  App.tsx                      # 旅程管理與重播介面
  components/TerrainMap.tsx     # 底圖、3D 地形與視角跟隨
  components/ElevationChart.tsx # 海拔剖面與進度控制
  lib/gpx.ts                   # GPX 解析、統計與路徑插值
  lib/storage.ts               # IndexedDB 本機儲存
  lib/demo.ts                  # 示意旅程
tests/app.spec.ts              # 桌面與行動版 E2E 測試
Dockerfile                    # 多階段前端建置
compose.yaml                  # 原始碼建置與容器啟動
nginx.conf                    # 靜態網站服務設定
```
