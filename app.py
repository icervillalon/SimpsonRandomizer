"""Simpson Randomizer: un capítulo aleatorio de Los Simpson con enlace a Disney+.

Uso:
    python app.py               # arranca en http://127.0.0.1:5000
    python app.py --actualizar  # vuelve a descargar la lista de capítulos
"""
from __future__ import annotations

import argparse

import requests
from dotenv import load_dotenv
from flask import Flask, abort, jsonify, render_template, request, url_for

load_dotenv()

from episodes import Episode, build_catalog  # noqa: E402  (necesita el .env cargado)

app = Flask(__name__)
app.json.ensure_ascii = False
catalog = build_catalog()


def episode_payload(ep: Episode, with_stills: bool = True) -> dict:
    data = ep.to_dict()
    data["detail_url"] = url_for("episode_page", season=ep.season, number=ep.number)
    if with_stills:
        data["stills"] = catalog.stills(ep)
    return data


def season_bounds() -> tuple[int, int]:
    seasons = catalog.seasons()
    return seasons[0], seasons[-1]


@app.context_processor
def inject_globals():
    return {
        "source_name": catalog.source.name,
        "source_label": catalog.source.label,
        "disney_series_url": catalog.disney_series_url,
    }


@app.errorhandler(requests.RequestException)
def data_unavailable(err):
    return render_template("error.html", error=err), 503


@app.get("/")
def index():
    first, last = season_bounds()
    episodes = catalog.episodes()
    ratings = [e.rating for e in episodes if e.rating]
    return render_template(
        "index.html",
        first_season=first,
        last_season=last,
        total=len(episodes),
        season_from=request.args.get("desde", first, type=int),
        season_to=request.args.get("hasta", last, type=int),
        min_rating=request.args.get("nota", 0, type=float),
        max_rating=max(ratings, default=10),
        # [temporada, nota] de cada capítulo, para contar en vivo cuántos cumplen los filtros
        episode_ratings=[[e.season, e.rating or 0] for e in episodes],
    )


@app.get("/capitulos")
def catalog_page():
    grouped = catalog.by_season()
    return render_template("catalog.html", seasons=grouped, total=len(catalog.episodes()))


@app.get("/capitulo/<int:season>/<int:number>")
def episode_page(season: int, number: int):
    ep = catalog.get(season, number) or abort(404)
    prev_ep, next_ep = catalog.neighbours(ep)
    return render_template("episode.html", ep=ep, stills=catalog.stills(ep), prev_ep=prev_ep, next_ep=next_ep)


@app.get("/api/aleatorio")
def api_random():
    first, last = season_bounds()
    ep = catalog.random(
        request.args.get("desde", first, type=int),
        request.args.get("hasta", last, type=int),
        request.args.get("nota", 0, type=float),
    )
    if ep is None:
        return jsonify(error="No hay capítulos con esos filtros."), 404
    return jsonify(episode_payload(ep))


@app.get("/api/capitulo/<int:season>/<int:number>")
def api_episode(season: int, number: int):
    ep = catalog.get(season, number) or abort(404)
    return jsonify(episode_payload(ep))


@app.get("/api/disney-links")
def api_disney_links_status():
    """Lo consulta el userscript para comprobar que la app está arrancada."""
    episodes = catalog.episodes()
    return jsonify(total=sum(1 for e in episodes if e.disney_direct), episodes=len(episodes))


@app.post("/api/disney-links")
def api_disney_links():
    """Recibe los enlaces que captura el userscript mientras navegas por Disney+."""
    items = request.get_json(silent=True)
    if not isinstance(items, list) or not all(isinstance(i, dict) for i in items):
        return jsonify(error="Se esperaba una lista de capítulos."), 400
    return jsonify(catalog.save_disney_links(items))


@app.errorhandler(404)
def not_found(_):
    return render_template("error.html", error=None, not_found=True), 404


def main() -> None:
    parser = argparse.ArgumentParser(description="Capítulo aleatorio de Los Simpson")
    parser.add_argument("--actualizar", action="store_true", help="vuelve a descargar la lista de capítulos y sale")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    if args.actualizar:
        print(f"Descargando capítulos desde {catalog.source.label}...")
        print(f"Listo: {catalog.refresh()} capítulos.")
        return
    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()
