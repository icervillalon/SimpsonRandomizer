# SimpsonRandomizer

Aplicación web ligera en Python (Flask) que elige un capítulo aleatorio de **Los Simpson** dentro del rango de temporadas que elijas y te muestra su título en español, capturas, sinopsis y un enlace para verlo en Disney+. También incluye un catálogo completo con buscador.

## Puesta en marcha

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env        # y rellena TMDB_API_KEY (ver abajo)
.venv/bin/python app.py
```

Abre <http://127.0.0.1:5000>.

La primera carga descarga la lista de capítulos y la guarda en `data/cache/`. Se renueva sola cada semana; para forzarla:

```bash
.venv/bin/python app.py --actualizar
```

## Datos en español: clave de TMDB

Los títulos, las sinopsis y las capturas en español salen de [The Movie Database (TMDB)](https://www.themoviedb.org/). La clave es gratuita:

1. Crea una cuenta en themoviedb.org.
2. Ve a *Ajustes → API* y solicita una clave de uso personal.
3. Copia la **API Key** (o el **API Read Access Token**, sirve cualquiera de los dos) en `TMDB_API_KEY` dentro de `.env`.

`SIMPSONS_LANG` elige el doblaje de los títulos: `es-ES` (España, por defecto) o `es-MX` (Latinoamérica).

Si no hay clave, la app funciona igualmente con datos de [TVmaze](https://www.tvmaze.com/), pero en inglés y con una sola captura por capítulo.

## Enlaces a Disney+

Disney+ no publica direcciones fijas para cada capítulo, así que el botón **Ver en Disney+** abre la página de la serie y la ficha te indica la temporada y el episodio que tienes que elegir.

Si quieres que un capítulo concreto abra directamente su reproducción, copia su enlace desde Disney+ y añádelo en `data/disney_links.json`:

```json
{
  "S05E19": "https://www.disneyplus.com/es-es/play/..."
}
```

## Estructura

| Archivo | Qué hace |
| --- | --- |
| `app.py` | Servidor Flask: ruleta (`/`), catálogo (`/capitulos`), ficha (`/capitulo/<t>/<e>`) y API JSON (`/api/aleatorio`). |
| `episodes.py` | Descarga los capítulos desde TMDB o TVmaze, los guarda en caché y los consulta. |
| `templates/` | Páginas HTML (Jinja). |
| `static/` | Estilos, JavaScript y el icono del dónut. |
| `data/disney_links.json` | Enlaces directos opcionales a capítulos de Disney+. |

Proyecto personal sin relación con Disney, 20th Television ni Gracie Films. Este producto usa la API de TMDB, pero no está respaldado ni certificado por TMDB.
