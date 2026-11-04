// Simpson Randomizer para Android: la misma app que la web, pero sin servidor.
// Los datos vienen de data/episodes.js (generado con android/export_data.py).

const DATA = window.SIMPSONS_DATA;
const EPISODES = DATA.episodes;
const SEASONS = [...new Set(EPISODES.map((e) => e.season))].sort((a, b) => a - b);
const FIRST_SEASON = SEASONS[0];
const LAST_SEASON = SEASONS[SEASONS.length - 1];
const STORAGE_KEY = "simpson-randomizer:range";

const formatRating = (n) => n.toFixed(1).replace(".", ",");
const episodeHref = (ep) => `#/capitulo/${ep.season}/${ep.number}`;

function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
}
function recall(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

// Crea un elemento: h("p", { className: "x" }, "texto", otroNodo)
function h(tag, props = {}, ...children) {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

/* ---------- Piezas comunes ---------- */

// Letras bailonas del rótulo ("|" separa líneas).
function renderWobbly(el) {
  el.dataset.wobbly.split("|").forEach((line, i) => {
    if (i) el.append(document.createElement("br"));
    const wrap = h("span", { className: "wobbly" });
    line.split(" ").forEach((word, j) => {
      if (j) wrap.append(" ");
      wrap.append(h("span", { className: "wobbly-word" },
        [...word].map((ch, k) => {
          const s = h("span", {}, ch);
          s.style.setProperty("--i", k + 1);
          return s;
        })));
    });
    el.append(wrap);
  });
}

function metaList(ep) {
  return h("ul", { className: "meta" },
    ep.air_date_es && h("li", {}, `Emitido el ${ep.air_date_es}`),
    ep.runtime && h("li", {}, `${ep.runtime} min`),
    ep.rating && h("li", {}, `★ ${formatRating(ep.rating)}`));
}

function disneyButton(ep, extraClass = "") {
  return h("a", { className: `btn btn-disney ${extraClass}`.trim(), href: ep.disney_url },
    h("span", {}, "Ver en"), " ", h("strong", {}, "Disney+"));
}

function disneyNote(ep) {
  if (ep.disney_direct) return null;
  return h("p", { className: "disney-note" },
    "Disney+ no tiene enlace a este capítulo: el botón abre la serie, elige la ",
    h("strong", {}, `temporada ${ep.season}`), " y el ", h("strong", {}, `episodio ${ep.number}`), ".");
}

function gallery(ep) {
  const stills = ep.stills.length ? ep.stills : [ep.image].filter(Boolean);
  if (!stills.length) return h("div", { className: "gallery" }, h("div", { className: "gallery-empty" }, "Sin capturas"));
  const main = h("img", { className: "gallery-main", src: stills[0], alt: `Captura de «${ep.title}»` });
  const thumbs = stills.length > 1 && h("div", { className: "gallery-thumbs" },
    stills.map((src, i) => {
      const btn = h("button", { type: "button", className: "thumb" + (i === 0 ? " is-active" : "") },
        h("img", { src: src.replace("/w1280/", "/w300/"), alt: "", loading: "lazy" }));
      btn.setAttribute("aria-label", `Captura ${i + 1}`);
      btn.addEventListener("click", () => {
        main.src = src;
        thumbs.querySelectorAll(".thumb").forEach((t) => t.classList.toggle("is-active", t === btn));
      });
      return btn;
    }));
  return h("div", { className: "gallery" }, main, thumbs);
}

// Ficha completa de un capítulo (la usan la ruleta y la página del capítulo).
function episodeCard(ep, { headingTag = "h2", actions = [] } = {}) {
  const translatedNote = ep.overview && !ep.overview_translated && DATA.source_name === "tmdb"
    && h("p", { className: "overview-note" }, "Sinopsis no disponible en español.");
  return h("article", { className: "panel episode-card" },
    h("div", { className: "episode-media" }, gallery(ep)),
    h("div", { className: "episode-info" },
      h("p", { className: "badge" }, `Temporada ${ep.season} · Episodio ${ep.number}`),
      h(headingTag, { className: "episode-title" }, ep.title),
      ep.original_title !== ep.title && h("p", { className: "original-title" }, `Título original: ${ep.original_title}`),
      metaList(ep),
      h("p", { className: "overview" }, ep.overview || "Sin sinopsis."),
      translatedNote,
      h("div", { className: "actions" }, disneyButton(ep), ...actions),
      disneyNote(ep)));
}

/* ---------- Ruleta ---------- */

function setupRoulette() {
  const fromInput = document.getElementById("season-from");
  const toInput = document.getElementById("season-to");
  const label = document.getElementById("range-label");
  const fill = document.getElementById("range-fill");
  const seasonPresets = document.getElementById("season-presets");
  const ratingInput = document.getElementById("min-rating");
  const ratingLabel = document.getElementById("rating-label");
  const ratingFill = document.getElementById("rating-fill");
  const ratingChips = document.querySelectorAll("#rating-presets .chip");
  const countLabel = document.getElementById("match-count");
  const spinButton = document.getElementById("spin");
  const result = document.getElementById("result");

  document.getElementById("total-episodes").textContent = EPISODES.length;

  for (const input of [fromInput, toInput]) {
    input.min = FIRST_SEASON;
    input.max = LAST_SEASON;
  }
  fromInput.value = FIRST_SEASON;
  toInput.value = LAST_SEASON;

  const maxRating = Math.max(...EPISODES.map((e) => e.rating || 0));
  const ratingFloor = Number(ratingInput.min);
  ratingInput.max = Math.floor(maxRating * 10) / 10;
  const ratingCeil = Number(ratingInput.max);

  const presets = [
    ["Época dorada (1–10)", 1, Math.min(10, LAST_SEASON)],
    ["11–20", Math.min(11, LAST_SEASON), Math.min(20, LAST_SEASON)],
    [`21–${LAST_SEASON}`, Math.min(21, LAST_SEASON), LAST_SEASON],
    ["Todas", FIRST_SEASON, LAST_SEASON],
  ];
  const seasonChips = presets.map(([text, from, to]) => {
    const chip = h("button", { type: "button", className: "chip" }, text);
    chip.dataset.from = from;
    chip.dataset.to = to;
    chip.addEventListener("click", () => {
      fromInput.value = from;
      toInput.value = to;
      render();
    });
    return chip;
  });
  seasonPresets.append(...seasonChips);

  const saved = recall(STORAGE_KEY);
  if (saved) {
    fromInput.value = saved.from;
    toInput.value = saved.to;
    if (saved.rating) ratingInput.value = saved.rating;
  }

  function filters() {
    const a = Number(fromInput.value);
    const b = Number(toInput.value);
    const value = Number(ratingInput.value);
    // El extremo izquierdo significa "sin filtro", incluidos los capítulos sin nota.
    const rating = value <= ratingFloor ? 0 : value;
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    const pool = EPISODES.filter((e) => e.season >= from && e.season <= to && (!rating || (e.rating || 0) >= rating));
    return { from, to, rating, pool };
  }

  function render() {
    const { from, to, rating, pool } = filters();
    const span = LAST_SEASON - FIRST_SEASON || 1;
    fill.style.left = `${((from - FIRST_SEASON) / span) * 100}%`;
    fill.style.right = `${((LAST_SEASON - to) / span) * 100}%`;
    label.textContent = from === to ? `Solo la ${from}` : `${from} – ${to}`;
    seasonChips.forEach((chip) => {
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

    const count = pool.length;
    countLabel.textContent = count === 1 ? "1 capítulo posible"
      : count ? `${count} capítulos posibles` : "Ningún capítulo cumple estos filtros";
    countLabel.classList.toggle("is-empty", count === 0);
    spinButton.disabled = count === 0;
    store(STORAGE_KEY, { from, to, rating });
  }

  // El pulgar que esté encima recibe el toque: subimos el que se ha movido.
  fromInput.addEventListener("input", () => { fromInput.style.zIndex = 2; toInput.style.zIndex = 1; render(); });
  toInput.addEventListener("input", () => { toInput.style.zIndex = 2; fromInput.style.zIndex = 1; render(); });
  ratingInput.addEventListener("input", render);
  ratingChips.forEach((chip) => chip.addEventListener("click", () => {
    ratingInput.value = chip.dataset.rating;
    render();
  }));

  function spin() {
    const { pool } = filters();
    if (!pool.length) return;
    spinButton.disabled = true;
    spinButton.classList.add("is-spinning");
    setTimeout(() => {
      const ep = pool[Math.floor(Math.random() * pool.length)];
      const again = h("button", { type: "button", className: "btn btn-ghost" }, "Otro");
      again.addEventListener("click", () => {
        document.getElementById("picker").scrollIntoView({ behavior: "smooth" });
        spin();
      });
      result.replaceChildren(episodeCard(ep, {
        actions: [h("a", { className: "btn btn-ghost", href: episodeHref(ep) }, "Ver ficha"), again],
      }));
      result.scrollIntoView({ behavior: "smooth", block: "start" });
      spinButton.disabled = false;
      spinButton.classList.remove("is-spinning");
    }, 650);
  }

  spinButton.addEventListener("click", spin);
  render();
}

/* ---------- Catálogo ---------- */

let catalogBuilt = false;

function buildCatalog() {
  if (catalogBuilt) return;
  catalogBuilt = true;

  document.getElementById("catalog-sub").textContent =
    `${EPISODES.length} capítulos en ${SEASONS.length} temporadas.`;
  const list = document.getElementById("catalog-list");
  const chips = document.getElementById("season-chips");
  const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  const cards = [];
  const sections = SEASONS.map((season) => {
    const eps = EPISODES.filter((e) => e.season === season);
    const grid = h("div", { className: "grid" }, eps.map((ep) => {
      const card = h("article", { className: "mini-card" },
        h("a", { className: "mini-thumb", href: episodeHref(ep) },
          ep.thumb && h("img", { src: ep.thumb, alt: "", loading: "lazy", width: 300, height: 169 }),
          h("span", { className: "badge" }, `T${ep.season} · E${ep.number}`)),
        h("div", { className: "mini-body" },
          h("h3", {}, h("a", { href: episodeHref(ep) }, ep.title)),
          ep.original_title !== ep.title && h("p", { className: "original-title" }, ep.original_title),
          h("p", { className: "mini-date" }, ep.air_date_es),
          h("p", { className: "mini-overview" }, ep.overview),
          disneyButton(ep)));
      card.dataset.search = normalize(`${ep.title} ${ep.original_title} ${ep.overview}`);
      cards.push(card);
      return card;
    }));
    const section = h("section", { className: "season", id: `temporada-${season}` },
      h("h2", { className: "season-title" }, h("span", {}, `Temporada ${season}`), " ",
        h("small", {}, `${eps.length} capítulos`)),
      grid);

    // Botones (no anclas #) para no romper la navegación por hash.
    const chip = h("button", { type: "button", className: "chip" }, String(season));
    chip.addEventListener("click", () => section.scrollIntoView({ behavior: "smooth" }));
    chips.append(chip);
    return section;
  });
  list.append(...sections);

  const input = document.getElementById("search");
  const empty = document.getElementById("search-empty");
  input.addEventListener("input", () => {
    const terms = normalize(input.value.trim()).split(/\s+/).filter(Boolean);
    cards.forEach((card) => { card.hidden = !terms.every((t) => card.dataset.search.includes(t)); });
    let anyVisible = false;
    sections.forEach((section) => {
      const visible = section.querySelector(".mini-card:not([hidden])") !== null;
      section.hidden = !visible;
      anyVisible ||= visible;
    });
    empty.hidden = anyVisible;
  });
}

/* ---------- Ficha de capítulo ---------- */

function showEpisode(season, number) {
  const view = document.getElementById("view-capitulo");
  const i = EPISODES.findIndex((e) => e.season === season && e.number === number);
  if (i < 0) {
    view.replaceChildren(h("section", { className: "hero" },
      h("p", { className: "hero-sub" }, "Ese capítulo no existe (todavía)."),
      h("p", {}, h("a", { className: "btn btn-ghost", href: "#/" }, "Volver a la ruleta"))));
    return;
  }
  const ep = EPISODES[i];
  const prev = EPISODES[i - 1];
  const next = EPISODES[i + 1];
  view.replaceChildren(
    h("nav", { className: "crumbs" },
      h("a", { className: "chip", href: "#/capitulos" }, `← Todos los capítulos`)),
    episodeCard(ep, { headingTag: "h1", actions: [h("a", { className: "btn btn-ghost", href: "#/" }, "Ruleta")] }),
    h("nav", { className: "pager" },
      prev ? h("a", { className: "btn btn-ghost", href: episodeHref(prev) }, `← ${prev.title}`) : h("span"),
      next && h("a", { className: "btn btn-ghost", href: episodeHref(next) }, `${next.title} →`)));
}

/* ---------- Navegación ---------- */

const scrollPositions = new Map();

function route() {
  const [view, a, b] = location.hash.replace(/^#\/?/, "").split("/");
  const name = view === "capitulos" || view === "capitulo" ? view : "ruleta";
  if (name === "capitulos") buildCatalog();
  if (name === "capitulo") showEpisode(Number(a), Number(b));
  for (const el of document.querySelectorAll(".view")) el.hidden = el.id !== `view-${name}`;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const active = link.dataset.nav === name || (name === "capitulo" && link.dataset.nav === "capitulos");
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
  window.scrollTo({ top: scrollPositions.get(location.hash) || 0, behavior: "instant" });
}

window.addEventListener("hashchange", (e) => {
  // Al volver atrás, cada pantalla recupera su posición (por ejemplo, el catálogo).
  scrollPositions.set(new URL(e.oldURL).hash, window.scrollY);
  route();
});

document.querySelectorAll("[data-wobbly]").forEach(renderWobbly);
document.getElementById("data-source").textContent =
  `Datos de ${DATA.source} (actualizados el ${DATA.exported.split("-").reverse().join("/")}).`
  + (DATA.source_name === "tmdb" ? " Este producto usa la API de TMDB, pero no está respaldado ni certificado por TMDB." : "");
setupRoulette();
route();
