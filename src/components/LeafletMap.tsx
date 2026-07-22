import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { CrowdReport } from "../types";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface LeafletMapProps {
  records: CrowdReport[];
  selectedRecordId?: string;

  onMarkerClick: (
    record: CrowdReport
  ) => void;
}

type ValidCoordinateReport =
  CrowdReport & {
    latitude: number;
    longitude: number;
  };

const DEFAULT_CENTER: [number, number] = [
  37.979365,
  127.649056,
];

function hasValidCoordinates(
  record: CrowdReport
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
  selectedRecordId,
}: {
  records: ValidCoordinateReport[];
  selectedRecordId?: string;
}) {
  const map = useMap();

  useEffect(() => {
    const selectedRecord =
      records.find(
        record =>
          record.id === selectedRecordId
      );

    if (selectedRecord) {
      map.setView(
        [
          selectedRecord.latitude,
          selectedRecord.longitude,
        ],
        16,
        {
          animate: true,
        }
      );

      return;
    }

    const firstRecord = records[0];

    if (firstRecord) {
      map.setView(
        [
          firstRecord.latitude,
          firstRecord.longitude,
        ],
        13
      );
    }
  }, [
    records,
    selectedRecordId,
    map,
  ]);

  return null;
}

function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();

    const resizeObserver =
      new ResizeObserver(() => {
        map.invalidateSize(false);
      });

    resizeObserver.observe(container);

    const timeoutId =
      window.setTimeout(() => {
        map.invalidateSize(false);
      }, 100);

    return () => {
      resizeObserver.disconnect();
      window.clearTimeout(timeoutId);
    };
  }, [map]);

  return null;
}

export function LeafletMap({
  records,
  selectedRecordId,
  onMarkerClick,
}: LeafletMapProps) {
  const validRecords =
    records.filter(
      hasValidCoordinates
    );

  const selectedRecord =
    validRecords.find(
      record =>
        record.id === selectedRecordId
    );

  const initialRecord =
    selectedRecord ??
    validRecords[0];

  const center: [number, number] =
    initialRecord
      ? [
        initialRecord.latitude,
        initialRecord.longitude,
      ]
      : DEFAULT_CENTER;

  return (
    <div className="relative z-0 h-full w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      <MapContainer
        center={center}
        zoom={
          selectedRecord
            ? 16
            : 13
        }
        scrollWheelZoom
        className="z-0 h-full w-full"
        style={{
          width: "100%",
          height: "100%",
          minHeight: "360px",
        }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapResizeHandler />

        <MapAutoCenter
          records={validRecords}
          selectedRecordId={selectedRecordId}
        />

        <MapAutoCenter
          records={validRecords}
          selectedRecordId={
            selectedRecordId
          }
        />

        {validRecords.map(record => (
          <Marker
            key={record.id}
            position={[
              record.latitude,
              record.longitude,
            ]}
            eventHandlers={{
              click: () => {
                onMarkerClick(record);
              },
            }}
          >
            <Popup>
              <div>
                <strong>
                  시민 제보 #{record.id}
                </strong>

                <br />

                제보자:{" "}
                {record.reporter ||
                  record.phone_number ||
                  "미확인"}

                <br />

                상태: {record.status}

                <br />

                위도:{" "}
                {record.latitude.toFixed(6)}

                <br />

                경도:{" "}
                {record.longitude.toFixed(6)}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}