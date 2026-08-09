import { useEffect, useState } from "react";
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
import type { DispatchAssignment } from "../types/dispatch";
import {
  formatGridLocation,
  loadGridLookup,
} from "../utils/gridLookup";

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
  assignments?: DispatchAssignment[];
  selectedAssignmentId?: string | null;
  onAssignmentClick?: (assignment: DispatchAssignment) => void;
}

type ValidCoordinateReport = CrowdReport & {
  latitude: number;
  longitude: number;
};

type ValidCoordinateAssignment =
  DispatchAssignment & {
    targetLatitude: number;
    targetLongitude: number;
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

function hasValidAssignmentCoordinates(
  assignment: DispatchAssignment,
): assignment is ValidCoordinateAssignment {
  return (
    typeof assignment.targetLatitude === "number" &&
    Number.isFinite(assignment.targetLatitude) &&
    typeof assignment.targetLongitude === "number" &&
    Number.isFinite(assignment.targetLongitude)
  );
}

function MapAutoCenter({
  records,
  workers,
  selectedRecordId,
  selectedWorkerId,
  assignments,
  selectedAssignmentId,
}: {
  records: ValidCoordinateReport[];
  workers: FieldWorkerMarker[];
  assignments: ValidCoordinateAssignment[];
  selectedRecordId?: string;
  selectedWorkerId?: string | null;
  selectedAssignmentId?: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    const selectedReport = records.find(
      (record) => String(record.id) === String(selectedRecordId),
    );
    const selectedWorker = workers.find(
      (worker) => worker.id === selectedWorkerId,
    );
    const selectedAssignment = assignments.find(
      (assignment) =>
        assignment.assignmentId === selectedAssignmentId,
    );

    if (selectedAssignment) {
      map.setView(
        [
          selectedAssignment.targetLatitude,
          selectedAssignment.targetLongitude,
        ],
        16,
        { animate: true },
      );
      return;
    }

    const focus = selectedReport ?? selectedWorker ?? records[0] ?? workers[0];

    if (focus) {
      map.setView([focus.latitude, focus.longitude], selectedReport || selectedWorker ? 16 : 13, {
        animate: true,
      });
    }
  }, [
    assignments,
    map,
    records,
    selectedAssignmentId,
    selectedRecordId,
    selectedWorkerId,
    workers,
  ]);

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
  assignments = [],
  selectedAssignmentId,
  onAssignmentClick,
}: LeafletMapProps) {
  // 팝업에 좌표 대신 행정동·격자ID를 쓰므로 룩업을 미리 받아 둔다.
  const [, setGridLookupReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadGridLookup().then((data) => {
      if (!cancelled && data) setGridLookupReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const validRecords = records.filter(hasValidCoordinates);
  const validAssignments = assignments.filter(
    hasValidAssignmentCoordinates,
  );
  const assignmentLayerKey =
    validAssignments
      .map((assignment) => assignment.assignmentId)
      .sort()
      .join("|") || "empty";
  const selectedRecord = validRecords.find(
    (record) => String(record.id) === String(selectedRecordId),
  );
  const selectedWorker = workers.find((worker) => worker.id === selectedWorkerId);
  const selectedAssignment = validAssignments.find(
    (assignment) =>
      assignment.assignmentId === selectedAssignmentId,
  );
  const initialRecord = selectedRecord ?? selectedWorker ?? validRecords[0] ?? workers[0];
  const center: [number, number] = selectedAssignment
    ? [
        selectedAssignment.targetLatitude,
        selectedAssignment.targetLongitude,
      ]
    : initialRecord
      ? [initialRecord.latitude, initialRecord.longitude]
      : DEFAULT_CENTER;

  return (
    <div className="relative z-0 h-full w-full overflow-hidden bg-slate-100">
      <MapContainer
        key={`field-map-${assignmentLayerKey}`}
        center={center}
        zoom={selectedRecord || selectedWorker || selectedAssignment ? 16 : 13}
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
          assignments={validAssignments}
          selectedRecordId={selectedRecordId}
          selectedWorkerId={selectedWorkerId}
          selectedAssignmentId={selectedAssignmentId}
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
                위치: {formatGridLocation(record.latitude, record.longitude)}
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

        {validAssignments.map((assignment) => {
          const selected =
            assignment.assignmentId === selectedAssignmentId;

          return (
            <CircleMarker
              key={assignment.assignmentId}
              center={[
                assignment.targetLatitude,
                assignment.targetLongitude,
              ]}
              radius={selected ? 13 : 10}
              pathOptions={{
                color: selected ? "#5b21b6" : "#7c3aed",
                weight: selected ? 5 : 4,
                fillColor: "#ede9fe",
                fillOpacity: 0.9,
              }}
              eventHandlers={{
                click: () => onAssignmentClick?.(assignment),
              }}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                <strong>이번 세션 배정 · GRID-{assignment.gridId}</strong> · {assignment.workerName}
              </Tooltip>
              <Popup>
                <div className="min-w-[210px] text-xs leading-5">
                  <strong>GRID-{assignment.gridId} 예찰 배정</strong><br />
                  담당 요원: {assignment.workerName}<br />
                  상태: {assignment.status}<br />
                  위치:{" "}
                  {formatGridLocation(
                    assignment.targetLatitude,
                    assignment.targetLongitude,
                    assignment.targetEmdName,
                  )}
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
        <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full border-2 border-violet-700 bg-violet-100" /> 이번 세션 예찰 배정</span>
      </div>
    </div>
  );
}
