import { Suspense } from "react";
import { CityPulseView } from "@/components/screens/CityPulseView";

export const metadata = { title: "City Pulse · Travel Pulse", description: "Clima, mapa, lugares y señales recientes de una ciudad, con fuente y fecha." };

export default function CiudadPage() {
  return (
    <>
      <Suspense fallback={null}><CityPulseView /></Suspense>
    </>
  );
}
