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
  adminStatus: document.querySelector("#admin-status"),
  resultsCount: document.querySelector("#results-count"),
  emptyCatalog: document.querySelector("#empty-catalog"),
  propertyGrid: document.querySelector("#property-grid"),
  propertyTemplate: document.querySelector("#property-card-template"),
  adminTemplate: document.querySelector("#admin-item-template"),
  adminList: document.querySelector("#admin-property-list"),

  minPrice: document.querySelector("#min-price"),
  maxPrice: document.querySelector("#max-price"),
  typeFilters: document.querySelector("#type-filters"),
  neighborhoodFilters: document.querySelector("#neighborhood-filters"),
  bedroomFilters: document.querySelector("#bedroom-filters"),
  clearFiltersButton: document.querySelector("#clear-filters"),

  loginForm: document.querySelector("#admin-login-form"),
  adminContent: document.querySelector("#admin-content"),
  logoutButton: document.querySelector("#logout-button"),

  propertyForm: document.querySelector("#property-form"),
  formTitle: document.querySelector("#property-form-title"),
  propertyId: document.querySelector("#property-id"),
  titleInput: document.querySelector("#property-title"),
  descriptionInput: document.querySelector("#property-description"),
  priceInput: document.querySelector("#property-price"),
  bedroomsInput: document.querySelector("#property-bedrooms"),
  neighborhoodInput: document.querySelector("#property-neighborhood"),
  locationInput: document.querySelector("#property-location"),
  typeInput: document.querySelector("#property-type"),
  whatsappInput: document.querySelector("#property-whatsapp"),
  imageInput: document.querySelector("#image-input"),
  imagePreview: document.querySelector("#image-preview"),
  savePropertyButton: document.querySelector("#save-property-button"),
  cancelEditButton: document.querySelector("#cancel-edit-button"),
};

const state = {
  properties: [],
  filteredProperties: [],
  authUser: null,
  editingPropertyId: null,
  stagedImages: [],
  selectedCoverStageId: null,
  removedExistingImagePaths: new Set(),
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
    showStatus(
      elements.adminStatus,
      "Painel admin bloqueado: configure SUPABASE_URL e SUPABASE_ANON_KEY.",
      "warning",
    );
    elements.loginForm.classList.add("hidden");
    elements.adminContent.classList.add("hidden");
    renderCatalog([]);
    renderAdminList([]);
    return;
  }

  showStatus(elements.globalStatus, "Carregando imoveis...", "info");
  await restoreAuthState();
  watchAuthChanges();
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

  elements.loginForm.addEventListener("submit", handleLoginSubmit);
  elements.logoutButton.addEventListener("click", handleLogout);

  elements.propertyForm.addEventListener("submit", handlePropertySubmit);
  elements.cancelEditButton.addEventListener("click", resetPropertyForm);
  elements.imageInput.addEventListener("change", handleImageInputChange);
  elements.imagePreview.addEventListener("click", handleImagePreviewClick);
  elements.imagePreview.addEventListener("change", handleImagePreviewChange);

  elements.adminList.addEventListener("click", handleAdminListClick);
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

    const image = node.querySelector(".property-image");
    image.src = getPropertyCoverUrl(property);
    image.alt = `Foto principal de ${property.title}`;

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

async function restoreAuthState() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(`Falha ao recuperar sessao: ${error.message}`);
  }

  state.authUser = data.session?.user ?? null;
  syncAdminVisibility();
}

function watchAuthChanges() {
  supabase.auth.onAuthStateChange((_event, session) => {
    state.authUser = session?.user ?? null;
    syncAdminVisibility();
    if (!state.authUser) {
      resetPropertyForm();
    }
  });
}

function syncAdminVisibility() {
  const isLogged = Boolean(state.authUser);
  elements.loginForm.classList.toggle("hidden", isLogged);
  elements.adminContent.classList.toggle("hidden", !isLogged);

  if (!isLogged) {
    showStatus(elements.adminStatus, "Entre para liberar o painel admin.", "info");
  } else {
    showStatus(elements.adminStatus, "Acesso admin ativo.", "success");
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const formData = new FormData(elements.loginForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "").trim();

  if (!email || !password) {
    showStatus(elements.adminStatus, "Informe e-mail e senha.", "warning");
    return;
  }

  disableElement(elements.loginForm, true);
  showStatus(elements.adminStatus, "Autenticando...", "info");

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    state.authUser = data.user ?? null;
    syncAdminVisibility();
    elements.loginForm.reset();
  } catch (error) {
    showStatus(elements.adminStatus, `Falha no login: ${error.message}`, "error");
  } finally {
    disableElement(elements.loginForm, false);
  }
}

async function handleLogout() {
  disableElement(elements.logoutButton, true);
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    state.authUser = null;
    syncAdminVisibility();
    resetPropertyForm();
  } catch (error) {
    showStatus(elements.adminStatus, `Erro ao sair: ${error.message}`, "error");
  } finally {
    disableElement(elements.logoutButton, false);
  }
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
  renderAdminList(state.properties);
}

function renderAdminList(properties) {
  elements.adminList.innerHTML = "";

  if (properties.length === 0) {
    elements.adminList.innerHTML =
      '<div class="empty-inline">Nenhum imovel cadastrado ainda.</div>';
    return;
  }

  properties.forEach((property) => {
    const node = elements.adminTemplate.content.cloneNode(true);
    const item = node.querySelector(".admin-item");
    item.dataset.id = property.id;
    item.querySelector(".admin-item-title").textContent = property.title;
    item.querySelector(".admin-item-meta").textContent =
      `${capitalize(property.type)} | ${property.bedrooms} quarto(s) | ${formatCurrency(property.price)}`;
    elements.adminList.appendChild(node);
  });
}

function handleAdminListClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const item = button.closest(".admin-item");
  if (!item) return;

  const propertyId = item.dataset.id;
  const action = button.dataset.action;

  if (action === "edit") {
    startEditingProperty(propertyId);
    return;
  }

  if (action === "delete") {
    deleteProperty(propertyId).catch((error) => {
      showStatus(elements.adminStatus, `Erro ao remover: ${error.message}`, "error");
    });
  }
}

function startEditingProperty(propertyId) {
  const property = state.properties.find((item) => item.id === propertyId);
  if (!property) return;

  state.editingPropertyId = property.id;
  elements.propertyId.value = property.id;
  elements.titleInput.value = property.title;
  elements.descriptionInput.value = property.description;
  elements.priceInput.value = String(property.price);
  elements.bedroomsInput.value = String(property.bedrooms);
  elements.neighborhoodInput.value = property.neighborhood;
  elements.locationInput.value = property.location;
  elements.typeInput.value = property.type;
  elements.whatsappInput.value = property.whatsapp;

  cleanupStagedImages();
  state.removedExistingImagePaths = new Set();
  state.stagedImages = (property.image_paths || []).map((path) => ({
    id: crypto.randomUUID(),
    isExisting: true,
    path,
    previewUrl: toPublicImageUrl(path),
    objectUrl: null,
  }));

  state.selectedCoverStageId = resolveCoverStageId(property.cover_image);
  elements.formTitle.textContent = `Editando: ${property.title}`;
  elements.savePropertyButton.textContent = "Atualizar imovel";
  elements.cancelEditButton.classList.remove("hidden");

  renderImagePreview();
  showStatus(elements.adminStatus, "Modo edicao ativo.", "info");
  elements.propertyForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteProperty(propertyId) {
  if (!state.authUser) {
    showStatus(elements.adminStatus, "Voce precisa entrar no painel admin.", "warning");
    return;
  }

  const property = state.properties.find((item) => item.id === propertyId);
  if (!property) return;

  const confirmed = window.confirm("Deseja remover este imovel? Essa acao nao pode ser desfeita.");
  if (!confirmed) return;

  showStatus(elements.adminStatus, "Removendo imovel...", "info");

  const { error } = await supabase.from("properties").delete().eq("id", propertyId);
  if (error) {
    throw error;
  }

  const imagePaths = Array.isArray(property.image_paths) ? property.image_paths : [];
  if (imagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(imagePaths);
    if (storageError) {
      showStatus(
        elements.adminStatus,
        `Imovel removido, mas algumas imagens nao foram apagadas: ${storageError.message}`,
        "warning",
      );
    }
  }

  if (state.editingPropertyId === propertyId) {
    resetPropertyForm();
  }

  await loadProperties();
  showStatus(elements.adminStatus, "Imovel removido com sucesso.", "success");
}

async function handlePropertySubmit(event) {
  event.preventDefault();

  if (!state.authUser) {
    showStatus(elements.adminStatus, "Entre no painel admin para salvar alteracoes.", "warning");
    return;
  }

  const payload = collectPropertyFormData();
  if (!payload) return;

  const propertyId = state.editingPropertyId || crypto.randomUUID();
  const stageSnapshot = [...state.stagedImages];
  const newStages = stageSnapshot.filter((stage) => !stage.isExisting);
  const uploadedNewPaths = [];

  disableElement(elements.savePropertyButton, true);
  showStatus(elements.adminStatus, "Salvando imovel...", "info");

  try {
    const stageToPath = new Map();

    for (const stage of stageSnapshot) {
      if (stage.isExisting) {
        stageToPath.set(stage.id, stage.path);
        continue;
      }

      const uploadedPath = await uploadCompressedImage(stage.file, propertyId);
      uploadedNewPaths.push(uploadedPath);
      stageToPath.set(stage.id, uploadedPath);
    }

    const allPaths = stageSnapshot
      .map((stage) => stageToPath.get(stage.id))
      .filter(Boolean);

    if (allPaths.length === 0) {
      throw new Error("Adicione ao menos uma imagem antes de salvar.");
    }

    const coverPath = resolveCoverPath(stageSnapshot, stageToPath, allPaths);

    const row = {
      id: propertyId,
      title: payload.title,
      description: payload.description,
      price: payload.price,
      neighborhood: payload.neighborhood,
      location: payload.location,
      type: payload.type,
      bedrooms: payload.bedrooms,
      whatsapp: payload.whatsapp,
      image_paths: allPaths,
      cover_image: coverPath,
    };

    if (state.editingPropertyId) {
      const { error } = await supabase
        .from("properties")
        .update(row)
        .eq("id", propertyId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("properties").insert(row);
      if (error) throw error;
    }

    if (state.removedExistingImagePaths.size > 0) {
      const pathsToRemove = [...state.removedExistingImagePaths];
      const { error: removeError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(pathsToRemove);

      if (removeError) {
        showStatus(
          elements.adminStatus,
          `Imovel salvo, mas houve falha ao remover imagens antigas: ${removeError.message}`,
          "warning",
        );
      }
    }

    const actionLabel = state.editingPropertyId ? "atualizado" : "cadastrado";
    resetPropertyForm();
    await loadProperties();
    showStatus(elements.adminStatus, `Imovel ${actionLabel} com sucesso.`, "success");
  } catch (error) {
    if (uploadedNewPaths.length > 0) {
      await supabase.storage.from(STORAGE_BUCKET).remove(uploadedNewPaths);
    }
    showStatus(elements.adminStatus, `Erro ao salvar: ${error.message}`, "error");
  } finally {
    disableElement(elements.savePropertyButton, false);
    if (newStages.length > 0) {
      elements.imageInput.value = "";
    }
  }
}

function collectPropertyFormData() {
  const title = elements.titleInput.value.trim();
  const description = elements.descriptionInput.value.trim();
  const neighborhood = elements.neighborhoodInput.value.trim();
  const location = elements.locationInput.value.trim();
  const type = elements.typeInput.value.trim().toLowerCase();
  const whatsapp = elements.whatsappInput.value.trim();
  const rawPrice = elements.priceInput.value;
  const rawBedrooms = elements.bedroomsInput.value;
  const price = Number(rawPrice);
  const bedrooms = Number(rawBedrooms);

  if (!title || !description || !neighborhood || !location || !type || !whatsapp) {
    showStatus(elements.adminStatus, "Preencha todos os campos obrigatorios.", "warning");
    return null;
  }

  if (!PROPERTY_TYPES.includes(type)) {
    showStatus(elements.adminStatus, "Tipo de imovel invalido.", "warning");
    return null;
  }

  if (rawPrice === "" || !Number.isFinite(price) || price < 0) {
    showStatus(elements.adminStatus, "Informe um valor valido.", "warning");
    return null;
  }

  if (rawBedrooms === "" || !Number.isFinite(bedrooms) || bedrooms < 0) {
    showStatus(elements.adminStatus, "Informe a quantidade de quartos corretamente.", "warning");
    return null;
  }

  return {
    title,
    description,
    neighborhood,
    location,
    type,
    whatsapp,
    price,
    bedrooms,
  };
}

async function uploadCompressedImage(file, propertyId) {
  const compressedBlob = await compressImage(file, {
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 0.82,
  });

  const baseName = sanitizeFileName(file.name);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const filePath = `${propertyId}/${unique}-${baseName}.webp`;

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, compressedBlob, {
    contentType: "image/webp",
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    throw new Error(`Falha no upload da imagem: ${error.message}`);
  }

  return filePath;
}

async function compressImage(file, options) {
  const image = await loadImageFromFile(file);
  const { maxWidth, maxHeight, quality } = options;
  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const targetWidth = Math.round(image.width * ratio);
  const targetHeight = Math.round(image.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Nao foi possivel comprimir a imagem."));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality,
    );
  });
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Arquivo de imagem invalido."));
    };

    image.src = objectUrl;
  });
}

function handleImageInputChange(event) {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;

  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  if (imageFiles.length === 0) return;

  imageFiles.forEach((file) => {
    const objectUrl = URL.createObjectURL(file);
    state.stagedImages.push({
      id: crypto.randomUUID(),
      isExisting: false,
      file,
      path: null,
      previewUrl: objectUrl,
      objectUrl,
    });
  });

  if (!state.selectedCoverStageId && state.stagedImages.length > 0) {
    state.selectedCoverStageId = state.stagedImages[0].id;
  }

  renderImagePreview();
}

function handleImagePreviewClick(event) {
  const removeButton = event.target.closest("button[data-remove-image]");
  if (!removeButton) return;
  removeStagedImage(removeButton.dataset.removeImage);
}

function handleImagePreviewChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.name !== "cover-image") return;
  state.selectedCoverStageId = target.value;
}

function renderImagePreview() {
  if (state.stagedImages.length === 0) {
    elements.imagePreview.innerHTML =
      '<div class="empty-inline">Nenhuma imagem selecionada.</div>';
    return;
  }

  elements.imagePreview.innerHTML = state.stagedImages
    .map((stage) => {
      const checked = state.selectedCoverStageId === stage.id ? "checked" : "";
      const badge = stage.isExisting ? "Atual" : "Nova";
      return `
        <article class="image-item">
          <img src="${stage.previewUrl}" alt="Preview da imagem ${badge}">
          <div class="image-item-controls">
            <label class="cover-choice">
              <input type="radio" name="cover-image" value="${stage.id}" ${checked}>
              <span>Principal</span>
            </label>
            <button type="button" class="danger-button small" data-remove-image="${stage.id}">Remover</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function removeStagedImage(stageId) {
  const stage = state.stagedImages.find((item) => item.id === stageId);
  if (!stage) return;

  if (stage.isExisting && stage.path) {
    state.removedExistingImagePaths.add(stage.path);
  }

  if (stage.objectUrl) {
    URL.revokeObjectURL(stage.objectUrl);
  }

  state.stagedImages = state.stagedImages.filter((item) => item.id !== stageId);

  if (state.selectedCoverStageId === stageId) {
    state.selectedCoverStageId = state.stagedImages[0]?.id ?? null;
  }

  renderImagePreview();
}

function resolveCoverStageId(coverPath) {
  const coverStage = state.stagedImages.find((stage) => stage.path === coverPath);
  if (coverStage) return coverStage.id;
  return state.stagedImages[0]?.id ?? null;
}

function resolveCoverPath(stages, stageToPath, allPaths) {
  if (state.selectedCoverStageId) {
    const coverPath = stageToPath.get(state.selectedCoverStageId);
    if (coverPath) return coverPath;
  }
  return allPaths[0] ?? null;
}

function resetPropertyForm() {
  cleanupStagedImages();
  state.editingPropertyId = null;
  state.selectedCoverStageId = null;
  state.removedExistingImagePaths = new Set();
  state.stagedImages = [];

  elements.propertyForm.reset();
  elements.propertyId.value = "";
  elements.formTitle.textContent = "Cadastrar novo imovel";
  elements.savePropertyButton.textContent = "Salvar imovel";
  elements.cancelEditButton.classList.add("hidden");
  renderImagePreview();
}

function cleanupStagedImages() {
  for (const stage of state.stagedImages) {
    if (stage.objectUrl) {
      URL.revokeObjectURL(stage.objectUrl);
    }
  }
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

function getPropertyCoverUrl(property) {
  const coverPath = property.cover_image || property.image_paths[0];
  if (!coverPath) return placeholderImage(property.title);
  return toPublicImageUrl(coverPath);
}

function toPublicImageUrl(pathOrUrl) {
  if (!pathOrUrl) return placeholderImage("Sem imagem");
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (!supabase) return pathOrUrl;
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

function sanitizeFileName(fileName) {
  const base = fileName.replace(/\.[^/.]+$/, "").toLowerCase();
  const sanitized = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 45);
  return sanitized || "imagem";
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

function disableElement(element, disabled) {
  if (element instanceof HTMLFormElement) {
    for (const field of Array.from(element.elements)) {
      field.disabled = disabled;
    }
    return;
  }
  element.disabled = disabled;
}

function showStatus(target, message, type = "info") {
  target.textContent = message;
  target.classList.remove("hidden", "status-info", "status-success", "status-warning", "status-error");
  target.classList.add(`status-${type}`);
}

function hideStatus(target) {
  target.classList.add("hidden");
}
