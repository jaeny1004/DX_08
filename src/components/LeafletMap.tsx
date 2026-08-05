import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { CrowdReport } from "../types";
import type { FieldWorkerMarker } from "../config/operationsMockData";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface LeafletMapProps {
  records: CrowdReport[];
  selectedRecordId?: string;
  onMarkerClick: (record: CrowdReport) => void;
  workers?: FieldWorkerMarker[];
  selectedWorkerId?: string | null;
  onWorkerClick?: (worker: FieldWorkerMarker) => void;
}

type ValidCoordinateReport = CrowdReport & {
  latitude: number;
  longitude: number;
};

const DEFAULT_CENTER: [number, number] = [37.979365, 127.649056];

function hasValidCoordinates(
  record: CrowdReport,
): record is ValidCoordinateReport {
  return (
    typeof record.latitude === "number" &&
    Number.isFinite(record.latitude) &&
    typeof record.longitude === "number" &&
    Number.isFinite(record.longitude)
  );
}

function MapAutoCenter({
  records,
  workers,
  selectedRecordId,
  selectedWorkerId,
}: {
  records: ValidCoordinateReport[];
  workers: FieldWorkerMarker[];
  selectedRecordId?: string;
  selectedWorkerId?: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    const selectedReport = records.find(
      (record) => String(record.id) === String(selectedRecordId),
    );
    const selectedWorker = workers.find(
      (worker) => worker.id === selectedWorkerId,
    );
    const focus = selectedReport ?? selectedWorker ?? records[0] ?? workers[0];

    if (focus) {
      map.setView([focus.latitude, focus.longitude], selectedReport || selectedWorker ? 16 : 13, {
        animate: true,
      });
    }
  }, [map, records, selectedRecordId, selectedWorkerId, workers]);

  return null;
}

function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const resizeObserver = new ResizeObserver(() => map.invalidateSize(false));
    resizeObserver.observe(container);

    const timeoutId = window.setTimeout(() => map.invalidateSize(false), 100);

    return () => {
      resizeObserver.disconnect();
      window.clearTimeout(timeoutId);
    };
  }, [map]);

  return null;
}

function getWorkerColor(status: FieldWorkerMarker["status"]) {
  if (status === "출동") return "#047857";
  if (status === "복귀") return "#d97706";
  return "#64748b";
}

export function LeafletMap({
  records,
  selectedRecordId,
  onMarkerClick,
  workers = [],
  selectedWorkerId,
  onWorkerClick,
}: LeafletMapProps) {
  const validRecords = records.filter(hasValidCoordinates);
  const selectedRecord = validRecords.find(
    (record) => String(record.id) === String(selectedRecordId),
  );
  const selectedWorker = workers.find((worker) => worker.id === selectedWorkerId);
  const initialRecord = selectedRecord ?? selectedWorker ?? validRecords[0] ?? workers[0];
  const center: [number, number] = initialRecord
    ? [initialRecord.latitude, initialRecord.longitude]
    : DEFAULT_CENTER;

  return (
    <div className="relative z-0 h-full w-full overflow-hidden bg-slate-100">
      <MapContainer
        center={center}
        zoom={selectedRecord || selectedWorker ? 16 : 13}
        scrollWheelZoom
        className="z-0 h-full w-full"
        style={{ width: "100%", height: "100%", minHeight: "360px" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapResizeHandler />
        <MapAutoCenter
          records={validRecords}
          workers={workers}
          selectedRecordId={selectedRecordId}
          selectedWorkerId={selectedWorkerId}
        />

        {validRecords.map((record) => (
          <Marker
            key={record.id}
            position={[record.latitude, record.longitude]}
            eventHandlers={{ click: () => onMarkerClick(record) }}
          >
            <Popup>
              <div className="min-w-[180px] text-xs leading-5">
                <strong>시민 제보 #{record.id}</strong><br />
                제보자: {record.reporter || record.phone_number || "미확인"}<br />
                상태: {record.status}<br />
                위도: {record.latitude.toFixed(6)}<br />
                경도: {record.longitude.toFixed(6)}
              </div>
            </Popup>
          </Marker>
        ))}

        {workers.map((worker) => {
          const selected = worker.id === selectedWorkerId;
          const color = getWorkerColor(worker.status);

          return (
            <CircleMarker
              key={worker.id}
              center={[worker.latitude, worker.longitude]}
              radius={selected ? 12 : 9}
              pathOptions={{
                color: "#ffffff",
                weight: selected ? 4 : 3,
                fillColor: color,
                fillOpacity: 1,
              }}
              eventHandlers={{ click: () => onWorkerClick?.(worker) }}
            >
              <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                <strong>{worker.name}</strong> · {worker.status}
              </Tooltip>
              <Popup>
                <div className="min-w-[210px] text-xs leading-5">
                  <strong>{worker.name} ({worker.id})</strong><br />
                  소속: {worker.team}<br />
                  업무: {worker.assignment}<br />
                  상태: {worker.status} · 진행 {worker.progress}%<br />
                  단말 배터리: {worker.battery}%<br />
                  위치 갱신: {worker.updatedAt}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex gap-2 rounded-lg bg-white/95 px-3 py-2 text-[10px] font-bold text-slate-600 shadow">
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-blue-500" /> 시민 제보</span>
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-emerald-700" /> 출동 요원</span>
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-amber-600" /> 복귀 중</span>
      </div>
    </div>
  );
}
