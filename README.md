<div align="center">
  <img src="logo.png" alt="Re:Subnetting Logo" width="220">
  <h1>Re:Subnetting</h1>
  <p><strong>Laboratorio web interactivo para el cálculo, práctica binaria y validación de direccionamiento IPv4 (Classful & CIDR).</strong></p>

  ![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
  ![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
  ![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
  ![License](https://img.shields.io/badge/Uso-Académico-f07828?style=for-the-badge)
</div>

---

## Descripción general

**Re:Subnetting** es una herramienta académica diseñada para estudiantes y entusiastas de redes de computadoras. Permite resolver ejercicios de división de subredes IPv4 desde cero, practicar la manipulación de bits en la máscara de subred, visualizar rangos de direcciones en tiempo real y autoevaluar los resultados obtenidos.

El sistema está construido sin dependencias externas, ofreciendo una interfaz oscura de alto contraste (*Dark Mode*) optimizada tanto para el estudio en pantalla como para la exportación limpia a documentos PDF.

---

## Modos de operación

El laboratorio cuenta con un selector global en la parte superior que cambia el comportamiento de toda la interfaz:

1. **Modo Manual (Práctica y Autoevaluación):**
   * El usuario ingresa sus propios cálculos (Clase, MSA, NTS, NTSU, NTH, NTHU, NBT) y responde las preguntas del cuestionario.
   * Al presionar **"Comprobar respuestas"**, el sistema evalúa cada campo de forma independiente, resaltando en **verde** los aciertos y en **rojo** los errores, mostrando un desglose detallado de calificación (`Clase 1/1`, `Cálculos 6/6`, `Preguntas 4/4`).
2. **Modo Automático (Resolución y Estudio):**
   * Calcula instantáneamente todos los parámetros de red conforme se escriben los datos.
   * Despliega un **procedimiento paso a paso** explicando la lógica matemática detrás de la clase detectada, los bits prestados, el salto de red y los hosts disponibles.

---

## Desglose de módulos del laboratorio

La aplicación está dividida en **6 secciones secuenciales** que guían el flujo de resolución de cualquier problema de redes:

### 01. Datos del problema
Permite configurar la dirección IPv4 base (con validación estricta de octetos y rechazo automático de clases D/E o primer octeto en `0`) y elegir entre **4 modalidades de cálculo**:
* **Subredes útiles (`NSU`):** Calcula los bits mínimos necesarios para cubrir las subredes solicitadas, conservando al menos 2 bits para hosts.
* **Hosts útiles (`NHU`):** Reserva los bits de host necesarios por subred y asigna el resto a subredes.
* **Ambos (`NSU + NHU`):** Verifica matemáticamente si ambos requisitos caben simultáneamente dentro de la porción de host de la clase IP.
* **Notación CIDR (`/n`):** Analiza directamente una longitud de prefijo específica (ej. `/26`, `/28`) sobre la clase correspondiente.

### 02. Tabla de clases IP
Tabla de referencia rápida integrada con los rangos del primer octeto (`1–127` Clase A, `128–191` Clase B, `192–223` Clase C, además de D y E) y sus respectivas Máscaras por Defecto (**MSD**).

### 03. Lo que pide el ejercicio
* En **Modo Manual**, al seleccionar la clase IP se autocompleta la **MSD** como ayuda visual, dejando los 7 parámetros restantes listos para resolver.
* En **Modo Automático**, presenta tarjetas de resultados destacando la **MSA** y los **NBT**, acompañadas de la guía paso a paso.

### 04. Parte práctica: Máscara en binario y Calculadora $2^n$
* **Constructor de máscara interactivo:** Muestra los 32 bits divididos en 4 octetos con sus pesos binarios (`128, 64, 32, 16, 8, 4, 2, 1`). Los bits de red por defecto están bloqueados y el estudiante puede encender o apagar los bits disponibles para ver cómo cambia el valor decimal de cada octeto y el prefijo CIDR en tiempo real.
* **Calculadora rápida $2^n$:** Widget integrado que calcula al instante el total de combinaciones ($2^n$) y el total útil ($2^n - 2$) para cualquier exponente entre `0` y `30`.

### 05. Tabla de direcciones dinámica (Copiado a 1 clic)
Genera automáticamente el desglose de subredes con su número de índice, dirección de red, dirección de difusión (*Broadcast*), rango de hosts, direcciones asignables y estado (**Útil** o **Reservada**).
* **Controles de filtrado:** Permite elegir en qué subred iniciar, cuántas filas generar y filtrar para mostrar **únicamente subredes útiles**.
* **Copiado instantáneo al portapapeles:** Al hacer **1 clic** sobre cualquier dirección IP, rango de hosts o máscara construida, el valor se copia automáticamente al portapapeles mostrando una confirmación visual (`¡Copiado!`), agilizando el llenado del cuestionario.

### 06. Cuestionario dinámico
Genera 4 preguntas específicas sobre subredes útiles personalizables (rango de hosts, dirección de red, broadcast y direcciones asignables), ajustando dinámicamente el límite máximo permitido según el total de subredes útiles (`NTSU`) del ejercicio activo.

---

## Características adicionales

* **Exportación inteligente a PDF (`@media print`):**
  * Al hacer clic en **"Imprimir / Guardar PDF"**, la hoja de estilos oculta la barra superior, botones, controles y el reproductor de música, adaptando el diseño a fondo blanco sobre papel A4.
  * Además, filtra automáticamente la **Tabla de direcciones (Sección 05)** para imprimir **exclusivamente** las subredes que fueron consultadas en las preguntas de la Sección 06, evitando generar decenas de páginas innecesarias.
* **Mini reproductor de audio integrado:**
  * Reproductor flotante en la esquina inferior derecha con lista de reproducción local, control de volumen, silencio y auto-minimizado tras 5 segundos de inactividad (guardando el estado y volumen en `localStorage`).

---

## Fórmulas implementadas

El motor de cálculo en `app.js` aplica la convención académica estándar (**RFC 950**, excluyendo la subred cero y la subred de broadcast):

| Parámetro | Sigla | Fórmula |
| :--- | :---: | :--- |
| **No. Total de Subredes** | `NTS` | $2^{\text{NBT}}$ |
| **No. Total de Subredes Útiles** | `NTSU` | $2^{\text{NBT}} - 2$ |
| **No. Total de Hosts** | `NTH` | $2^{\text{Bits de Host}}$ |
| **No. Total de Hosts Útiles** | `NTHU` | $2^{\text{Bits de Host}} - 2$ |
| **Salto de red (Bloque)** | `Salto` | $2^{\text{Bits de Host}}$ |

---

## Estructura del repositorio

```text
Re-Subnetting/
├── index.html      # Estructura semántica del laboratorio (Secciones 01 a 06) y accesibilidad ARIA
├── styles.css      # Sistema de diseño oscuro, responsive design y reglas de impresión A4
├── app.js          # Motor matemático IPv4, validación de respuestas, tabla dinámica y reproductor
├── logo.png        # Logotipo principal de la aplicación
└── audio/          # Pistas MP3 para el reproductor de fondo
    ├── So-Scandalous.mp3
    ├── OH-TENGO-SUERTE.mp3
    └── Re-Re.mp3
