import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import type { ControlOperation } from "../config/operationsMockData";
import { MAP_TILE_CONFIG } from "../utils/mapTileConfig";

interface ControlOperationsMapProps {
  operations: ControlOperation[];
  selectedOperationId: string | null;
  onSelect: (operation: ControlOperation) => void;
  sessionOperationIds?: string[];
}

const DEFAULT_CENTER: [number, number] = [37.979365, 127.649056];

function MapController({
  operations,
  selectedOperationId,
}: Pick<ControlOperationsMapProps, "operations" | "selectedOperationId">) {
  const map = useMap();

  useEffect(() => {
    const selected = operations.find((item) => item.id === selectedOperationId);
    const focus = selected ?? operations[0];

    if (focus) {
      map.setView([focus.latitude, focus.longitude], selected ? 16 : 13, {
        animate: true,
      });
    }
  }, [map, operations, selectedOperationId]);

  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize(false));
    observer.observe(container);
    const timeoutId = window.setTimeout(() => map.invalidateSize(false), 100);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeoutId);
    };
  }, [map]);

  return null;
}

function statusColor(status: ControlOperation["status"]) {
  if (status === "진행") return "#047857";
  if (status === "완료") return "#2563eb";
  return "#d97706";
}

export function ControlOperationsMap({
  operations,
  selectedOperationId,
  onSelect,
  sessionOperationIds = [],
}: ControlOperationsMapProps) {
  const sessionOperationIdSet = new Set(sessionOperationIds);
  const sessionLayerKey =
    [...sessionOperationIds].sort().join("|") || "empty";
  const selected = operations.find((item) => item.id === selectedOperationId);
  const initial = selected ?? operations[0];
  const center: [number, number] = initial
    ? [initial.latitude, initial.longitude]
    : DEFAULT_CENTER;

  return (
    <div className="relative h-[360px] w-full overflow-hidden bg-slate-100">
      <MapContainer
        key={`control-map-${sessionLayerKey}`}
        center={center}
        zoom={selected ? 16 : 13}
        scrollWheelZoom
        className="h-full w-full"
        style={{ height: "100%", width: "100%" }}
      >
        {/* 배경지도는 대시보드와 동일하게 VWorld를 쓴다(키가 없을 때만 OSM 폴백). */}
        <TileLayer
          attribution={MAP_TILE_CONFIG.base.attribution}
          url={MAP_TILE_CONFIG.base.url}
          maxZoom={19}
        />
        <MapController
          operations={operations}
          selectedOperationId={selectedOperationId}
        />

        {operations.map((operation) => {
          const isSelected = operation.id === selectedOperationId;
          const isSessionOperation = sessionOperationIdSet.has(operation.id);

          return (
            <CircleMarker
              key={operation.id}
              center={[operation.latitude, operation.longitude]}
              radius={isSelected ? 13 : 10}
              pathOptions={{
                color: isSessionOperation
                  ? isSelected
                    ? "#5b21b6"
                    : "#7c3aed"
                  : "#ffffff",
                weight: isSelected ? 4 : 3,
                fillColor: isSessionOperation
                  ? "#ede9fe"
                  : statusColor(operation.status),
                fillOpacity: 1,
              }}
              eventHandlers={{ click: () => onSelect(operation) }}
            >
              <Tooltip direction="top" offset={[0, -9]} opacity={1}>
                {isSessionOperation && <strong>이번 세션 배정 · </strong>}
                <strong>{operation.workerName}</strong> · {operation.progress}% 진행
              </Tooltip>
              <Popup>
                <div className="min-w-[230px] text-xs leading-5">
                  <strong>
                    {isSessionOperation ? "홈 지도 방제 배정" : operation.id} · {operation.method}
                  </strong><br />
                  위치: {operation.area}<br />
                  담당: {operation.workerName} ({operation.workerRole})<br />
                  업체: {operation.company}<br />
                  단계: {operation.currentStage}<br />
                  진행률: {operation.progress}% · {operation.status}<br />
                  차량: {operation.vehicle}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex gap-3 rounded-lg bg-slate-900/90 px-3 py-2 text-[9px] font-bold text-white shadow-lg">
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-600" /> 진행</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-500" /> 예정</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full border-2 border-violet-700 bg-violet-100" /> 이번 세션 방제 배정</span>
        <span>GPS SYNC · DEMO</span>
      </div>
    </div>
  );
}
