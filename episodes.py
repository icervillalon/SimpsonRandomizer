"""Descarga, cachea y consulta la lista de capítulos de Los Simpson.

Fuentes de datos:
  * TMDB (recomendada): títulos, sinopsis y capturas en español. Necesita una
    clave gratuita en la variable de entorno TMDB_API_KEY.
  * TVmaze (respaldo): no necesita clave, pero los textos están en inglés y
    solo hay una captura por capítulo.
"""
from __future__ import annotations

import json
import os
import random
import re
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from datetime import date
from html import unescape
from pathlib import Path

import requests

BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / "data" / "cache"
DISNEY_LINKS_FILE = BASE_DIR / "data" / "disney_links.json"
CACHE_TTL = 7 * 24 * 3600  # una semana: así aparecen los capítulos nuevos

TMDB_API = "https://api.themoviedb.org/3"
TMDB_IMAGES = "https://image.tmdb.org/t/p"
TMDB_SHOW_ID = 456
TVMAZE_SHOW_ID = 83
DISNEY_SERIES_URL = "https://www.disneyplus.com/{locale}/browse/entity-cac75c8f-a9e2-4d95-ac73-1cf1cc7b9568"
DISNEY_URL_RE = re.compile(r"^https://www\.disneyplus\.com/[\w\-/]+$")

USER_AGENT = "SimpsonRandomizer/1.0"


@dataclass
class Episode:
    season: int
    number: int
    title: str
    original_title: str
    overview: str
    overview_translated: bool  # False si la sinopsis está en inglés
    air_date: str | None
    runtime: int | None
    rating: float | None
    thumb: str | None
    image: str | None
    disney_url: str = ""
    disney_direct: bool = False  # True si el enlace lleva al capítulo exacto

    @property
    def code(self) -> str:
        return f"S{self.season:02d}E{self.number:02d}"

    @property
    def air_date_es(self) -> str:
        if not self.air_date:
            return ""
        y, m, d = (int(x) for x in self.air_date.split("-"))
        return f"{d} de {MONTHS_ES[m - 1]} de {y}"

    def to_dict(self) -> dict:
        data = asdict(self)
        data["code"] = self.code
        data["air_date_es"] = self.air_date_es
        return data


MONTHS_ES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
    "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]


def _has_aired(air_date: str | None) -> bool:
    return bool(air_date) and air_date <= date.today().isoformat()


def _strip_html(text: str | None) -> str:
    return unescape(re.sub(r"<[^>]+>", "", text or "")).strip()


class TMDBSource:
    name = "tmdb"
    label = "The Movie Database (TMDB)"

    def __init__(self, api_key: str, language: str):
        self.language = language
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self.params: dict[str, str] = {}
        # Acepta tanto la "API Key" (v3) como el "Read Access Token" (v4).
        if api_key.startswith("eyJ"):
            self.session.headers["Authorization"] = f"Bearer {api_key}"
        else:
            self.params["api_key"] = api_key

    def _get(self, path: str, **params) -> dict:
        resp = self.session.get(f"{TMDB_API}{path}", params={**self.params, **params}, timeout=20)
        resp.raise_for_status()
        return resp.json()

    def fetch_episodes(self) -> list[Episode]:
        show = self._get(f"/tv/{TMDB_SHOW_ID}", language=self.language)
        season_numbers = [s["season_number"] for s in show["seasons"] if s["season_number"] > 0]

        def load_season(n: int) -> tuple[dict, dict]:
            path = f"/tv/{TMDB_SHOW_ID}/season/{n}"
            # La versión en inglés da el título original y una sinopsis de respaldo.
            return self._get(path, language=self.language), self._get(path, language="en-US")

        with ThreadPoolExecutor(max_workers=8) as pool:
            seasons = list(pool.map(load_season, season_numbers))

        episodes = []
        for local, english in seasons:
            english_by_number = {e["episode_number"]: e for e in english.get("episodes", [])}
            for ep in local.get("episodes", []):
                if not _has_aired(ep.get("air_date")):
                    continue
                en = english_by_number.get(ep["episode_number"], {})
                title = ep.get("name") or ""
                if not title or re.fullmatch(r"Episodio \d+", title):
                    title = en.get("name") or title
                overview = ep.get("overview") or ""
                translated = bool(overview)
                if not overview:
                    overview = en.get("overview") or ""
                still = ep.get("still_path")
                episodes.append(Episode(
                    season=ep["season_number"],
                    number=ep["episode_number"],
                    title=title,
                    original_title=en.get("name") or title,
                    overview=overview,
                    overview_translated=translated,
                    air_date=ep.get("air_date"),
                    runtime=ep.get("runtime"),
                    rating=round(ep["vote_average"], 1) if ep.get("vote_average") else None,
                    thumb=f"{TMDB_IMAGES}/w300{still}" if still else None,
                    image=f"{TMDB_IMAGES}/w1280{still}" if still else None,
                ))
        return episodes

    def fetch_stills(self, ep: Episode) -> list[str]:
        data = self._get(f"/tv/{TMDB_SHOW_ID}/season/{ep.season}/episode/{ep.number}/images")
        stills = [f"{TMDB_IMAGES}/w1280{s['file_path']}" for s in data.get("stills", [])]
        if ep.image and ep.image not in stills:
            stills.insert(0, ep.image)
        return stills


class TVmazeSource:
    name = "tvmaze"
    label = "TVmaze"
    language = "en"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT

    def fetch_episodes(self) -> list[Episode]:
        resp = self.session.get(f"https://api.tvmaze.com/shows/{TVMAZE_SHOW_ID}/episodes", timeout=20)
        resp.raise_for_status()
        episodes = []
        for ep in resp.json():
            if ep.get("type") != "regular" or not ep.get("number") or not _has_aired(ep.get("airdate")):
                continue
            image = ep.get("image") or {}
            episodes.append(Episode(
                season=ep["season"],
                number=ep["number"],
                title=ep["name"],
                original_title=ep["name"],
                overview=_strip_html(ep.get("summary")),
                overview_translated=False,
                air_date=ep.get("airdate"),
                runtime=ep.get("runtime"),
                rating=(ep.get("rating") or {}).get("average"),
                thumb=image.get("medium"),
                image=image.get("original"),
            ))
        return episodes

    def fetch_stills(self, ep: Episode) -> list[str]:
        return [ep.image] if ep.image else []


class Catalog:
    """Lista de capítulos con caché en disco (data/cache)."""

    def __init__(self, source, disney_locale: str = "es-es"):
        self.source = source
        self.disney_series_url = DISNEY_SERIES_URL.format(locale=disney_locale)
        self._lock = threading.Lock()
        self._episodes: list[Episode] | None = None
        self._index: dict[tuple[int, int], Episode] = {}
        self._episodes_file = CACHE_DIR / f"episodes-{source.name}-{source.language}.json"
        self._stills_file = CACHE_DIR / f"stills-{source.name}.json"
        self._stills: dict[str, list[str]] = _read_json(self._stills_file) or {}

    # --- carga -------------------------------------------------------------

    def episodes(self) -> list[Episode]:
        with self._lock:
            if self._episodes is None:
                self._load()
            return self._episodes

    def refresh(self) -> int:
        with self._lock:
            self._load(force=True)
            return len(self._episodes)

    def _load(self, force: bool = False) -> None:
        cached = _read_json(self._episodes_file)
        fresh = cached and time.time() - cached.get("fetched_at", 0) < CACHE_TTL
        if fresh and not force:
            raw = cached["episodes"]
        else:
            try:
                raw = [asdict(e) for e in self.source.fetch_episodes()]
                _write_json(self._episodes_file, {"fetched_at": time.time(), "episodes": raw})
            except requests.RequestException:
                if not cached:
                    raise
                raw = cached["episodes"]  # sin conexión: mejor datos viejos que nada

        episodes = [Episode(**{**data, "disney_url": "", "disney_direct": False}) for data in raw]
        episodes.sort(key=lambda e: (e.season, e.number))
        self._episodes = episodes
        self._index = {(e.season, e.number): e for e in episodes}
        self._apply_disney_links()

    def _apply_disney_links(self) -> None:
        links = _load_disney_links()
        for ep in self._episodes:
            ep.disney_direct = bool(links.get(ep.code))
            ep.disney_url = links.get(ep.code) or self.disney_series_url

    def save_disney_links(self, items: list[dict]) -> dict:
        """Guarda enlaces a capítulos capturados en Disney+ por el userscript.

        Cada elemento trae season, number, title y url. Se busca primero por
        título (por si Disney+ numera algún capítulo distinto que TMDB) y, si
        no hay una coincidencia única, por temporada y número.
        """
        by_title: dict[str, list[Episode]] = {}
        for ep in self.episodes():
            by_title.setdefault(_normalize(ep.title), []).append(ep)

        saved, rejected = [], 0
        with self._lock:
            data = _read_json(DISNEY_LINKS_FILE) or {}
            for item in items:
                url = str(item.get("url", "")).split("?")[0]
                if not DISNEY_URL_RE.match(url):
                    rejected += 1
                    continue
                matches = by_title.get(_normalize(str(item.get("title", ""))), [])
                if len(matches) == 1:
                    ep = matches[0]
                else:
                    try:
                        ep = self._index.get((int(item["season"]), int(item["number"])))
                    except (KeyError, TypeError, ValueError):
                        ep = None
                if ep is None:
                    rejected += 1
                    continue
                if data.get(ep.code) != url:
                    data[ep.code] = url
                    saved.append(ep.code)
            if saved:
                _write_json(DISNEY_LINKS_FILE, dict(sorted(data.items(), key=lambda kv: (not kv[0].startswith("_"), kv[0]))), indent=2)
                self._apply_disney_links()
            total = sum(1 for ep in self._episodes if ep.disney_direct)
        return {"saved": saved, "rejected": rejected, "total": total, "episodes": len(self._episodes)}

    # --- consultas ---------------------------------------------------------

    def seasons(self) -> list[int]:
        return sorted({e.season for e in self.episodes()})

    def by_season(self) -> dict[int, list[Episode]]:
        grouped: dict[int, list[Episode]] = {}
        for ep in self.episodes():
            grouped.setdefault(ep.season, []).append(ep)
        return grouped

    def get(self, season: int, number: int) -> Episode | None:
        self.episodes()
        return self._index.get((season, number))

    def neighbours(self, ep: Episode) -> tuple[Episode | None, Episode | None]:
        episodes = self.episodes()
        i = episodes.index(ep)
        return (episodes[i - 1] if i > 0 else None, episodes[i + 1] if i + 1 < len(episodes) else None)

    def random(self, season_from: int, season_to: int) -> Episode | None:
        lo, hi = sorted((season_from, season_to))
        pool = [e for e in self.episodes() if lo <= e.season <= hi]
        return random.choice(pool) if pool else None

    def stills(self, ep: Episode) -> list[str]:
        if ep.code in self._stills:
            return self._stills[ep.code]
        try:
            stills = self.source.fetch_stills(ep)
        except requests.RequestException:
            return [ep.image] if ep.image else []
        with self._lock:
            self._stills[ep.code] = stills
            _write_json(self._stills_file, self._stills)
        return stills


def _read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _write_json(path: Path, data, indent: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=indent), encoding="utf-8")
    tmp.replace(path)


def _load_disney_links() -> dict[str, str]:
    data = _read_json(DISNEY_LINKS_FILE) or {}
    return {k: v for k, v in data.items() if not k.startswith("_") and v}


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in text if not unicodedata.combining(c)))


def build_catalog() -> Catalog:
    """Crea el catálogo según las variables de entorno (TMDB_API_KEY, SIMPSONS_LANG)."""
    language = os.environ.get("SIMPSONS_LANG", "es-ES")
    api_key = os.environ.get("TMDB_API_KEY", "").strip()
    source = TMDBSource(api_key, language) if api_key else TVmazeSource()
    return Catalog(source, disney_locale=language.lower())
