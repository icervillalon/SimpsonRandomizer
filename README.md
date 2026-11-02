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

### Capturar los enlaces directos mientras navegas

El userscript `static/simpson-randomizer.user.js` lee los enlaces de cada capítulo en la página de la serie de Disney+ y los guarda en la app:

1. Instala la extensión [Tampermonkey](https://www.tampermonkey.net/) o Violentmonkey en tu navegador.
2. Con la app arrancada, abre <http://127.0.0.1:5000/static/simpson-randomizer.user.js> (también está enlazado al pie de la app) y acepta la instalación.
3. Entra en Disney+ con tu cuenta, abre Los Simpson y ve cambiando de temporada en el selector. Un recuadro amarillo abajo a la derecha indica cuántos capítulos ha visto y cuántos enlaces hay guardados.

Los enlaces se guardan en `data/disney_links.json` y la app los usa al momento: el botón **Ver en Disney+** pasa a abrir ese capítulo. Si Disney+ numera algún capítulo distinto que TMDB, se asocia por el título.

Si la app no escucha en el puerto 5000, cambia `APP_URL` al principio del script. Si el recuadro no detecta capítulos, usa la opción **Copiar diagnóstico** del menú de Tampermonkey para hacer debugging del script.

También puedes añadir enlaces a mano en `data/disney_links.json`:

```json
{
  "S05E19": "https://www.disneyplus.com/es-es/play/..."
}
```

## Estructura

| Archivo | Qué hace |
| --- | --- |
| `app.py` | Servidor Flask: ruleta (`/`), catálogo (`/capitulos`), ficha (`/capitulo/<t>/<e>`) y API JSON (`/api/aleatorio`, `/api/disney-links`). |
| `episodes.py` | Descarga los capítulos desde TMDB o TVmaze, los guarda en caché y los consulta. |
| `templates/` | Páginas HTML (Jinja). |
| `static/` | Estilos, JavaScript y el icono del dónut. |
| `data/disney_links.json` | Enlaces directos a capítulos de Disney+. |
| `static/simpson-randomizer.user.js` | Userscript que captura esos enlaces mientras navegas por Disney+. |

Proyecto personal sin relación con Disney, 20th Television ni Gracie Films. Este producto usa la API de TMDB, pero no está respaldado ni certificado por TMDB.
