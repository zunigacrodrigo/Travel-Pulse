/** Globo de alambre con meridianos que giran (ilusión 3D con SVG y CSS). Decorativo: no representa datos. */
export function GlobeHero({ size = 280, pin = false, className = "" }: { size?: number; pin?: boolean; className?: string }) {
  const meridians = [0, 1, 2, 3];
  return (
    <svg className={`tp-globe ${className}`} width={size} height={size} viewBox="0 0 200 200" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="tpg-glow" cx="50%" cy="50%" r="55%"><stop offset="0" stopColor="#46d4f2" stopOpacity=".22" /><stop offset="1" stopColor="#46d4f2" stopOpacity="0" /></radialGradient>
        <radialGradient id="tpg-sphere" cx="36%" cy="30%" r="80%"><stop offset="0" stopColor="#173a58" /><stop offset=".6" stopColor="#0a1426" /><stop offset="1" stopColor="#070c18" /></radialGradient>
      </defs>
      <circle cx="100" cy="100" r="99" fill="url(#tpg-glow)" />
      <circle cx="100" cy="100" r="84" fill="url(#tpg-sphere)" stroke="#46d4f2" strokeOpacity=".6" strokeWidth=".9" />
      <g stroke="#46d4f2" strokeWidth=".5" strokeOpacity=".32">
        <ellipse cx="100" cy="100" rx="84" ry="16" />
        <ellipse cx="100" cy="62" rx="73" ry="13" />
        <ellipse cx="100" cy="138" rx="73" ry="13" />
        <ellipse cx="100" cy="35" rx="48" ry="8" />
        <ellipse cx="100" cy="165" rx="48" ry="8" />
      </g>
      <g stroke="#46d4f2" strokeWidth=".6" strokeOpacity=".5">
        {meridians.map((i) => <ellipse key={i} className="tp-mer" style={{ animationDelay: `${-i * 2.5}s`, ["--s" as string]: String(0.18 + i * 0.27) }} cx="100" cy="100" rx="84" ry="84" />)}
        <path d="M100 16V184" strokeOpacity=".35" />
      </g>
      <path className="tp-arc" d="M44 126Q92 38 150 76" stroke="#46d4f2" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="6 7" />
      <circle cx="150" cy="76" r="3.4" fill="#46d4f2" />
      {pin && (<g>
        <circle className="tp-ring" cx="100" cy="100" r="6" stroke="#46d4f2" strokeWidth="1" />
        <circle className="tp-ring" style={{ animationDelay: "-1.2s" }} cx="100" cy="100" r="6" stroke="#46d4f2" strokeWidth="1" />
        <circle cx="100" cy="100" r="4.2" fill="#46d4f2" stroke="#070c18" strokeWidth="1.4" />
      </g>)}
    </svg>
  );
}
