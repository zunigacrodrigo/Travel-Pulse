// Servidor falso con la MISMA forma que GOV.UK y USGS (ver src/lib/sources/*.ts).
// Sirve para probar la integración de extremo a extremo sin salida a internet.
// Uso: node qa/mock-sources.js 4010
const http = require("node:http");
const port = Number(process.argv[2] || 4010);
const now = Date.now();
const statusBySlug = {
  peru: ["avoid_all_but_essential_travel_to_parts"],
  colombia: ["avoid_all_travel_to_parts", "avoid_all_but_essential_travel_to_parts"],
  venezuela: ["avoid_all_travel_to_whole_country"],
};
const quake = (id, mag, lon, lat, ago, place) => ({
  type: "Feature", id,
  properties: { mag, place, time: now - ago * 3600_000, url: "https://earthquake.usgs.gov/" + id, tsunami: 0 },
  geometry: { type: "Point", coordinates: [lon, lat, 40] },
});
http.createServer((req, res) => {
  const send = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  const m = /^\/api\/content\/foreign-travel-advice\/([a-z-]+)$/.exec(req.url);
  if (m) {
    if (m[1] === "chile") return send(500, { error: "simulado" });
    return send(200, { public_updated_at: "2026-10-20T10:00:00Z", details: { alert_status: statusBySlug[m[1]] || [], country: { slug: m[1] } } });
  }
  if (req.url.startsWith("/earthquakes/feed/v1.0/summary/")) {
    return send(200, { type: "FeatureCollection", metadata: { status: 200 }, features: [
      quake("us-cusco-1", 6.1, -72.2, -13.9, 30, "35 km SW of Cusco, Peru"),
      quake("us-jp-1", 6.8, 142.1, 38.3, 50, "80 km E of Sendai, Japan"),
      quake("us-weak", 4.7, -71.9, -13.4, 70, "20 km N of Cusco, Peru"),
    ] });
  }
  send(404, { error: "no existe" });
}).listen(port, "127.0.0.1", () => console.log("mock listo en " + port));
