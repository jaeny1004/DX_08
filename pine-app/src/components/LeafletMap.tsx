import { useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { PineRecord } from '../types';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface LeafletMapProps {
  records: PineRecord[];
  onMarkerClick: (record: PineRecord) => void;
  focusRecordId?: string | null;
}

const DEFAULT_CENTER: [number, number] = [
  37.979365,
  127.649056,
];

function MapAutoCenter({
  records,
  focusRecordId,
}: {
  records: PineRecord[];
  focusRecordId?: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    const focusedRecord = focusRecordId
      ? records.find(
          record => record.id === focusRecordId
        )
      : null;

    if (
      focusedRecord &&
      Number.isFinite(focusedRecord.latitude) &&
      Number.isFinite(focusedRecord.longitude)
    ) {
      map.flyTo(
        [
          focusedRecord.latitude,
          focusedRecord.longitude,
        ],
        16,
        {
          duration: 0.7,
        }
      );

      return;
    }

    const firstValidRecord = records.find(
      record =>
        Number.isFinite(record.latitude) &&
        Number.isFinite(record.longitude)
    );

    if (firstValidRecord) {
      map.setView(
        [
          firstValidRecord.latitude,
          firstValidRecord.longitude,
        ],
        13
      );
    }
  }, [records, focusRecordId, map]);

  return null;
}

export function LeafletMap({
  records,
  onMarkerClick,
  focusRecordId,
}: LeafletMapProps) {
  const validRecords = records.filter(
    record =>
      Number.isFinite(record.latitude) &&
      Number.isFinite(record.longitude)
  );

  const focusedRecord = focusRecordId
    ? validRecords.find(
        record => record.id === focusRecordId
      )
    : null;

  const firstValidRecord =
    focusedRecord ?? validRecords[0];

  const center: [number, number] =
    firstValidRecord
      ? [
          firstValidRecord.latitude,
          firstValidRecord.longitude,
        ]
      : DEFAULT_CENTER;

  return (
    <div className="relative z-0 w-full h-full rounded-[24px] overflow-hidden bg-system-bg border border-[rgba(0,0,0,0.06)]">
      <MapContainer
        center={center}
        zoom={focusedRecord ? 16 : 13}
        scrollWheelZoom
        className="w-full h-full z-0"
        style={{
          width: '100%',
          height: '100%',
          minHeight: '280px',
        }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapAutoCenter
          records={validRecords}
          focusRecordId={focusRecordId}
        />

        {validRecords.map(record => (
          <Marker
            key={record.id}
            position={[
              record.latitude,
              record.longitude,
            ]}
            eventHandlers={{
              click: () => onMarkerClick(record),
            }}
          >
            <Popup>
              <div>
                <strong>의심목 신고건</strong>
                <br />
                {record.phone_number}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}