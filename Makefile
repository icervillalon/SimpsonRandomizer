# Atajos para la app web de Python. Ejecuta `make help` para ver todos.

VENV   ?= .venv
PYTHON := $(VENV)/bin/python
HOST   ?= 127.0.0.1
PORT   ?= 5000

.DEFAULT_GOAL := run
.PHONY: help install run debug actualizar

help: ## Muestra esta ayuda
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  make %-11s %s\n", $$1, $$2}'

# El entorno se rehace solo si cambia requirements.txt.
$(VENV)/.installed: requirements.txt
	python3 -m venv $(VENV)
	$(PYTHON) -m pip install -q -r requirements.txt
	@touch $@

install: $(VENV)/.installed ## Crea el entorno virtual e instala las dependencias

run: install ## Arranca la app (objetivo por defecto; cambia el puerto con PORT=8080)
	@test -f .env || echo "Aviso: no hay .env, los datos saldrán en inglés (copia .env.example y pon tu TMDB_API_KEY)."
	$(PYTHON) app.py --host $(HOST) --port $(PORT)

debug: install ## Arranca con recarga automática al cambiar el código
	$(PYTHON) app.py --host $(HOST) --port $(PORT) --debug

actualizar: install ## Vuelve a descargar la lista de capítulos
	$(PYTHON) app.py --actualizar
