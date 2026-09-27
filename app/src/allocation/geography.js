const EURO_AREA = new Set([
  "Allemagne", "Autriche", "Belgique", "Bulgarie", "Chypre", "Croatie", "Espagne", "Estonie",
  "Finlande", "France", "Grèce", "Irlande", "Italie", "Lettonie", "Lituanie", "Luxembourg",
  "Malte", "Pays-Bas", "Portugal", "Slovaquie", "Slovénie",
]);
const EUROPE_OUTSIDE_EURO = new Set([
  "Danemark", "Hongrie", "Islande", "Norvège", "Pologne", "République tchèque", "Roumanie",
  "Royaume-Uni", "Suède", "Suisse",
]);
const EAST_ASIA = new Set(["Chine", "Corée du Sud", "Hong Kong", "Taïwan"]);
const SOUTH_SOUTHEAST_ASIA = new Set(["Inde", "Indonésie", "Malaisie", "Singapour", "Thaïlande"]);
const AMERICAS_OUTSIDE_US = new Set(["Brésil", "Canada", "Chili", "Colombie", "Mexique", "Pérou"]);
const AFRICA_MIDDLE_EAST = new Set(["Afrique du Sud", "Arabie saoudite", "Égypte", "Émirats arabes unis", "Éthiopie", "Iran", "Koweït", "Qatar"]);

export function geographicZone(name) {
  if (name === "Composition indisponible") return name;
  if (name === "Non alloué") return "Non alloué";
  if (name === "Autres pays") return "Pays non détaillés";
  if (name === "États-Unis") return "États-Unis";
  if (EURO_AREA.has(name)) return "Zone euro";
  if (EUROPE_OUTSIDE_EURO.has(name)) return "Europe hors zone euro";
  if (name === "Japon") return "Japon";
  if (EAST_ASIA.has(name)) return "Asie de l'Est hors Japon";
  if (SOUTH_SOUTHEAST_ASIA.has(name)) return "Asie du Sud et du Sud-Est";
  if (AMERICAS_OUTSIDE_US.has(name)) return "Amériques hors États-Unis";
  if (AFRICA_MIDDLE_EAST.has(name)) return "Afrique et Moyen-Orient";
  if (name === "Australie") return "Océanie";
  return "Pays non classés";
}

