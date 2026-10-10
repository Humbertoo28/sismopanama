// Detecta si la página se abrió dentro de otra aplicación (Instagram, TikTok, Facebook...). Esos navegadores integrados
// no permiten notificaciones push ni instalar la app: quien llega desde el enlace de un influencer se quedaría sin alertas
// sin saber por qué. Con esto la página le dice que la abra en Safari o Chrome.

export type InAppInfo = { app: string; platform: "ios" | "android" | "other" };

const APPS: [RegExp, string][] = [
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, "Facebook"],
  [/TikTok|musical_ly|BytedanceWebview/i, "TikTok"],
  [/Snapchat/i, "Snapchat"],
  [/LinkedInApp/i, "LinkedIn"],
  [/Pinterest/i, "Pinterest"],
  [/MicroMessenger/i, "WeChat"],
  [/\bLine\//i, "LINE"],
];

export function detectInAppBrowser(ua: string, standalone = false): InAppInfo | null {
  const platform = /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : "other";
  for (const [pattern, app] of APPS) if (pattern.test(ua)) return { app, platform };
  // Vista web genérica de otra app. En Android lleva "; wv)". En iPhone, Safari, Chrome, Firefox y Edge incluyen
  // "Safari/" y las vistas integradas no; la app instalada en la pantalla de inicio tampoco lo lleva, por eso se descarta.
  if (platform === "android" && /; wv\)/.test(ua)) return { app: "otra aplicación", platform };
  if (platform === "ios" && !standalone && /AppleWebKit/i.test(ua) && !/Safari\//i.test(ua)) return { app: "otra aplicación", platform };
  return null;
}
