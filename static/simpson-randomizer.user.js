// ==UserScript==
// @name         Simpson Randomizer · enlaces de Disney+
// @namespace    simpson-randomizer
// @version      1.1
// @updateURL    http://127.0.0.1:5000/static/simpson-randomizer.user.js
// @downloadURL  http://127.0.0.1:5000/static/simpson-randomizer.user.js
// @description  Mientras navegas por Los Simpson en Disney+, guarda en Simpson Randomizer el enlace directo de cada capítulo.
// @match        https://www.disneyplus.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  // Dirección de la app. Cámbiala si la arrancas con otro --port.
  const APP_URL = "http://127.0.0.1:5000";
  const SERIES_ID = "cac75c8f-a9e2-4d95-ac73-1cf1cc7b9568";

  // Etiquetas de capítulo que usa Disney+: "T3:E22 El Otto-show", "S3:E22 ...",
  // "Temporada 3, episodio 22: ...".
  const EPISODE_PATTERNS = [
    /\b[TS](\d{1,2})\s*:\s*E(\d{1,3})\b[\s.:\-–]*([^\n]*)/i,
    /Temporada\s+(\d{1,2})\D{1,15}?Episodio\s+(\d{1,3})\b[\s.:\-–]*([^\n]*)/i,
  ];
  const ANY_LABEL = /\b[TS]\d{1,2}\s*:\s*E\d{1,3}\b|Temporada\s+\d{1,2}\D{1,15}?Episodio\s+\d{1,3}/gi;
  const LINK_SELECTOR = 'a[href*="/play/"], a[href*="/video/"], a[href*="/browse/entity-"]';

  const found = new Map(); // código -> {season, number, title, url}
  const pending = new Map();
  let sentTotal = null;
  let appStatus = "Comprobando la app…";
  let lastError = "";
  let sendTimer = null;
  let scanTimer = null;

  const SERIES_NAME = /^\s*(Los Simpson|The Simpsons)\s*$/i;

  function isSimpsonsPage() {
    if (location.href.includes(SERIES_ID) || /\b(Los Simpson|The Simpsons)\b/.test(document.title)) return true;
    // Con sesión iniciada la URL o el título pueden cambiar: se busca el rótulo de la serie.
    return [...document.querySelectorAll("h1, img[alt]")].some((el) => SERIES_NAME.test(el.alt || el.textContent));
  }

  function isEpisodeLink(a) {
    return !a.href.includes(SERIES_ID);
  }

  // Busca la etiqueta "T1:E1 Título" en el enlace o en su tarjeta, sin subir
  // tanto que la tarjeta contenga otros capítulos.
  function describe(a) {
    const texts = [a.getAttribute("aria-label"), a.innerText, a.querySelector("img")?.alt];
    let el = a.parentElement;
    for (let depth = 0; el && depth < 5; depth++, el = el.parentElement) {
      if (el.querySelectorAll(LINK_SELECTOR).length > 1) break;
      texts.push(el.getAttribute("aria-label"), el.innerText);
    }
    for (const text of texts) {
      if (!text) continue;
      const labels = new Set((text.match(ANY_LABEL) || []).map((s) => s.replace(/\s/g, "").toUpperCase()));
      if (labels.size > 1) break; // es un contenedor con varios capítulos
      for (const re of EPISODE_PATTERNS) {
        const m = text.match(re);
        if (m) {
          return {
            season: Number(m[1]),
            number: Number(m[2]),
            title: m[3].replace(/^thumbnail\s*-\s*/i, "").trim(),
          };
        }
      }
    }
    return null;
  }

  function scan() {
    if (!badge.isConnected) document.body.append(badge);
    onSimpsons = isSimpsonsPage();
    if (!onSimpsons) return render();
    for (const a of document.querySelectorAll(LINK_SELECTOR)) {
      if (!isEpisodeLink(a)) continue;
      const info = describe(a);
      if (!info) continue;
      const url = a.href.split("?")[0];
      const code = `S${info.season}E${info.number}`;
      if (found.get(code)?.url === url) continue;
      const item = { ...info, url };
      found.set(code, item);
      pending.set(code, item);
    }
    if (pending.size) {
      clearTimeout(sendTimer);
      sendTimer = setTimeout(send, 1200);
    }
    render();
  }

  function send() {
    const items = [...pending.values()];
    pending.clear();
    GM_xmlhttpRequest({
      method: "POST",
      url: `${APP_URL}/api/disney-links`,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify(items),
      timeout: 8000,
      onload(resp) {
        if (resp.status !== 200) return fail(`la app respondió ${resp.status}`, items);
        const data = JSON.parse(resp.responseText);
        sentTotal = `${data.total} de ${data.episodes}`;
        appStatus = "App conectada";
        lastError = "";
        render();
      },
      onerror: () => fail(`no conecta con la app en ${APP_URL} (¿está arrancada?)`, items),
      ontimeout: () => fail("la app no responde", items),
    });
  }

  function fail(message, items) {
    lastError = message;
    // Se reintentará en el próximo escaneo.
    items.forEach((item) => found.delete(`S${item.season}E${item.number}`));
    render();
  }

  // Comprueba al cargar que la app responde, para avisar antes de recorrer temporadas.
  function ping() {
    GM_xmlhttpRequest({
      method: "GET",
      url: `${APP_URL}/api/disney-links`,
      timeout: 5000,
      onload(resp) {
        if (resp.status === 200) {
          const data = JSON.parse(resp.responseText);
          sentTotal = `${data.total} de ${data.episodes}`;
          appStatus = "App conectada";
          lastError = "";
        } else {
          lastError = `la app respondió ${resp.status}`;
        }
        render();
      },
      onerror: () => { lastError = `no conecta con la app en ${APP_URL} (¿está arrancada?)`; render(); },
      ontimeout: () => { lastError = "la app no responde"; render(); },
    });
  }

  /* ---------- Indicador en pantalla ---------- */

  let onSimpsons = false;
  const badge = document.createElement("div");
  Object.assign(badge.style, {
    position: "fixed", right: "16px", bottom: "16px", zIndex: 2147483647,
    maxWidth: "320px", padding: "10px 14px", borderRadius: "14px",
    background: "#ffd90f", color: "#1f1a17", border: "3px solid #1f1a17",
    boxShadow: "4px 4px 0 #1f1a17", font: "700 13px/1.35 system-ui, sans-serif",
    cursor: "pointer", whiteSpace: "pre-line",
  });
  badge.title = "Clic para ocultar";
  badge.addEventListener("click", () => { badge.style.display = "none"; });
  document.body.append(badge);

  function render() {
    const lines = ["🍩 Simpson Randomizer"];
    lines.push(lastError ? `⚠️ ${lastError}` : appStatus);
    if (sentTotal) lines.push(`Enlaces guardados: ${sentTotal}`);
    if (!onSimpsons) {
      lines.push("Abre la página de Los Simpson para capturar enlaces.");
    } else {
      lines.push(`${found.size} capítulos detectados en esta visita`);
      if (!found.size) lines.push("Cambia de temporada en el selector. Si sigue en 0, usa «Copiar diagnóstico» en el menú de Tampermonkey.");
    }
    const text = lines.join("\n");
    // Solo se toca el DOM si cambia, para no despertar al MutationObserver en bucle.
    if (badge.textContent !== text) badge.textContent = text;
    badge.style.background = lastError ? "#ffb3a7" : "#ffd90f";
  }

  /* ---------- Diagnóstico ---------- */

  // Si no detecta capítulos, este informe permite ajustar el script a la página.
  GM_registerMenuCommand("Copiar diagnóstico", () => {
    const links = [...document.querySelectorAll(LINK_SELECTOR)].slice(0, 20).map((a) => ({
      href: a.getAttribute("href"),
      aria: a.getAttribute("aria-label"),
      text: (a.innerText || "").slice(0, 160),
      parent: (a.parentElement?.innerText || "").slice(0, 200),
      detected: describe(a),
    }));
    const report = {
      url: location.href,
      title: document.title,
      simpsonsPage: isSimpsonsPage(),
      appStatus: lastError || appStatus,
      shadowHosts: [...document.querySelectorAll("*")].filter((el) => el.shadowRoot).length,
      headings: [...document.querySelectorAll("h1, h2")].slice(0, 10).map((h) => h.textContent.trim().slice(0, 80)),
      linkCount: document.querySelectorAll(LINK_SELECTOR).length,
      allLinksSample: [...document.querySelectorAll("a[href]")].slice(0, 40).map((a) => a.getAttribute("href")),
      episodeLabels: (document.body.innerText.match(/\b[TS]\d{1,2}:E\d{1,3}\b[^\n]{0,60}/g) || []).slice(0, 10),
      links,
      found: [...found.values()].slice(0, 10),
    };
    GM_setClipboard(JSON.stringify(report, null, 2));
    alert("Diagnóstico copiado al portapapeles.");
  });

  GM_registerMenuCommand("Reenviar todos los capítulos vistos", () => {
    found.forEach((item, code) => pending.set(code, item));
    if (pending.size) send();
  });

  new MutationObserver(() => {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 500);
  }).observe(document.body, { childList: true, subtree: true });
  ping();
  scan();
})();
