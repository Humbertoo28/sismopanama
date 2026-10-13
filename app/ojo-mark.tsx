// Logo de Ojo Panamá: un ojo con ondas que salen de un epicentro rojo, sobre azul marino. Es el mismo dibujo que
// public/favicon.svg y los íconos de la app (las fuentes están en public/brand/).
export default function OjoMark() {
  return (
    <svg viewBox="0 0 512 512" focusable="false">
      <rect width="512" height="512" rx="112" fill="#0b2a5b" />
      <clipPath id="ojo-mark-eye"><path d="M56 256 Q256 56 456 256 Q256 456 56 256 Z" /></clipPath>
      <g clipPath="url(#ojo-mark-eye)" fill="none" stroke="#fff">
        <circle cx="256" cy="256" r="58" strokeWidth="16" />
        <circle cx="256" cy="256" r="100" strokeWidth="14" strokeOpacity=".6" />
        <circle cx="256" cy="256" r="142" strokeWidth="12" strokeOpacity=".32" />
      </g>
      <path d="M56 256 Q256 56 456 256 Q256 456 56 256 Z" fill="none" stroke="#fff" strokeWidth="24" strokeLinejoin="round" />
      <circle cx="256" cy="256" r="30" fill="#da121a" />
    </svg>
  );
}
