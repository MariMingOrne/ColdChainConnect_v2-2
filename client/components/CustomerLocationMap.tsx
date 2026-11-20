import { MapContainer, Marker, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { pinIcon } from "@/components/CustomerLocationPicker";

interface CustomerLocationMapProps {
  latitude: number | string | null | undefined;
  longitude: number | string | null | undefined;
}

export function CustomerLocationMap({ latitude, longitude }: CustomerLocationMapProps) {
  const lat = latitude == null ? NaN : Number(latitude);
  const lng = longitude == null ? NaN : Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-muted text-sm text-muted-foreground">
        No map location pinned for this customer.
      </div>
    );
  }

  const position: [number, number] = [lat, lng];

  return (
    <MapContainer
      center={position}
      zoom={16}
      scrollWheelZoom={false}
      style={{ height: 256, width: "100%" }}
      className="w-full rounded-lg border border-border"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={position} icon={pinIcon} />
    </MapContainer>
  );
}
