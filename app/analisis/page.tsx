import type { Metadata } from "next";
import Dashboard from "./dashboard";
import "./analisis.css";

export const metadata: Metadata = {
  title: "Sismos registrados — Sismo Panamá",
  description: "Gráficos interactivos de los sismos y réplicas registrados en Panamá por USGS, IGC y EMSC, en vivo.",
};

export default function AnalisisPage() {
  return <Dashboard />;
}
