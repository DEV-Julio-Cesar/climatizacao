import React, { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { temCoordenadas } from "./clientesUtils";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:"https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:"https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:"https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export function LocationPicker({ form, setForm }) {
  const position = temCoordenadas(form) ? [Number(form.latitude), Number(form.longitude)] : [-14.235, -51.9253];
  const zoom = temCoordenadas(form) ? 16 : 4;
  return <div className="address-map"><MapContainer center={position} zoom={zoom} scrollWheelZoom>
    <TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <MapSync position={position} zoom={zoom} />
    <MapClick onChange={(latitude, longitude) => setForm(atual => ({ ...atual, latitude, longitude }))} />
    {temCoordenadas(form) && <Marker position={position} />}
  </MapContainer></div>;
}

function MapSync({ position, zoom }) {
  const map = useMap();
  useEffect(() => { map.setView(position, zoom); }, [map, position, zoom]);
  return null;
}

function MapClick({ onChange }) {
  useMapEvents({ click: evento => onChange(Number(evento.latlng.lat.toFixed(7)), Number(evento.latlng.lng.toFixed(7))) });
  return null;
}

export function Modal({ title, close, children, wide }) {
  return <div className="modal-backdrop" onMouseDown={evento => evento.target === evento.currentTarget && close()}>
    <section className={`form-modal ${wide ? "client-form-modal" : ""}`}><div className="modal-title"><h2>{title}</h2><button onClick={close}>×</button></div>{children}</section>
  </div>;
}

export function Field({ label, name, form, set, type="text", valueFormatter, ...rest }) {
  return <div><label>{label}</label><input {...rest} type={type} value={valueFormatter ? valueFormatter(form[name]) : (form[name] ?? "")}
    onChange={evento => set({ ...form, [name]: valueFormatter ? valueFormatter(evento.target.value) : evento.target.value })} /></div>;
}

export function Actions({ close, saving }) {
  return <div className="modal-actions"><button type="button" onClick={close}>Cancelar</button><button className="primary" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button></div>;
}
