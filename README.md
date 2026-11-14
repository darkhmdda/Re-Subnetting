```markdown
# Re:Subnetting

Herramienta web interactiva diseñada para resolver, practicar y validar ejercicios de direccionamiento IPv4 (subnetting classful y notación CIDR) paso a paso.

---

## Características principales

* **Modos de resolución duales:**
  * **Modo Manual:** Permite completar los cálculos paso a paso y comprobar los resultados de forma automática con retroalimentación visual (verde/rojo).
  * **Modo Automático:** Calcula instantáneamente todos los parámetros de red y despliega el procedimiento detallado de resolución.
* **Tipos de ejercicios soportados:**
  * Subredes útiles requeridas (**NSU**).
  * Hosts útiles requeridos por subred (**NHU**).
  * Ambos requisitos simultáneos (**NSU + NHU**).
  * Notación **CIDR** directa (`/n`).
* **Práctica interactiva de máscara binaria:**
  * Construcción bit a bit de la máscara de subred sobre los 4 octetos.
  * Calculadora rápida integrada de potencias de dos (`2^n` y `2^n - 2`).
* **Tabla de direcciones dinámica con copiado a 1 clic:**
  * Generación automática de subredes (dirección de red, broadcast, rango de hosts y direcciones asignables).
  * Filtro para mostrar únicamente subredes útiles.
  * **Copiado instantáneo:** Haz clic en cualquier dirección IP, rango o máscara resultante para copiarlo directamente al portapapeles.
* **Cuestionario de validación:**
  * Cuatro preguntas dinámicas basadas en subredes útiles específicas con validación inmediata.
* **Exportación limpia a PDF:**
  * Hoja de estilos optimizada para impresión (`@media print`) que oculta controles innecesarios y filtra la tabla de direcciones exclusivamente a las subredes consultadas en el cuestionario.
* **Mini reproductor de audio integrado:**
  * Reproductor flotante colapsable con control de volumen y lista de reproducción de fondo.

---

## Estructura del proyecto

```text
Re-Subnetting/
├── index.html      # Estructura semántica del laboratorio y controles
├── styles.css      # Estilos dark-mode, diseño responsivo y reglas de impresión PDF
├── app.js          # Lógica de cálculo IPv4, validación, tabla dinámica y audio
├── logo.png        # Identidad visual de la aplicación
└── audio/          # Pistas de audio para el reproductor integrado
    ├── So-Scandalous.mp3
    ├── OH-TENGO-SUERTE.mp3
    └── Re-Re.mp3

```

---

## Tecnologías utilizadas

* **HTML5:** Maquetación semántica y accesible (atributos ARIA).
* **CSS3:** Variables personalizadas (tema oscuro), CSS Grid, Flexbox y media queries para dispositivos móviles e impresión.
* **JavaScript (Vanilla ES6+):** Manipulación del DOM, operaciones bit a bit para cálculos de red IPv4, API del portapapeles (`navigator.clipboard`) y persistencia de preferencias en `localStorage`.

---

## Instalación y uso local

No requiere dependencias externas ni servidores backend para funcionar.

1. Clona este repositorio:
```bash
git clone [https://github.com/tu-usuario/Re-Subnetting.git](https://github.com/tu-usuario/Re-Subnetting.git)

```


2. Abre la carpeta del proyecto y ejecuta `index.html` directamente en tu navegador web preferido (o utiliza una extensión como *Live Server* en VS Code).

---

## Nota académica

Este laboratorio aplica por defecto la convención histórica **RFC 950**, la cual excluye la primera subred (subred cero) y la última subred (subred de todos unos) del conteo de subredes útiles (`NTSU = 2^n - 2`).

---

Desarrollado por **drk**.

```

```
