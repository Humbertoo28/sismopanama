import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../lib/site";

// Datos estructurados (schema.org) para que Google entienda qué es el sitio. Solo describen lo que el sitio es y hace:
// sin valoraciones, sin preguntas frecuentes ni nada que la página no muestre de verdad.
export function jsonLd(data: object) {
  // El "<" se escapa para que ningún texto pueda cerrar la etiqueta <script>.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function SiteStructuredData() {
  return jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        alternateName: ["Sismo Panamá", "OjoPanama", "ojopanama.com"],
        description: SITE_DESCRIPTION,
        inLanguage: "es-PA",
        sameAs: ["https://www.instagram.com/ojopanama507"],
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/icon-512.png`,
        sameAs: ["https://www.instagram.com/ojopanama507"],
        description: "Plataforma de monitoreo y alertas sísmicas en tiempo real para la República de Panamá.",
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_URL}/#app`,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Web, Android, iOS",
        inLanguage: "es-PA",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        areaServed: { "@type": "Country", name: "Panamá" },
        sameAs: ["https://www.instagram.com/ojopanama507"],
        featureList: [
          "Mapa de sismos y réplicas en Panamá en vivo",
          "Avisos instantáneos al celular de sismos nuevos",
          "Contraste de agencias: IGC-UP, USGS y EMSC",
          "Gráficos de actividad, magnitud y profundidad",
          "Guía de preparación y seguridad ante sismos",
        ],
        isPartOf: { "@id": `${SITE_URL}/#website` },
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: [
          {
            "@type": "Question",
            name: "¿Dónde ver los sismos y temblores en Panamá en tiempo real?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "En Ojo Panamá (ojopanama.com), la plataforma cívica de monitoreo que contrasta en vivo los reportes de la Red Sísmica Nacional del Instituto de Geociencias (UP), el USGS de Estados Unidos y el EMSC de Europa.",
            },
          },
          {
            "@type": "Question",
            name: "¿Cómo activar alertas de temblor en el celular en Panamá?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Entrando a ojopanama.com desde tu navegador en Android o iPhone y tocando el botón 'Activar alertas'. Las notificaciones son gratuitas y llegan directamente a la pantalla de tu celular.",
            },
          },
          {
            "@type": "Question",
            name: "¿Qué fuentes oficiales utiliza Ojo Panamá?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Ojo Panamá integra simultáneamente al Instituto de Geociencias de la Universidad de Panamá (IGC-UP), el Servicio Geológico de EE. UU. (USGS), el Centro Sismológico Euromediterráneo (EMSC) y GFZ GEOFON de Alemania.",
            },
          },
        ],
      },
    ],
  });
}

export function BreadcrumbStructuredData({ trail }: { trail: { name: string; path: string }[] }) {
  return jsonLd({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: `${SITE_URL}${item.path}` })),
  });
}
