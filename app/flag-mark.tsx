// Bandera de Panamá: cuadrantes blanco con estrella azul, rojo, azul y blanco con estrella roja.
export default function FlagMark() {
  return (
    <svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice" focusable="false">
      <rect width="60" height="40" fill="#fff" />
      <rect x="30" width="30" height="20" fill="#da121a" />
      <rect y="20" width="30" height="20" fill="#072357" />
      <polygon points="15.00,3.40 16.48,7.96 21.28,7.96 17.40,10.78 18.88,15.34 15.00,12.52 11.12,15.34 12.60,10.78 8.72,7.96 13.52,7.96" fill="#072357" />
      <polygon points="45.00,23.40 46.48,27.96 51.28,27.96 47.40,30.78 48.88,35.34 45.00,32.52 41.12,35.34 42.60,30.78 38.72,27.96 43.52,27.96" fill="#da121a" />
    </svg>
  );
}
