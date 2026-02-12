import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const PROPERTY_TYPES = ["casa", "apartamento", "kitnet", "terreno", "loja"];

const SUPABASE_URL = window.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "";
const STORAGE_BUCKET = window.SUPABASE_STORAGE_BUCKET || "property-images";

const HAS_SUPABASE_CONFIG =
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY) &&
  !SUPABASE_URL.includes("YOUR_") &&
  !SUPABASE_ANON_KEY.includes("YOUR_");

const supabase = HAS_SUPABASE_CONFIG
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const elements = {
  globalStatus: document.querySelector("#global-status"),
  resultsCount: document.querySelector("#results-count"),
  emptyCatalog: document.querySelector("#empty-catalog"),
  propertyGrid: document.querySelector("#property-grid"),
  propertyTemplate: document.querySelector("#property-card-template"),
  minPrice: document.querySelector("#min-price"),
  maxPrice: document.querySelector("#max-price"),
  typeFilters: document.querySelector("#type-filters"),
  neighborhoodFilters: document.querySelector("#neighborhood-filters"),
  bedroomFilters: document.querySelector("#bedroom-filters"),
  clearFiltersButton: document.querySelector("#clear-filters"),
};

const state = {
  properties: [],
  filteredProperties: [],
  filters: {
    minPrice: null,
    maxPrice: null,
    types: new Set(),
    neighborhoods: new Set(),
    bedrooms: new Set(),
  },
};

init().catch((error) => {
  showStatus(elements.globalStatus, error.message, "error");
});

async function init() {
  renderTypeFilters();
  bindEvents();

  if (!HAS_SUPABASE_CONFIG) {
    showStatus(
      elements.globalStatus,
      "Configure o Supabase em supabase-config.js para carregar seu catalogo.",
      "warning",
    );
    renderCatalog([]);
    return;
  }

  showStatus(elements.globalStatus, "Carregando imoveis...", "info");
  await loadProperties();
  hideStatus(elements.globalStatus);
}

function bindEvents() {
  elements.minPrice.addEventListener("input", handleFilterChange);
  elements.maxPrice.addEventListener("input", handleFilterChange);
  elements.typeFilters.addEventListener("change", handleFilterChange);
  elements.neighborhoodFilters.addEventListener("change", handleFilterChange);
  elements.bedroomFilters.addEventListener("change", handleFilterChange);
  elements.clearFiltersButton.addEventListener("click", clearFilters);
}

function renderTypeFilters() {
  elements.typeFilters.innerHTML = PROPERTY_TYPES.map((type) => {
    return `
      <label class="checkbox-item">
        <input type="checkbox" value="${type}" data-filter-group="types">
        <span>${capitalize(type)}</span>
      </label>
    `;
  }).join("");
}

async function loadProperties() {
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao carregar imoveis: ${error.message}`);
  }

  state.properties = (data || []).map(normalizeProperty);
  renderNeighborhoodFilters();
  renderBedroomFilters();
  applyFilters();
}

function renderNeighborhoodFilters() {
  const values = uniqueSorted(
    state.properties.map((property) => property.neighborhood).filter(Boolean),
  );

  state.filters.neighborhoods = new Set(
    [...state.filters.neighborhoods].filter((value) => values.includes(value)),
  );

  if (values.length === 0) {
    elements.neighborhoodFilters.innerHTML =
      '<span class="muted">Sem bairros cadastrados.</span>';
    return;
  }

  elements.neighborhoodFilters.innerHTML = values
    .map((value) => {
      const checked = state.filters.neighborhoods.has(value) ? "checked" : "";
      return `
        <label class="checkbox-item">
          <input type="checkbox" value="${escapeHtml(value)}" data-filter-group="neighborhoods" ${checked}>
          <span>${escapeHtml(value)}</span>
        </label>
      `;
    })
    .join("");
}

function renderBedroomFilters() {
  const values = uniqueSorted(
    state.properties.map((property) => String(property.bedrooms)).filter(Boolean),
    true,
  );

  state.filters.bedrooms = new Set(
    [...state.filters.bedrooms].filter((value) => values.includes(value)),
  );

  if (values.length === 0) {
    elements.bedroomFilters.innerHTML =
      '<span class="muted">Sem dados de quartos.</span>';
    return;
  }

  elements.bedroomFilters.innerHTML = values
    .map((value) => {
      const checked = state.filters.bedrooms.has(value) ? "checked" : "";
      return `
        <label class="checkbox-item">
          <input type="checkbox" value="${value}" data-filter-group="bedrooms" ${checked}>
          <span>${value} quarto(s)</span>
        </label>
      `;
    })
    .join("");
}

function handleFilterChange() {
  syncFilterStateFromUi();
  applyFilters();
}

function syncFilterStateFromUi() {
  state.filters.minPrice = parseOptionalNumber(elements.minPrice.value);
  state.filters.maxPrice = parseOptionalNumber(elements.maxPrice.value);
  state.filters.types = getCheckedValuesAsSet(elements.typeFilters);
  state.filters.neighborhoods = getCheckedValuesAsSet(elements.neighborhoodFilters);
  state.filters.bedrooms = getCheckedValuesAsSet(elements.bedroomFilters);
}

function clearFilters() {
  elements.minPrice.value = "";
  elements.maxPrice.value = "";

  for (const checkbox of document.querySelectorAll('input[type="checkbox"][data-filter-group]')) {
    checkbox.checked = false;
  }

  state.filters = {
    minPrice: null,
    maxPrice: null,
    types: new Set(),
    neighborhoods: new Set(),
    bedrooms: new Set(),
  };

  applyFilters();
}

function applyFilters() {
  const { minPrice, maxPrice, types, neighborhoods, bedrooms } = state.filters;

  const filtered = state.properties.filter((property) => {
    if (minPrice !== null && property.price < minPrice) return false;
    if (maxPrice !== null && property.price > maxPrice) return false;
    if (types.size > 0 && !types.has(property.type)) return false;
    if (neighborhoods.size > 0 && !neighborhoods.has(property.neighborhood)) return false;
    if (bedrooms.size > 0 && !bedrooms.has(String(property.bedrooms))) return false;
    return true;
  });

  state.filteredProperties = filtered;
  renderCatalog(filtered);
}

function renderCatalog(properties) {
  elements.resultsCount.textContent = `${properties.length} resultado(s)`;
  elements.propertyGrid.innerHTML = "";

  if (properties.length === 0) {
    elements.emptyCatalog.classList.remove("hidden");
    return;
  }

  elements.emptyCatalog.classList.add("hidden");

  properties.forEach((property, index) => {
    const node = elements.propertyTemplate.content.cloneNode(true);
    const card = node.querySelector(".property-card");
    card.style.animationDelay = `${Math.min(index * 45, 280)}ms`;

    const imageWrap = node.querySelector(".property-image-wrap");
    const image = node.querySelector(".property-image");
    const prevImageButton = node.querySelector(".property-nav-prev");
    const nextImageButton = node.querySelector(".property-nav-next");
    const imageIndicator = node.querySelector(".property-image-indicator");
    const imageUrls = getPropertyImageUrls(property);
    let currentImageIndex = 0;

    function updateCardImage() {
      image.src = imageUrls[currentImageIndex];
      image.alt = `Foto ${currentImageIndex + 1} de ${imageUrls.length} de ${property.title}`;
      imageIndicator.textContent = `${currentImageIndex + 1}/${imageUrls.length}`;
    }

    function showPreviousImage() {
      currentImageIndex =
        (currentImageIndex - 1 + imageUrls.length) % imageUrls.length;
      updateCardImage();
    }

    function showNextImage() {
      currentImageIndex = (currentImageIndex + 1) % imageUrls.length;
      updateCardImage();
    }

    updateCardImage();

    if (imageUrls.length > 1) {
      prevImageButton.classList.remove("hidden");
      nextImageButton.classList.remove("hidden");
      imageIndicator.classList.remove("hidden");

      prevImageButton.addEventListener("click", showPreviousImage);
      nextImageButton.addEventListener("click", showNextImage);

      let touchStartX = null;

      imageWrap.addEventListener(
        "touchstart",
        (event) => {
          touchStartX = event.changedTouches[0].clientX;
        },
        { passive: true },
      );

      imageWrap.addEventListener(
        "touchend",
        (event) => {
          if (touchStartX === null) return;

          const touchEndX = event.changedTouches[0].clientX;
          const deltaX = touchEndX - touchStartX;
          touchStartX = null;

          if (Math.abs(deltaX) < 35) return;

          if (deltaX < 0) {
            showNextImage();
          } else {
            showPreviousImage();
          }
        },
        { passive: true },
      );
    }

    node.querySelector(".property-price").textContent = formatCurrency(property.price);
    node.querySelector(".property-title").textContent = property.title;
    node.querySelector(".property-location").textContent = `${property.neighborhood} - ${property.location}`;

    const tags = node.querySelector(".property-tags");
    tags.innerHTML = `
      <span class="tag">${capitalize(property.type)}</span>
      <span class="tag">${property.bedrooms} quarto(s)</span>
    `;

    node.querySelector(".property-description").textContent = truncateText(
      property.description,
      140,
    );

    const whatsappButton = node.querySelector(".whatsapp-button");
    const whatsappUrl = buildWhatsAppLink(property);

    if (whatsappUrl) {
      whatsappButton.href = whatsappUrl;
      whatsappButton.removeAttribute("aria-disabled");
    } else {
      whatsappButton.removeAttribute("href");
      whatsappButton.setAttribute("aria-disabled", "true");
    }

    elements.propertyGrid.appendChild(node);
  });
}

function normalizeProperty(row) {
  const imagePaths = Array.isArray(row.image_paths)
    ? row.image_paths
    : Array.isArray(row.images)
      ? row.images
      : [];

  return {
    id: row.id,
    title: row.title || "Sem titulo",
    description: row.description || "",
    price: Number(row.price) || 0,
    neighborhood: row.neighborhood || "",
    location: row.location || "",
    type: String(row.type || "").toLowerCase(),
    bedrooms: Number(row.bedrooms) || 0,
    whatsapp: row.whatsapp || "",
    image_paths: imagePaths,
    cover_image: row.cover_image || imagePaths[0] || null,
  };
}

function getPropertyImageUrls(property) {
  const imagePaths = Array.isArray(property.image_paths)
    ? property.image_paths.filter(Boolean)
    : [];
  const orderedPaths = [...imagePaths];

  if (property.cover_image) {
    const coverIndex = orderedPaths.indexOf(property.cover_image);
    if (coverIndex >= 0) {
      orderedPaths.splice(coverIndex, 1);
    }
    orderedPaths.unshift(property.cover_image);
  }

  const uniquePaths = [...new Set(orderedPaths)];
  const urls = uniquePaths.map((path) => toPublicImageUrl(path));

  if (urls.length === 0) {
    return [placeholderImage(property.title)];
  }

  return urls;
}

function toPublicImageUrl(pathOrUrl) {
  if (!pathOrUrl) return placeholderImage("Sem imagem");
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(pathOrUrl);
  return data?.publicUrl || placeholderImage("Sem imagem");
}

function buildWhatsAppLink(property) {
  const phone = String(property.whatsapp || "").replace(/\D/g, "");
  if (!phone) return "";

  const message = [
    "Ola! Tenho interesse no imovel:",
    `${property.title}`,
    `Bairro: ${property.neighborhood}`,
    `Valor: ${formatCurrency(property.price)}`,
    "Pode me passar mais detalhes?",
  ].join("\n");

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function getCheckedValuesAsSet(container) {
  const values = Array.from(
    container.querySelectorAll('input[type="checkbox"]:checked'),
    (input) => input.value,
  );
  return new Set(values);
}

function uniqueSorted(values, numeric = false) {
  const unique = [...new Set(values)];
  if (numeric) {
    return unique.sort((a, b) => Number(a) - Number(b));
  }
  return unique.sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function parseOptionalNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function truncateText(text, limit) {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trim()}...`;
}

function formatCurrency(value) {
  return CURRENCY_FORMATTER.format(Number(value) || 0);
}

function capitalize(value) {
  if (!value) return "";
  return value[0].toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function placeholderImage(label) {
  const safeLabel = encodeURIComponent(label || "Sem imagem");
  return `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='420'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%230f8f8d' offset='0'/%3E%3Cstop stop-color='%23e67e22' offset='1'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='640' height='420' fill='url(%23g)'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-family='Outfit,sans-serif' font-size='30'%3E${safeLabel}%3C/text%3E%3C/svg%3E`;
}

function showStatus(target, message, type = "info") {
  target.textContent = message;
  target.classList.remove("hidden", "status-info", "status-success", "status-warning", "status-error");
  target.classList.add(`status-${type}`);
}

function hideStatus(target) {
  target.classList.add("hidden");
}
