"""Prepara los datos y estilos que lleva dentro la app de Android.

Usa la misma caché que la app web (data/cache y data/disney_links.json) y
descarga de TMDB las capturas que todavía no estén cacheadas, para que la app
no necesite clave ni servidor.

Uso (desde la raíz del proyecto):
    .venv/bin/python android/export_data.py
"""
from __future__ import annotations

import json
import shutil
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT / "android" / "app" / "src" / "main" / "assets" / "web"
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

from episodes import build_catalog  # noqa: E402

# Archivos de la app web que se reutilizan tal cual.
SHARED_FILES = {
    ROOT / "static" / "css" / "style.css": WEB_DIR / "css" / "style.css",
    ROOT / "static" / "img" / "donut.svg": WEB_DIR / "img" / "donut.svg",
}


def main() -> None:
    catalog = build_catalog()
    episodes = catalog.episodes()
    print(f"{len(episodes)} capítulos desde {catalog.source.label}")

    print("Reuniendo capturas (las que falten se descargan de TMDB)...")
    with ThreadPoolExecutor(max_workers=6) as pool:
        stills = list(pool.map(catalog.stills, episodes))

    data = {
        "source": catalog.source.label,
        "source_name": catalog.source.name,
        "exported": date.today().isoformat(),
        "disney_series_url": catalog.disney_series_url,
        "episodes": [{**ep.to_dict(), "stills": s} for ep, s in zip(episodes, stills)],
    }
    out = WEB_DIR / "data" / "episodes.js"
    out.parent.mkdir(parents=True, exist_ok=True)
    # Como script (y no JSON) para que se cargue sin fetch, también desde file://.
    out.write_text("window.SIMPSONS_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
                   encoding="utf-8")

    for src, dst in SHARED_FILES.items():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)

    direct = sum(1 for ep in episodes if ep.disney_direct)
    with_stills = sum(1 for s in stills if s)
    print(f"Listo: {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")
    print(f"  {direct} enlaces directos a Disney+, {with_stills} capítulos con capturas")


if __name__ == "__main__":
    main()
