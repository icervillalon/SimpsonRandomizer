// Simpson Randomizer — capítulo al azar, ruleta, galería y buscador.

const STORAGE_KEY = "simpson-randomizer:range";

function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
}
function recall(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

/* ---------- Filtros: temporadas y nota mínima ---------- */

const formatRating = (n) => n.toFixed(1).replace(".", ",");

// `button` se desactiva si ningún capítulo cumple los filtros; `onChange` avisa
// (con un pequeño retardo) cuando el usuario cambia algún filtro.
function setupPicker(picker, { button, onChange } = {}) {
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
    if (button) button.disabled = count === 0;
    store(STORAGE_KEY, { from, to, rating });
  }

  let changeTimer = null;
  function changed() {
    render();
    if (!onChange) return;
    clearTimeout(changeTimer);
    changeTimer = setTimeout(onChange, 600);
  }

  // El pulgar que esté encima recibe el clic: subimos el que se ha movido.
  fromInput.addEventListener("input", () => { fromInput.style.zIndex = 2; toInput.style.zIndex = 1; changed(); });
  toInput.addEventListener("input", () => { toInput.style.zIndex = 2; fromInput.style.zIndex = 1; changed(); });

  chips.forEach((chip) => chip.addEventListener("click", () => {
    fromInput.value = chip.dataset.from;
    toInput.value = chip.dataset.to;
    changed();
  }));

  ratingInput.addEventListener("input", changed);
  ratingChips.forEach((chip) => chip.addEventListener("click", () => {
    ratingInput.value = chip.dataset.rating;
    changed();
  }));

  render();
  return filters;
}

const filterQuery = ({ from, to, rating }) => `desde=${from}&hasta=${to}&nota=${rating}`;

/* ---------- Al azar ---------- */

function setupRandomizer() {
  const picker = document.getElementById("picker");
  if (!picker || document.getElementById("wheel-panel")) return;
  const button = document.getElementById("spin");
  const getFilters = setupPicker(picker, { button });
  const result = document.getElementById("result");
  const template = document.getElementById("episode-template");

  async function spin() {
    button.disabled = true;
    button.classList.add("is-spinning");
    const minDelay = new Promise((r) => setTimeout(r, 650));
    try {
      const resp = await fetch(`/api/aleatorio?${filterQuery(getFilters())}`);
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

/* ---------- Ruleta ---------- */

const SVG_NS = "http://www.w3.org/2000/svg";
const WHEEL = {
  radius: 290,      // borde de la rueda (viewBox de -300 a 300)
  imageInner: 200,  // la captura ocupa la parte exterior de cada pala
  textStart: 84,    // el texto va del botón central hasta la captura
  textEnd: 194,
  colors: ["#ffd90f", "#5db8f2", "#ff7eb6", "#fffdf3"],
  spinMs: 5200,
};

function svgEl(tag, attrs = {}, text) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}

// Pala apuntando hacia arriba (ángulos medidos en sentido horario desde arriba).
function wedgePath(count) {
  const r = WHEEL.radius;
  if (count === 1) return `M0 ${-r}A${r} ${r} 0 1 1 0 ${r}A${r} ${r} 0 1 1 0 ${-r}Z`;
  const half = (Math.PI / count);
  const x = r * Math.sin(half);
  const y = -r * Math.cos(half);
  return `M0 0L${-x} ${y}A${r} ${r} 0 0 1 ${x} ${y}Z`;
}

// Recorta el título con "…" para que no invada la captura.
function fitText(el, maxWidth) {
  const full = el.textContent;
  if (el.getComputedTextLength() <= maxWidth) return;
  let len = full.length;
  while (len > 1) {
    el.textContent = full.slice(0, --len).trimEnd() + "…";
    if (el.getComputedTextLength() <= maxWidth) return;
  }
}

function setupWheel() {
  const panel = document.getElementById("wheel-panel");
  if (!panel) return;
  const svg = document.getElementById("wheel");
  const hub = document.getElementById("wheel-hub");
  const spinButton = document.getElementById("spin");
  const newButton = document.getElementById("new-wheel");
  const status = document.getElementById("wheel-status");
  const result = document.getElementById("result");
  const template = document.getElementById("episode-template");

  let episodes = [];
  let rotation = 0;
  let spinning = false;
  let pendingGenerate = false;
  let request = 0;

  const getFilters = setupPicker(document.getElementById("picker"), { button: newButton, onChange: generate });

  function setBusy(busy) {
    spinning = busy;
    spinButton.disabled = busy || !episodes.length;
    hub.disabled = spinButton.disabled;
    spinButton.classList.toggle("is-spinning", busy);
  }

  async function generate() {
    if (spinning) { pendingGenerate = true; return; }
    const filters = getFilters();
    const id = ++request;
    if (!filters.count) {
      episodes = [];
      draw();
      status.textContent = "Ningún capítulo cumple estos filtros.";
      return;
    }
    status.textContent = "Preparando la ruleta…";
    try {
      const resp = await fetch(`/api/ruleta?${filterQuery(filters)}`);
      const data = await resp.json();
      if (id !== request) return; // llegó otra petición más reciente
      if (!resp.ok) throw new Error(data.error || "No se pudo preparar la ruleta");
      episodes = data;
      draw();
      status.textContent = episodes.length === 1
        ? "Solo hay 1 capítulo con estos filtros."
        : `${episodes.length} capítulos en la ruleta. ¡Gírala!`;
    } catch (err) {
      if (id === request) status.textContent = `¡D'oh! ${err.message}`;
    }
  }

  function draw() {
    // Vuelve a la posición inicial sin animación.
    svg.style.transition = "none";
    rotation = 0;
    svg.style.transform = "rotate(0deg)";
    svg.classList.remove("has-winner");
    svg.replaceChildren();
    setBusy(false);

    const count = episodes.length;
    if (!count) return;
    const step = 360 / count;
    const shape = wedgePath(count);
    const clip = svgEl("clipPath", { id: "wedge-clip" });
    clip.append(svgEl("path", { d: shape }));
    const defs = svgEl("defs");
    defs.append(clip);
    svg.append(defs, svgEl("circle", { r: WHEEL.radius, class: "wheel-base" }));

    const titles = [];
    episodes.forEach((ep, i) => {
      // Si la última pala repetiría el color de la primera (quedarían juntas), se cambia.
      let color = WHEEL.colors[i % WHEEL.colors.length];
      if (i === count - 1 && i % WHEEL.colors.length === 0 && count > 1) color = WHEEL.colors[2];
      const g = svgEl("g", { class: "wedge", "data-index": i, transform: `rotate(${(i + 0.5) * step})` });
      g.append(svgEl("path", { d: shape, fill: color }));
      if (ep.thumb) {
        g.append(svgEl("image", {
          href: ep.thumb,
          x: -80, y: -WHEEL.radius, width: 160, height: WHEEL.radius - WHEEL.imageInner,
          preserveAspectRatio: "xMidYMid slice",
          "clip-path": "url(#wedge-clip)",
        }));
      }
      // Texto a lo largo del radio, del centro hacia fuera.
      const text = svgEl("g", { transform: "rotate(-90)", class: "wedge-text" });
      text.append(svgEl("text", { x: WHEEL.textStart, y: -1, class: "wedge-code" }, `T${ep.season} · E${ep.number}`));
      const title = svgEl("text", { x: WHEEL.textStart, y: 11, class: "wedge-title" }, ep.title);
      text.append(title);
      titles.push(title);
      g.append(text, svgEl("path", { d: shape, class: "wedge-outline" }));
      svg.append(g);
    });

    svg.append(
      svgEl("circle", { r: WHEEL.imageInner, class: "wheel-ring-inner" }),
      svgEl("circle", { r: WHEEL.radius, class: "wheel-ring" }),
    );
    // Tachuelas en el borde, entre pala y pala.
    for (let i = 0; i < count && count > 1; i++) {
      const a = (i * step * Math.PI) / 180;
      svg.append(svgEl("circle", {
        cx: WHEEL.radius * Math.sin(a), cy: -WHEEL.radius * Math.cos(a), r: 7, class: "wheel-peg",
      }));
    }
    document.fonts.ready.then(() => titles.forEach((t) => fitText(t, WHEEL.textEnd - WHEEL.textStart)));
  }

  function spin() {
    if (spinning || !episodes.length) return;
    setBusy(true);
    svg.classList.remove("has-winner");
    svg.querySelector(".wedge.is-winner")?.classList.remove("is-winner");

    // Se elige el ganador y se calcula el giro para que quede bajo el puntero.
    const count = episodes.length;
    const step = 360 / count;
    const winner = Math.floor(Math.random() * count);
    const jitter = (Math.random() - 0.5) * step * 0.7;
    const target = (((-(winner + 0.5) * step + jitter) % 360) + 360) % 360;
    const current = ((rotation % 360) + 360) % 360;
    rotation += 360 * 6 + ((target - current + 360) % 360);

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 0 : WHEEL.spinMs;
    svg.getBoundingClientRect(); // aplica el estado actual antes de animar
    svg.style.transition = reduced ? "none" : `transform ${duration}ms cubic-bezier(.12, .62, .08, 1)`;
    svg.style.transform = `rotate(${rotation}deg)`;
    status.textContent = "Girando…";
    setTimeout(() => finish(winner), duration + 80);
  }

  async function finish(index) {
    const ep = episodes[index];
    const wedge = svg.querySelector(`.wedge[data-index="${index}"]`);
    wedge.classList.add("is-winner");
    svg.insertBefore(wedge, svg.querySelector(".wheel-ring-inner")); // por encima de las demás palas
    svg.classList.add("has-winner");
    status.textContent = `¡Ha salido «${ep.title}» (T${ep.season} · E${ep.number})!`;
    setBusy(false);

    try {
      const resp = await fetch(`/api/capitulo/${ep.season}/${ep.number}`);
      if (!resp.ok) throw new Error("No se pudo cargar el capítulo");
      result.replaceChildren(renderEpisode(template, await resp.json()));
      result.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      result.replaceChildren(Object.assign(document.createElement("p"), {
        className: "panel", textContent: `¡D'oh! ${err.message}`,
      }));
    }
    if (pendingGenerate) {
      pendingGenerate = false;
      generate();
    }
  }

  spinButton.addEventListener("click", spin);
  hub.addEventListener("click", spin);
  newButton.addEventListener("click", generate);
  result.addEventListener("click", (e) => {
    if (e.target.closest("[data-action=respin]")) {
      panel.scrollIntoView({ behavior: "smooth" });
      spin();
    }
  });
  generate();
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

setupRandomizer();
setupWheel();
setupSearch();
