import { ImageResponse } from "next/og";

export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }];
}

/** Icono PNG de la app (192 y 512 px) para instalación como PWA y ícono de iOS. */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const px = size === "512" ? 512 : 192;
  const tileW = px * 0.32;
  const tileH = px * 0.47;
  const tile = {
    width: tileW,
    height: tileH,
    background: "#1A2B43",
    borderRadius: px * 0.043,
    color: "#46d4f2",
    fontSize: px * 0.37,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as const;
  return new ImageResponse(
    (
      <div
        style={{
          width: px,
          height: px,
          background: "#0B1626",
          borderRadius: px * 0.22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: px * 0.035,
        }}
      >
        <div style={tile}>T</div>
        <div style={tile}>P</div>
      </div>
    ),
    { width: px, height: px },
  );
}
