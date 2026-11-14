/**
 * @file resourcesData.js
 * @description NASA veri ve harici kaynaklarının, yasal uyarı metninin tanımlandığı veri modülü.
 */

(function (ns) {
  "use strict";
  const NASA_DISCLAIMER = {
    title: "NASA Official Disclaimer & Compliance Notice",
    text: "NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website."
  };

  const RESOURCES_DATA = [
    {
      id: "mars-trek",
      title: "Jet Propulsion Laboratory’s (JPL) Mars Trek",
      url: "https://trek.nasa.gov/mars/",
      tag: "Interactive 3D Portal",
      badgeColor: "mars-orange",
      description: "NASA web-based portal for exploration of Mars, showcases data collected by NASA at various landing sites.",
      actionText: "Mars Trek'i Aç",
      icon: "🪐"
    },
    {
      id: "usgs-geologic-maps",
      title: "USGS-NASA Planetary Geologic Mapping Program",
      url: "https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars",
      tag: "Geologic Mapping",
      badgeColor: "mars-red",
      description: "High-quality standardized geologic map of Mars offering detailed planetary stratigraphy and topography.",
      actionText: "Jeolojik Haritayı İncele",
      icon: "🗺️"
    },
    {
      id: "curiosity-route-visual",
      title: "Curiosity Rover Route Map: Lower Mount Sharp",
      url: "https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/",
      tag: "Route & Mission Visual",
      badgeColor: "mars-amber",
      description: "This animation shows a proposed route for NASA's Curiosity rover, which is climbing lower Mount Sharp on Mars. The annotated version of the map labels different regions that scientists working with the rover would like to explore in coming years.",
      actionText: "Rota Görselini İzle",
      icon: "🚜"
    },
    {
      id: "nasa-worldview",
      title: "NASA Worldview",
      url: "https://worldview.earthdata.nasa.gov/",
      tag: "Satellite Observation",
      badgeColor: "mars-blue",
      description: "Visually explore the past and the present of this dynamic planet from a satellite's perspective. Select from an array of stories below to learn more about Worldview (a part of NASA Earthdata), the satellite imagery we provide and events occurring around the world.",
      actionText: "NASA Worldview'e Git",
      icon: "🛰️"
    },
    {
      id: "perseverance-raw-images",
      title: "Mars Perseverance Raw Images Gallery",
      url: "https://mars.nasa.gov/mars2020/multimedia/raw-images/",
      tag: "Raw Image Archive",
      badgeColor: "mars-purple",
      description: "Over 1 million images captured by the rover on its journey across the Mars surface. Real-time planetary imagery directly from Jezero Crater.",
      actionText: "Görsel Galerisini Aç",
      icon: "📷"
    }
  ];

  ns.NASA_DISCLAIMER = NASA_DISCLAIMER;
  ns.RESOURCES_DATA = RESOURCES_DATA;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-4: Dosya başlığı ve amacını açıklayan JSDoc bloğu.
   - Satır 6-9: NASA_DISCLAIMER nesnesi; NASA'nın resmi çekince ve telif hakkı metnini tutar.
   - Satır 11: RESOURCES_DATA adında dışa aktarılan kaynak nesneleri dizisi başlangıcı.
   - Satır 12-20: JPL Mars Trek portalı nesnesi; URL, başlık, etiket, açıklama ve buton metni.
   - Satır 21-29: USGS-NASA Jeolojik Haritalama Programı nesnesi.
   - Satır 30-38: Curiosity Rover Mount Sharp rota haritası ve animasyonu görsel kaynağı nesnesi.
   - Satır 39-47: NASA Worldview uydu gözlem portalı kaynağı nesnesi.
   - Satır 48-56: Mars Perseverance 1M+ ham fotoğraf galerisi kaynağı nesnesi.
   - Satır 57: Kaynak dizisinin bitişi.
   ========================================================================== */
