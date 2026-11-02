// Simpson Randomizer — interacción de la ruleta, galería y buscador.

const STORAGE_KEY = "simpson-randomizer:range";

function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
}
function recall(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

/* ---------- Filtros: temporadas y nota mínima ---------- */

const formatRating = (n) => n.toFixed(1).replace(".", ",");

function setupPicker(picker) {
  const first = Number(picker.dataset.first);
  const last = Number(picker.dataset.last);
  const fromInput = document.getElementById("season-from");
  const toInput = document.getElementById("season-to");
  const label = document.getElementById("range-label");
  const fill = document.getElementById("range-fill");
  const chips = picker.querySelectorAll("#season-presets .chip");

  const ratingInput = document.getElementById("min-rating");
  const ratingLabel = document.getElementById("rating-label");
  const ratingFill = document.getElementById("rating-fill");
  const ratingChips = picker.querySelectorAll("#rating-presets .chip");
  const ratingFloor = Number(ratingInput.min);
  const ratingCeil = Number(ratingInput.max);
  const countLabel = document.getElementById("match-count");
  const spinButton = document.getElementById("spin");
  const episodeRatings = JSON.parse(document.getElementById("episode-ratings").textContent);

  // Si la URL no fija los filtros, recupera los últimos usados.
  const params = new URLSearchParams(location.search);
  const saved = recall(STORAGE_KEY);
  if (!params.has("desde") && saved) {
    fromInput.value = saved.from;
    toInput.value = saved.to;
  }
  if (!params.has("nota") && saved?.rating) ratingInput.value = saved.rating;

  function filters() {
    const a = Number(fromInput.value);
    const b = Number(toInput.value);
    const value = Number(ratingInput.value);
    // El extremo izquierdo significa "sin filtro", incluidos los capítulos sin nota.
    const rating = value <= ratingFloor ? 0 : value;
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    const count = episodeRatings.filter(([s, r]) => s >= from && s <= to && (!rating || r >= rating)).length;
    return { from, to, rating, count };
  }

  function render() {
    const { from, to, rating, count } = filters();
    const span = last - first || 1;
    fill.style.left = `${((from - first) / span) * 100}%`;
    fill.style.right = `${((last - to) / span) * 100}%`;
    label.textContent = from === to ? `Solo la ${from}` : `${from} – ${to}`;
    chips.forEach((chip) => {
      chip.classList.toggle("is-active", Number(chip.dataset.from) === from && Number(chip.dataset.to) === to);
    });

    const ratingSpan = ratingCeil - ratingFloor || 1;
    ratingFill.style.left = `${((Number(ratingInput.value) - ratingFloor) / ratingSpan) * 100}%`;
    ratingFill.style.right = "0";
    ratingLabel.textContent = rating ? `★ ${formatRating(rating)}+` : "Cualquiera";
    ratingChips.forEach((chip) => {
      const chipRating = Number(chip.dataset.rating);
      chip.classList.toggle("is-active", (chipRating <= ratingFloor ? 0 : chipRating) === rating);
    });

    countLabel.textContent = count === 1 ? "1 capítulo posible"
      : count ? `${count} capítulos posibles` : "Ningún capítulo cumple estos filtros";
    countLabel.classList.toggle("is-empty", count === 0);
    spinButton.disabled = count === 0;
    store(STORAGE_KEY, { from, to, rating });
  }

  // El pulgar que esté encima recibe el clic: subimos el que se ha movido.
  fromInput.addEventListener("input", () => { fromInput.style.zIndex = 2; toInput.style.zIndex = 1; render(); });
  toInput.addEventListener("input", () => { toInput.style.zIndex = 2; fromInput.style.zIndex = 1; render(); });

  chips.forEach((chip) => chip.addEventListener("click", () => {
    fromInput.value = chip.dataset.from;
    toInput.value = chip.dataset.to;
    render();
  }));

  ratingInput.addEventListener("input", render);
  ratingChips.forEach((chip) => chip.addEventListener("click", () => {
    ratingInput.value = chip.dataset.rating;
    render();
  }));

  render();
  return filters;
}

/* ---------- Ruleta ---------- */

function setupRoulette() {
  const picker = document.getElementById("picker");
  if (!picker) return;
  const getFilters = setupPicker(picker);
  const button = document.getElementById("spin");
  const result = document.getElementById("result");
  const template = document.getElementById("episode-template");

  async function spin() {
    const { from, to, rating } = getFilters();
    button.disabled = true;
    button.classList.add("is-spinning");
    const minDelay = new Promise((r) => setTimeout(r, 650));
    try {
      const resp = await fetch(`/api/aleatorio?desde=${from}&hasta=${to}&nota=${rating}`);
      const data = await resp.json();
      await minDelay;
      if (!resp.ok) throw new Error(data.error || "Error al buscar un capítulo");
      result.replaceChildren(renderEpisode(template, data));
      result.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      await minDelay;
      const p = document.createElement("p");
      p.className = "panel";
      p.style.padding = "16px";
      p.textContent = `¡D'oh! ${err.message}`;
      result.replaceChildren(p);
    } finally {
      button.disabled = getFilters().count === 0;
      button.classList.remove("is-spinning");
    }
  }

  button.addEventListener("click", spin);
  result.addEventListener("click", (e) => {
    if (e.target.closest("[data-action=respin]")) {
      document.getElementById("picker").scrollIntoView({ behavior: "smooth" });
      spin();
    }
  });
}

function renderEpisode(template, ep) {
  const node = template.content.cloneNode(true);
  const field = (name) => node.querySelector(`[data-field="${name}"]`);

  const stills = ep.stills && ep.stills.length ? ep.stills : [ep.image].filter(Boolean);
  const main = field("image");
  if (stills.length) {
    main.src = stills[0];
    main.alt = `Captura de «${ep.title}»`;
  } else {
    main.replaceWith(Object.assign(document.createElement("div"), { className: "gallery-empty", textContent: "Sin capturas" }));
  }
  if (stills.length > 1) {
    stills.forEach((src, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "thumb" + (i === 0 ? " is-active" : "");
      btn.dataset.src = src;
      btn.setAttribute("aria-label", `Captura ${i + 1}`);
      const img = document.createElement("img");
      img.src = src.replace("/w1280/", "/w300/");
      img.alt = "";
      img.loading = "lazy";
      btn.append(img);
      field("thumbs").append(btn);
    });
  }

  field("badge").textContent = `Temporada ${ep.season} · Episodio ${ep.number}`;
  field("title").textContent = ep.title;
  field("original").textContent = ep.original_title !== ep.title ? `Título original: ${ep.original_title}` : "";

  const meta = [];
  if (ep.air_date_es) meta.push(`Emitido el ${ep.air_date_es}`);
  if (ep.runtime) meta.push(`${ep.runtime} min`);
  if (ep.rating) meta.push(`★ ${formatRating(ep.rating)}`);
  meta.forEach((text) => field("meta").append(Object.assign(document.createElement("li"), { textContent: text })));

  field("overview").textContent = ep.overview || "Sin sinopsis.";
  field("overview-note").hidden = !(ep.overview && !ep.overview_translated && document.body.dataset.source === "tmdb");
  field("disney").href = ep.disney_url;
  field("detail").href = ep.detail_url;

  const note = field("disney-note");
  if (!ep.disney_direct) {
    note.append(
      "Disney+ no tiene enlaces públicos por capítulo: el botón abre la serie, elige la ",
      Object.assign(document.createElement("strong"), { textContent: `temporada ${ep.season}` }),
      " y el ",
      Object.assign(document.createElement("strong"), { textContent: `episodio ${ep.number}` }),
      ".",
    );
  }
  return node;
}

/* ---------- Galería de capturas ---------- */

document.addEventListener("click", (e) => {
  const thumb = e.target.closest(".thumb");
  if (!thumb) return;
  const gallery = thumb.closest("[data-gallery]");
  gallery.querySelector(".gallery-main").src = thumb.dataset.src;
  gallery.querySelectorAll(".thumb").forEach((t) => t.classList.toggle("is-active", t === thumb));
});

/* ---------- Buscador del catálogo ---------- */

function setupSearch() {
  const input = document.getElementById("search");
  if (!input) return;
  const cards = [...document.querySelectorAll(".mini-card")];
  const seasons = [...document.querySelectorAll("[data-season]")];
  const empty = document.getElementById("search-empty");
  const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  cards.forEach((card) => { card.dataset.search = normalize(card.dataset.search); });

  input.addEventListener("input", () => {
    const terms = normalize(input.value.trim()).split(/\s+/).filter(Boolean);
    cards.forEach((card) => {
      card.hidden = !terms.every((t) => card.dataset.search.includes(t));
    });
    let anyVisible = false;
    seasons.forEach((section) => {
      const visible = section.querySelector(".mini-card:not([hidden])") !== null;
      section.hidden = !visible;
      anyVisible ||= visible;
    });
    empty.hidden = anyVisible;
  });
}

setupRoulette();
setupSearch();
