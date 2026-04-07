// Pre-Labeling con SAM 2 — Memoria Técnica I+D
// Genera el documento Word con estándar europeo de proyectos de investigación
"use strict";
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
  TableOfContents,
} = require("docx");
const fs = require("fs");

// ─── Paleta de colores ────────────────────────────────────────────────────────
const C = {
  azul:     "1F4E79",   // azul oscuro encabezados
  azulMed:  "2E75B6",   // azul medio subtítulos
  azulClaro:"D6E4F0",   // azul claro fondo tabla header
  grisClaro:"F2F2F2",   // gris filas alternas
  blanco:   "FFFFFF",
  negro:    "000000",
  texto:    "1A1A1A",   // texto principal
  grisTexto:"595959",   // texto secundario
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PAGE_W = 11906;  // A4 twips
const PAGE_H = 16838;
const MARGIN = 1134;   // ~2 cm
const CONTENT_W = PAGE_W - 2 * MARGIN; // 9638 twips

const border = (color = "CCCCCC", sz = 4) => ({ style: BorderStyle.SINGLE, size: sz, color });
const noBorder = () => ({ style: BorderStyle.NONE, size: 0, color: "FFFFFF" });
const allBorders = (color, sz) => ({ top: border(color,sz), bottom: border(color,sz), left: border(color,sz), right: border(color,sz) });
const noBorders = () => ({ top: noBorder(), bottom: noBorder(), left: noBorder(), right: noBorder() });

const cell = (text, opts = {}) => {
  const {
    bold = false, color = C.negro, bg = null, align = AlignmentType.LEFT,
    w = null, colspan = 1, valign = VerticalAlign.CENTER, fontSize = 20,
    borders = allBorders("CCCCCC", 4), italic = false,
  } = opts;
  return new TableCell({
    columnSpan: colspan,
    verticalAlign: valign,
    borders,
    shading: bg ? { fill: bg, type: ShadingType.CLEAR } : undefined,
    width: w ? { size: w, type: WidthType.DXA } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text, bold, color, size: fontSize, font: "Arial", italics: italic })],
    })],
  });
};

const hCell = (text, w = null) => cell(text, { bold: true, color: C.blanco, bg: C.azul, w, fontSize: 20 });
const hCellMed = (text, w = null) => cell(text, { bold: true, color: C.blanco, bg: C.azulMed, w, fontSize: 19 });

const p = (text, opts = {}) => {
  const {
    bold = false, size = 22, color = C.texto, spacing = { after: 160 },
    align = AlignmentType.LEFT, italic = false,
  } = opts;
  return new Paragraph({
    alignment: align,
    spacing,
    children: [new TextRun({ text, bold, color, size, font: "Arial", italics: italic })],
  });
};

const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  pageBreakBefore: true,
  spacing: { before: 0, after: 240 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.azul, space: 1 } },
  children: [new TextRun({ text, bold: true, color: C.azul, size: 36, font: "Arial" })],
});

const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 280, after: 120 },
  children: [new TextRun({ text, bold: true, color: C.azulMed, size: 28, font: "Arial" })],
});

const h3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 200, after: 80 },
  children: [new TextRun({ text, bold: true, color: C.texto, size: 24, font: "Arial" })],
});

const bullet = (text, level = 0) => new Paragraph({
  numbering: { reference: "bullets", level },
  spacing: { after: 80 },
  children: [new TextRun({ text, size: 22, font: "Arial", color: C.texto })],
});

const numbered = (text, level = 0) => new Paragraph({
  numbering: { reference: "numbers", level },
  spacing: { after: 80 },
  children: [new TextRun({ text, size: 22, font: "Arial", color: C.texto })],
});

const sep = () => new Paragraph({ spacing: { after: 80 }, children: [new TextRun("")] });

const codeBlock = (lines) => {
  return lines.map(line => new Paragraph({
    spacing: { after: 0, before: 0 },
    shading: { fill: "F5F5F5", type: ShadingType.CLEAR },
    indent: { left: 360 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: C.azulMed, space: 2 } },
    children: [new TextRun({ text: line, font: "Courier New", size: 18, color: "2F4F4F" })],
  }));
};

const infoBox = (lines, bg = C.azulClaro) => lines.map((line, i) => new Paragraph({
  spacing: { after: i === lines.length - 1 ? 160 : 0, before: i === 0 ? 160 : 0 },
  shading: { fill: bg, type: ShadingType.CLEAR },
  indent: { left: 240, right: 240 },
  children: [new TextRun({ text: line, size: 20, font: "Arial", color: C.texto, bold: line.startsWith("►") })],
}));

const makeTable = (colWidths, rows) => new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: colWidths,
  rows,
});

// ─── Contenido del documento ──────────────────────────────────────────────────

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 360 } } } },
        ],
      },
      {
        reference: "numbers",
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        ],
      },
    ],
  },
  styles: {
    default: {
      document: { run: { font: "Arial", size: 22, color: C.texto } },
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: C.azul },
        paragraph: { spacing: { before: 0, after: 240 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: C.azulMed },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 },
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: C.texto },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 },
      },
    ],
  },
  sections: [
    // ══════════════════════════════════════════════════════════════════════════
    // PORTADA
    // ══════════════════════════════════════════════════════════════════════════
    {
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      children: [
        sep(), sep(), sep(), sep(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 0 },
          shading: { fill: C.azul, type: ShadingType.CLEAR },
          children: [new TextRun({ text: " ", size: 8 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 0 },
          shading: { fill: C.azul, type: ShadingType.CLEAR },
          children: [new TextRun({ text: "MEMORIA TÉCNICA DEL SISTEMA", bold: true, size: 32, font: "Arial", color: C.blanco })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 0 },
          shading: { fill: C.azul, type: ShadingType.CLEAR },
          children: [new TextRun({ text: " ", size: 8 })],
        }),
        sep(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [new TextRun({ text: "Pre-Labeling con SAM 2", bold: true, size: 52, font: "Arial", color: C.azul })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: "Herramienta de Pre-Etiquetado Automatizado de Video Industrial", size: 28, font: "Arial", color: C.azulMed, italics: true })],
        }),
        sep(), sep(),
        makeTable(
          [3200, 5438],
          [
            new TableRow({ children: [hCell("Campo", 3200), hCell("Detalle", 5438)] }),
            new TableRow({ children: [cell("Título del proyecto", { bold: true, bg: C.grisClaro, w: 3200 }), cell("Pre-Labeling con SAM 2 — Sistema automatizado de anotación de vídeo industrial", { w: 5438 })] }),
            new TableRow({ children: [cell("Versión del documento", { bold: true, bg: C.grisClaro, w: 3200 }), cell("v3.0 — Marzo 2026", { w: 5438 })] }),
            new TableRow({ children: [cell("Clasificación", { bold: true, bg: C.grisClaro, w: 3200 }), cell("Confidencial — Uso interno restringido", { w: 5438 })] }),
            new TableRow({ children: [cell("Estado del proyecto", { bold: true, bg: C.grisClaro, w: 3200 }), cell("Activo — En desarrollo iterativo", { w: 5438 })] }),
            new TableRow({ children: [cell("Tipo de actividad", { bold: true, bg: C.grisClaro, w: 3200 }), cell("Investigación Aplicada (I+D) — Herramienta interna para pipeline de visión artificial", { w: 5438 })] }),
            new TableRow({ children: [cell("Área tecnológica", { bold: true, bg: C.grisClaro, w: 3200 }), cell("Inteligencia Artificial · Visión por Computador · MLOps", { w: 5438 })] }),
          ]
        ),
        sep(), sep(), sep(), sep(), sep(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 0 },
          children: [new TextRun({ text: "DOCUMENTO PRIVADO Y CONFIDENCIAL", bold: true, size: 18, font: "Arial", color: "C00000" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 0 },
          children: [new TextRun({ text: "Este documento contiene informacion tecnica y estrategica de caracter reservado.", size: 18, font: "Arial", color: C.grisTexto, italics: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 0 },
          children: [new TextRun({ text: "Queda prohibida su reproduccion o divulgacion sin autorizacion expresa.", size: 18, font: "Arial", color: C.grisTexto, italics: true })],
        }),
      ],
    },

    // ══════════════════════════════════════════════════════════════════════════
    // CUERPO DEL DOCUMENTO
    // ══════════════════════════════════════════════════════════════════════════
    {
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, right: MARGIN, bottom: 1400, left: MARGIN },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.azulMed, space: 1 } },
              spacing: { after: 80 },
              children: [
                new TextRun({ text: "Pre-Labeling con SAM 2 — Memoria Tecnica  |  ", size: 16, font: "Arial", color: C.grisTexto }),
                new TextRun({ text: "v3.0 · Marzo 2026", size: 16, font: "Arial", color: C.azulMed, bold: true }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.azulMed, space: 1 } },
              children: [
                new TextRun({ text: "Pagina ", size: 16, font: "Arial", color: C.grisTexto }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, font: "Arial", color: C.azulMed }),
                new TextRun({ text: " de ", size: 16, font: "Arial", color: C.grisTexto }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: "Arial", color: C.azulMed }),
                new TextRun({ text: "  |  CONFIDENCIAL", size: 16, font: "Arial", color: "C00000" }),
              ],
            }),
          ],
        }),
      },
      children: [

        // ── ÍNDICE ──────────────────────────────────────────────────────────
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          pageBreakBefore: false,
          spacing: { before: 0, after: 240 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.azul, space: 1 } },
          children: [new TextRun({ text: "Índice de Contenidos", bold: true, color: C.azul, size: 36, font: "Arial" })],
        }),
        new TableOfContents("Indice de Contenidos", {
          hyperlink: true,
          headingStyleRange: "1-3",
          stylesWithLevels: [
            { styleName: "Heading1", level: 1 },
            { styleName: "Heading2", level: 2 },
            { styleName: "Heading3", level: 3 },
          ],
        }),

        // ══════════════════════════════════════════════════════════════════
        // 1. RESUMEN EJECUTIVO
        // ══════════════════════════════════════════════════════════════════
        h1("1. Resumen Ejecutivo"),
        p("El presente documento constituye la Memoria Tecnica del sistema de Pre-Etiquetado Automatizado de Video Industrial basado en SAM 2 (Segment Anything Model 2), desarrollado como herramienta interna de Investigacion y Desarrollo en el marco de proyectos de vision artificial industrial."),
        sep(),
        p("El sistema resuelve el cuello de botella critico del etiquetado de datos en el ciclo de experimentacion: la generacion manual de anotaciones de segmentacion de instancia en video industrial, que con herramientas convencionales requeria varias horas por video de 10 segundos. La herramienta reduce ese tiempo a 10-15 minutos mediante la combinacion de:"),
        bullet("Segmentacion zero-shot de alta precision mediante SAM 2 (Meta AI)"),
        bullet("Propagacion automatica de mascaras a todos los frames del video"),
        bullet("Interfaz web minimalista optimizada para el flujo de revision y aprobacion"),
        bullet("Pipeline de exportacion directa a Google Cloud Storage en formato YOLO Segmentation"),
        sep(),
        ...infoBox([
          "► IMPACTO MEDIDO EN PRODUCCION",
          "",
          "Reduccion del tiempo de etiquetado: de ~4 horas a ~15 minutos por video de 10 s (reduccion del 94%).",
          "263 frames anotados y subidos a GCS en formato YOLO-Seg con 765 anotaciones aprobadas.",
          "Pipeline completamente cerrado: desde el video bruto hasta el dataset en GCS listo para entrenamiento.",
        ], C.azulClaro),

        // ══════════════════════════════════════════════════════════════════
        // 2. CONTEXTO Y MOTIVACIÓN
        // ══════════════════════════════════════════════════════════════════
        h1("2. Contexto y Motivacion de la Investigacion"),
        h2("2.1 El Problema del Etiquetado de Video Industrial"),
        p("El entrenamiento de modelos de vision artificial supervisados requiere grandes volumenes de datos anotados con precision. En contextos de inspeccion industrial, vigilancia y seguimiento de objetos en video, el proceso de etiquetado manual presenta retos de escala y calidad que constituyen el principal cuello de botella operativo:"),
        sep(),
        makeTable([3000, 5638], [
          new TableRow({ children: [hCell("Dimension del problema", 3000), hCell("Descripcion cuantificada", 5638)] }),
          new TableRow({ children: [cell("Volumen de datos", { bg: C.grisClaro, w: 3000 }), cell("Un video de 30 fps durante 10 segundos contiene 300 frames individuales, cada uno con potencialmente multiples objetos a segmentar con precision de pixel", { w: 5638 })] }),
          new TableRow({ children: [cell("Coste temporal", { bg: C.grisClaro, w: 3000 }), cell("Un experto tarda 3-6 horas en anotar con precision de pixel un video corto de 10 s con 2-3 categorias de objetos", { w: 5638 })] }),
          new TableRow({ children: [cell("Consistencia", { bg: C.grisClaro, w: 3000 }), cell("El etiquetado manual entre diferentes operarios en sesiones distintas produce variaciones de vocabulario y precision que degradan la calidad del dataset de entrenamiento", { w: 5638 })] }),
          new TableRow({ children: [cell("Trazabilidad temporal", { bg: C.grisClaro, w: 3000 }), cell("La misma instancia de un objeto debe ser rastreable frame a frame con identidad consistente; el etiquetado manual por frame no garantiza esta coherencia temporal", { w: 5638 })] }),
          new TableRow({ children: [cell("Fatiga cognitiva", { bg: C.grisClaro, w: 3000 }), cell("La repetitividad del proceso genera errores progresivos en jornadas largas de etiquetado, especialmente en contornos complejos", { w: 5638 })] }),
        ]),
        sep(),
        h2("2.2 La Oportunidad: Modelos de Segmentacion Zero-Shot"),
        p("La aparicion de modelos de segmentacion de proposito general entrenados a gran escala, capaces de operar sin ajuste especifico al dominio (zero-shot), abre un nuevo paradigma de etiquetado semi-automatico:"),
        sep(),
        numbered("El operario, con conocimiento de dominio, hace un unico clic sobre el objeto de interes en el frame mas representativo."),
        numbered("El modelo de IA genera automaticamente una mascara de segmentacion a nivel de pixel con precision superior a la manual en la mayoria de casos."),
        numbered("El modelo propaga esa mascara a todos los frames restantes del video, manteniendo la identidad del objeto a lo largo del tiempo."),
        numbered("El operario revisa el resultado mediante una interfaz de filmstrip y aprueba o corrige las excepciones."),
        sep(),
        p("Este paradigma transforma el rol del operario: de ejecutor de tareas repetitivas a supervisor de calidad, reduciendo el trabajo humano de horas a minutos y mejorando la consistencia del dataset resultante."),
        h2("2.3 Objetivos de I+D"),
        p("El proyecto persigue los siguientes objetivos de investigacion aplicada:"),
        bullet("OBJ-1: Integrar SAM 2 como servicio de inferencia en tiempo real sobre GPU propia (on-premise), eliminando dependencias de APIs externas."),
        bullet("OBJ-2: Implementar un mecanismo de propagacion temporal de mascaras que mantenga la identidad de instancia a lo largo del video."),
        bullet("OBJ-3: Construir un pipeline cerrado desde el video bruto hasta el dataset en Google Cloud Storage en formato YOLO Segmentation, sin pasos manuales de transferencia de datos."),
        bullet("OBJ-4: Desarrollar un sistema de control de vocabulario de etiquetas por proyecto que garantice la consistencia del dataset entre sesiones y operarios."),
        bullet("OBJ-5: Ofrecer una interfaz web de revision y aprobacion que minimice la friccion del operario y maximice el throughput de validacion."),

        // ══════════════════════════════════════════════════════════════════
        // 3. ESTADO DEL ARTE Y DIFERENCIACION
        // ══════════════════════════════════════════════════════════════════
        h1("3. Estado del Arte y Diferenciacion Tecnologica"),
        h2("3.1 Herramientas de Anotacion Existentes"),
        p("CVAT (Computer Vision Annotation Tool), desarrollado por Intel y mantenido como proyecto open-source, es la herramienta de referencia industrial para anotacion de datasets de vision artificial. La comparativa directa revela una diferencia fundamental de filosofia y alcance:"),
        sep(),
        makeTable([2800, 3100, 3738], [
          new TableRow({ children: [hCell("Dimension", 2800), hCell("CVAT (referencia)", 3100), hCell("Pre-Labeling SAM 2 (este sistema)", 3738)] }),
          new TableRow({ children: [cell("Propósito", { bg: C.grisClaro, w: 2800 }), cell("Herramienta generica de anotacion manual", { w: 3100 }), cell("Pre-etiquetado automatico mediante IA con GPU propia", { w: 3738 })] }),
          new TableRow({ children: [cell("Modelo de trabajo", { bg: C.grisClaro, w: 2800 }), cell("El operario dibuja cada anotacion manualmente", { w: 3100 }), cell("El operario hace un clic; la IA genera y propaga la mascara", { w: 3738 })] }),
          new TableRow({ children: [cell("Integracion con IA", { bg: C.grisClaro, w: 2800 }), cell("Opcional, requiere configuracion compleja (Nuclio serverless)", { w: 3100 }), cell("SAM 2 integrado nativamente, inferencia on-premise", { w: 3738 })] }),
          new TableRow({ children: [cell("Tipo de anotacion", { bg: C.grisClaro, w: 2800 }), cell("BBox, poligonos manuales, keypoints, tags", { w: 3100 }), cell("Segmentacion de instancia a nivel de pixel (mascara binaria + RLE)", { w: 3738 })] }),
          new TableRow({ children: [cell("Propagacion temporal", { bg: C.grisClaro, w: 2800 }), cell("Interpolacion lineal de bboxes entre keyframes", { w: 3100 }), cell("Propagacion semantica real frame a frame (SAM 2 VideoPredictor)", { w: 3738 })] }),
          new TableRow({ children: [cell("Exportacion a GCS", { bg: C.grisClaro, w: 2800 }), cell("No nativa (exportacion local unicamente)", { w: 3100 }), cell("Subida directa a Google Cloud Storage via Application Default Credentials", { w: 3738 })] }),
          new TableRow({ children: [cell("Control de vocabulario", { bg: C.grisClaro, w: 2800 }), cell("Por proyecto en la plataforma", { w: 3100 }), cell("Registro de etiquetas con auto-poblacion al aprobar anotaciones", { w: 3738 })] }),
          new TableRow({ children: [cell("Velocidad por objeto", { bg: C.grisClaro, w: 2800 }), cell("2-5 minutos por frame complejo (manual)", { w: 3100 }), cell("30 segundos por objeto en frame inicial + propagacion automatica", { w: 3738 })] }),
          new TableRow({ children: [cell("Curva de aprendizaje", { bg: C.grisClaro, w: 2800 }), cell("Alta — interfaz compleja, decenas de opciones", { w: 3100 }), cell("Baja — interfaz minimalista: clic → mascara → propagar → revisar", { w: 3738 })] }),
          new TableRow({ children: [cell("Infraestructura", { bg: C.grisClaro, w: 2800 }), cell("Servidor con Kubernetes o Docker Compose multi-servicio complejo", { w: 3100 }), cell("Un unico docker compose up sobre VM con GPU T4", { w: 3738 })] }),
        ]),
        sep(),
        h2("3.2 Por que la Herramienta Existente no es Suficiente"),
        p("CVAT es una excelente herramienta para el caso de uso general de anotacion colaborativa a gran escala. Sin embargo, presenta friccion estructural para el pipeline de I+D industrial especifico:"),
        sep(),
        h3("Limitacion 1: La propagacion de CVAT no es semantica"),
        p("CVAT interpola la posicion de una bounding box entre dos keyframes, pero no comprende la forma del objeto. Cuando el objeto rota, se deforma, cambia de escala o es parcialmente ocluido, la interpolacion produce bboxes incorrectas que requieren correccion manual frame a frame. SAM 2 en este sistema comprende la forma semantica del objeto y la reasigna correctamente en cada frame."),
        h3("Limitacion 2: Las mascaras de instancia requieren trazado manual"),
        p("El flujo de CVAT para crear poligonos precisos a nivel de pixel requiere que el operario trace el contorno punto a punto. En objetos industriales con bordes complejos, reflejos o variaciones de iluminacion, esto es extremadamente lento y dependiente de la pericia del operario. Este sistema genera la mascara automaticamente mediante inferencia SAM 2 en ~500 ms."),
        h3("Limitacion 3: El pipeline de datos requiere pasos manuales"),
        p("CVAT exporta datasets a disco local. En entornos de I+D donde la plataforma de entrenamiento consume datos desde Google Cloud Storage, esto introduce pasos manuales de descarga, reorganizacion y subida que son propensos a errores y ralentizan el ciclo de experimentacion. Este sistema exporta directamente a GCS con un unico boton."),

        // ══════════════════════════════════════════════════════════════════
        // 4. ARQUITECTURA DEL SISTEMA
        // ══════════════════════════════════════════════════════════════════
        h1("4. Arquitectura del Sistema"),
        h2("4.1 Vision General"),
        p("El sistema es una aplicacion web full-stack con arquitectura de microservicios orquestados mediante Docker Compose sobre una instancia de VM con GPU en Google Cloud Platform. Los componentes principales son:"),
        sep(),
        ...codeBlock([
          "┌─────────────────────────────────────────────────────────────────┐",
          "│                         OPERARIO                                │",
          "│    (experto de dominio con conocimiento del objeto/defecto)     │",
          "└────────────────────────────┬────────────────────────────────────┘",
          "                             │  Navegador web (HTTP)",
          "                             ▼",
          "┌─────────────────────────────────────────────────────────────────┐",
          "│                      Nginx (Proxy Inverso)                      │",
          "│  Enruta /api/* → Backend  |  /* → Frontend                     │",
          "└───────┬──────────────────────────────┬──────────────────────────┘",
          "        ▼                              ▼",
          "┌──────────────┐            ┌──────────────────────┐",
          "│   Frontend   │            │   Backend API         │",
          "│  React/Vite  │            │   FastAPI (Python)    │",
          "│   :5173      │            │   :8000               │",
          "└──────────────┘            └──────┬───────────────┘",
          "                                   │",
          "            ┌──────────────────────┼───────────────────────┐",
          "            ▼                      ▼                       ▼",
          "   ┌──────────────┐     ┌──────────────────┐   ┌──────────────────┐",
          "   │  PostgreSQL  │     │  Celery Worker   │   │  Redis (Broker)  │",
          "   │  (Metadatos) │     │  GPU T4          │   │  :6379           │",
          "   │  :5432       │     │  SAM 2 / Export  │   └──────────────────┘",
          "   └──────────────┘     └─────────┬────────┘",
          "                                  │",
          "                    ┌─────────────┴──────────────┐",
          "                    ▼                            ▼",
          "         ┌──────────────────┐         ┌────────────────────┐",
          "         │  Disco Pers.     │         │  Google Cloud      │",
          "         │  Frames JPEG     │         │  Storage (GCS)     │",
          "         └──────────────────┘         └────────────────────┘",
        ]),
        sep(),
        h2("4.2 Patrones Arquitectonicos Clave"),
        h3("4.2.1 Tareas Asincronas con Celery"),
        p("Las operaciones de larga duracion (propagacion de mascaras SAM 2 sobre GPU, exportacion y subida masiva a GCS) se ejecutan como tareas Celery en background. El endpoint HTTP devuelve un job_id inmediatamente (<200 ms) y el cliente hace polling al endpoint GET /jobs/{id} para consultar progreso y resultado. Este patron evita timeouts HTTP en operaciones que pueden durar varios minutos."),
        sep(),
        ...codeBlock([
          "POST /api/projects/8/export/gcs  →  {\"job_id\": 29}     [< 200 ms]",
          "GET  /api/jobs/29               →  {\"status\": \"running\", \"progress\": 44}",
          "GET  /api/jobs/29               →  {\"status\": \"running\", \"progress\": 78}",
          "GET  /api/jobs/29               →  {\"status\": \"success\", \"progress\": 100,",
          "                                    \"result\": {\"files_uploaded\": 755, ...}}",
        ]),
        sep(),
        h3("4.2.2 Inmutabilidad de Anotaciones (Non-Destructive)"),
        p("Las anotaciones originales creadas manualmente nunca se sobreescriben. La propagacion genera nuevas anotaciones con estado 'propagated' y referencia al ID de la anotacion origen (source_annotation_id). Esto permite trazabilidad completa y rollback selectivo."),
        h3("4.2.3 Vocabulario Controlado por Proyecto"),
        p("El registro de etiquetas (tabla project_labels) se auto-popula al aprobar anotaciones. La tabla tiene una restriccion UniqueConstraint(project_id, label_name) que garantiza no-duplicidad a nivel de base de datos. Al abrir la pantalla de anotacion, el operario ve las etiquetas ya confirmadas como chips de seleccion rapida."),

        // ══════════════════════════════════════════════════════════════════
        // 5. STACK TECNOLOGICO
        // ══════════════════════════════════════════════════════════════════
        h1("5. Stack Tecnologico Detallado"),
        h2("5.1 Backend — Python / FastAPI"),
        makeTable([2400, 2000, 800, 4438], [
          new TableRow({ children: [hCell("Componente", 2400), hCell("Tecnologia", 2000), hCell("Version", 800), hCell("Justificacion tecnica", 4438)] }),
          new TableRow({ children: [cell("Framework web", { bg: C.grisClaro, w: 2400 }), cell("FastAPI", { w: 2000 }), cell("0.111", { w: 800 }), cell("Alto rendimiento (ASGI), tipado fuerte con Pydantic, documentacion OpenAPI automatica, soporte nativo async/await", { w: 4438 })] }),
          new TableRow({ children: [cell("ORM y migraciones", { bg: C.grisClaro, w: 2400 }), cell("SQLAlchemy + Alembic", { w: 2000 }), cell("2.0 / 1.13", { w: 800 }), cell("ORM maduro con soporte para tipos modernos de Python; Alembic proporciona migraciones versionadas y reversibles", { w: 4438 })] }),
          new TableRow({ children: [cell("Base de datos", { bg: C.grisClaro, w: 2400 }), cell("PostgreSQL", { w: 2000 }), cell("15", { w: 800 }), cell("ACID, soporte JSON, transacciones, ampliamente soportado en entornos cloud. Persistencia de metadatos de proyectos, videos, frames y anotaciones", { w: 4438 })] }),
          new TableRow({ children: [cell("Cola de tareas", { bg: C.grisClaro, w: 2400 }), cell("Celery", { w: 2000 }), cell("5.4", { w: 800 }), cell("Estandar de facto para tareas asincronas en Python. Permite desacoplar la inferencia GPU (larga duracion) del ciclo request-response HTTP", { w: 4438 })] }),
          new TableRow({ children: [cell("Broker de mensajes", { bg: C.grisClaro, w: 2400 }), cell("Redis", { w: 2000 }), cell("7", { w: 800 }), cell("Bajo overhead, alta velocidad, almacenamiento de resultados de tareas. Actua como broker y backend de resultados para Celery", { w: 4438 })] }),
          new TableRow({ children: [cell("Modelo de IA", { bg: C.grisClaro, w: 2400 }), cell("SAM 2 (Meta AI)", { w: 2000 }), cell("1.0", { w: 800 }), cell("Estado del arte en segmentacion zero-shot para imagen y video. Capacidad VideoPredictor para propagacion temporal de mascaras", { w: 4438 })] }),
          new TableRow({ children: [cell("Framework ML", { bg: C.grisClaro, w: 2400 }), cell("PyTorch", { w: 2000 }), cell("2.x CUDA 11.8", { w: 800 }), cell("Backend de SAM 2, soporte GPU nativo, ecosistema maduro", { w: 4438 })] }),
          new TableRow({ children: [cell("Procesado de imagen", { bg: C.grisClaro, w: 2400 }), cell("OpenCV + Pillow", { w: 2000 }), cell("4.9 / 10", { w: 800 }), cell("Extraccion de frames del video (VideoCapture), calculo de contornos desde mascaras binarias (findContours), manipulacion de imagenes JPEG", { w: 4438 })] }),
          new TableRow({ children: [cell("Cloud Storage SDK", { bg: C.grisClaro, w: 2400 }), cell("google-cloud-storage", { w: 2000 }), cell("2.17.0", { w: 800 }), cell("SDK oficial GCS con soporte ADC (Application Default Credentials). La VM GCP autentica automaticamente sin claves explicitas", { w: 4438 })] }),
          new TableRow({ children: [cell("Servidor ASGI", { bg: C.grisClaro, w: 2400 }), cell("Uvicorn", { w: 2000 }), cell("0.30", { w: 800 }), cell("Servidor ASGI de alta performance para FastAPI, con modo --reload para desarrollo iterativo rapido", { w: 4438 })] }),
        ]),
        sep(),
        h2("5.2 Frontend — React / Vite"),
        makeTable([2400, 2000, 800, 4438], [
          new TableRow({ children: [hCell("Componente", 2400), hCell("Tecnologia", 2000), hCell("Version", 800), hCell("Justificacion tecnica", 4438)] }),
          new TableRow({ children: [cell("Framework UI", { bg: C.grisClaro, w: 2400 }), cell("React", { w: 2000 }), cell("18", { w: 800 }), cell("Composicion por componentes, ecosistema maduro, hooks para gestion de estado local", { w: 4438 })] }),
          new TableRow({ children: [cell("Bundler y servidor dev", { bg: C.grisClaro, w: 2400 }), cell("Vite", { w: 2000 }), cell("5", { w: 800 }), cell("Arranque instantaneo (< 1 s), Hot Module Replacement, build optimizado con rollup", { w: 4438 })] }),
          new TableRow({ children: [cell("Estado global", { bg: C.grisClaro, w: 2400 }), cell("Zustand", { w: 2000 }), cell("4", { w: 800 }), cell("Ligero, sin boilerplate, orientado a hooks. Gestiona el estado compartido: frame activo, anotaciones, etiquetas del proyecto, progreso de propagacion", { w: 4438 })] }),
          new TableRow({ children: [cell("Canvas interactivo", { bg: C.grisClaro, w: 2400 }), cell("Konva.js", { w: 2000 }), cell("9", { w: 800 }), cell("Canvas declarativo sobre HTML5 Canvas con soporte React. Renderiza mascaras de segmentacion, bounding boxes y permite interaccion de punto de clic", { w: 4438 })] }),
          new TableRow({ children: [cell("Enrutado", { bg: C.grisClaro, w: 2400 }), cell("React Router", { w: 2000 }), cell("6", { w: 800 }), cell("Estandar para SPA en React, rutas anidadas, navegacion programatica", { w: 4438 })] }),
          new TableRow({ children: [cell("Cliente HTTP", { bg: C.grisClaro, w: 2400 }), cell("Axios", { w: 2000 }), cell("1.7", { w: 800 }), cell("Interceptores, cancelacion de peticiones, manejo de errores centralizado, timeout configurable (5 min para uploads)", { w: 4438 })] }),
        ]),
        sep(),
        h2("5.3 Infraestructura"),
        makeTable([2400, 3000, 4238], [
          new TableRow({ children: [hCell("Componente", 2400), hCell("Tecnologia", 3000), hCell("Detalle", 4238)] }),
          new TableRow({ children: [cell("Plataforma cloud", { bg: C.grisClaro, w: 2400 }), cell("Google Cloud Platform", { w: 3000 }), cell("Compute Engine n1-standard-4 (4 vCPU, 15 GB RAM)", { w: 4238 })] }),
          new TableRow({ children: [cell("GPU", { bg: C.grisClaro, w: 2400 }), cell("NVIDIA Tesla T4", { w: 3000 }), cell("16 GB VRAM — inferencia SAM 2 y tasks Celery GPU", { w: 4238 })] }),
          new TableRow({ children: [cell("Sistema operativo", { bg: C.grisClaro, w: 2400 }), cell("Ubuntu 22.04 LTS + CUDA 12.8", { w: 3000 }), cell("Imagen DL Pytorch GCP con drivers NVIDIA preinstalados", { w: 4238 })] }),
          new TableRow({ children: [cell("Orquestacion", { bg: C.grisClaro, w: 2400 }), cell("Docker + Docker Compose", { w: 3000 }), cell("6 servicios: db, redis, backend, worker, frontend, nginx", { w: 4238 })] }),
          new TableRow({ children: [cell("Proxy inverso", { bg: C.grisClaro, w: 2400 }), cell("Nginx Alpine", { w: 3000 }), cell("Enruta /api/* al backend, /* al frontend, WebSocket HMR, timeout 300s", { w: 4238 })] }),
          new TableRow({ children: [cell("Almacenamiento frames", { bg: C.grisClaro, w: 2400 }), cell("Disco SSD persistente GCP", { w: 3000 }), cell("100 GB pd-ssd. Frames JPEG extraidos del video, persiste entre reinicios de VM", { w: 4238 })] }),
          new TableRow({ children: [cell("Almacenamiento datasets", { bg: C.grisClaro, w: 2400 }), cell("Google Cloud Storage", { w: 3000 }), cell("Destino final de la exportacion. Autenticacion via ADC (scope devstorage.read_write)", { w: 4238 })] }),
        ]),

        // ══════════════════════════════════════════════════════════════════
        // 6. MODULO DE IA: SAM 2
        // ══════════════════════════════════════════════════════════════════
        h1("6. Modulo de Inteligencia Artificial: SAM 2"),
        h2("6.1 Descripcion del Modelo"),
        p("SAM 2 (Segment Anything Model 2) es un modelo de segmentacion fundacional de proposito general desarrollado por Meta AI (2024). Sus caracteristicas tecnicas principales relevantes para este proyecto son:"),
        bullet("Arquitectura Hiera Transformer (jerarquica), con variantes desde 38 M hasta 224 M parametros"),
        bullet("Entrenado sobre SA-V dataset: 51.000 videos con 643.000 mascaras — el mayor dataset de segmentacion de video publico"),
        bullet("Capacidad image predictor: genera mascaras de segmentacion a partir de prompts (puntos, bboxes, mascaras) en una imagen estatica"),
        bullet("Capacidad video predictor: propaga mascaras iniciales a lo largo del video manteniendo la identidad de instancia"),
        bullet("Multi-mask output: genera multiples hipotesis de mascara con scores de confianza para puntos de clic ambiguos"),
        sep(),
        h2("6.2 Variantes del Modelo y Seleccion"),
        makeTable([2800, 1400, 1400, 4038], [
          new TableRow({ children: [hCell("Variante", 2800), hCell("VRAM", 1400), hCell("Velocidad", 1400), hCell("Uso recomendado", 4038)] }),
          new TableRow({ children: [cell("sam2_hiera_tiny", { bg: C.grisClaro, w: 2800 }), cell("4 GB", { w: 1400 }), cell("Muy rapida", { w: 1400 }), cell("Pruebas de integracion, GPU de baja capacidad", { w: 4038 })] }),
          new TableRow({ children: [cell("sam2_hiera_small", { bg: C.grisClaro, w: 2800 }), cell("6 GB", { w: 1400 }), cell("Rapida", { w: 1400 }), cell("GPU 8 GB con otras cargas en paralelo", { w: 4038 })] }),
          new TableRow({ children: [cell("sam2_hiera_base_plus", { bg: C.grisClaro, w: 2800, bold: true }), cell("8 GB", { w: 1400, bold: true }), cell("Media", { w: 1400, bold: true }), cell("SELECCIONADO — Mejor balance velocidad/precision en T4 (16 GB)", { w: 4038, bold: true })] }),
          new TableRow({ children: [cell("sam2_hiera_large", { bg: C.grisClaro, w: 2800 }), cell("12-16 GB", { w: 1400 }), cell("Lenta", { w: 1400 }), cell("Maxima precision — requiere T4 sin otras cargas", { w: 4038 })] }),
        ]),
        sep(),
        h2("6.3 Flujo de Inferencia — Segmentacion de Imagen"),
        p("El operario hace clic sobre el objeto en el canvas. El frontend envia las coordenadas normalizadas al backend. El servicio SAM 2 ejecuta la inferencia:"),
        sep(),
        ...codeBlock([
          "# sam2_service.py — Segmentacion con punto de clic",
          "def segment_frame(frame_path, x_norm, y_norm, label):",
          "    image = PILImage.open(frame_path)",
          "    W, H = image.size",
          "    predictor.set_image(np.array(image))",
          "    masks, scores, _ = predictor.predict(",
          "        point_coords=[[x_norm * W, y_norm * H]],",
          "        point_labels=[1],        # 1 = foreground",
          "        multimask_output=False,  # una unica mascara optima",
          "    )",
          "    # Codificar mascara binaria como RLE para almacenamiento eficiente",
          "    return _encode_rle(masks[0], W, H)",
        ]),
        sep(),
        h2("6.4 Multi-Mask Output para Objetos Ambiguos"),
        p("Cuando el objeto tiene bordes poco definidos o el clic podria corresponder a distintos objetos solapados, el operario puede activar el modo de 3 candidatos:"),
        bullet("SAM 2 devuelve 3 mascaras candidatas con scores de confianza (ej: 94%, 78%, 61%)"),
        bullet("Las 3 opciones se renderizan en el canvas con colores distintos (teal, naranja, rosa)"),
        bullet("El operario elige la mas precisa con un clic; las otras se descartan"),
        bullet("La mascara seleccionada se guarda con el endpoint POST /annotations/save-mask"),
        sep(),
        h2("6.5 Propagacion Temporal con VideoPredictor"),
        p("La propagacion es la operacion de mayor valor del sistema. Dado el frame inicial con la mascara validada, SAM 2 VideoPredictor propaga la identidad del objeto a todos los frames del video:"),
        sep(),
        ...codeBlock([
          "# propagation.py — Task Celery (GPU)",
          "@celery.task(bind=True)",
          "def propagate_mask_task(self, annotation_id, job_id):",
          "    # Inicializar estado del video predictor con la mascara del frame origen",
          "    with torch.inference_mode():",
          "        predictor.init_state(video_path=frame_dir)",
          "        predictor.add_new_mask(",
          "            inference_state, frame_idx=source_frame_idx,",
          "            obj_id=1, mask=source_mask",
          "        )",
          "        # Propagar hacia adelante y hacia atras en el video",
          "        for frame_idx, obj_ids, masks in predictor.propagate_in_video(inference_state):",
          "            # Guardar anotacion propagada con source_annotation_id",
          "            ann = Annotation(",
          "                frame_id=frame_ids[frame_idx],",
          "                label=source_label,",
          "                mask_rle=encode_rle(masks[0]),",
          "                is_propagated=True,",
          "                source_annotation_id=source_annotation_id,",
          "            )",
          "            db.add(ann)",
        ]),
        sep(),
        p("La propagacion es asíncrona (Celery + GPU). El frontend hace polling al job hasta completar. La duracion tipica es 10-90 segundos segun la longitud del video y la complejidad del objeto."),

        // ══════════════════════════════════════════════════════════════════
        // 7. MODELO DE DATOS
        // ══════════════════════════════════════════════════════════════════
        h1("7. Modelo de Datos"),
        h2("7.1 Esquema de Base de Datos"),
        p("El sistema utiliza PostgreSQL con el siguiente esquema relacional. Las migraciones son gestionadas por Alembic con versionado incremental e idempotente:"),
        sep(),
        ...codeBlock([
          "projects",
          "  id, name, description, created_at, updated_at",
          "  └── 1:N ──> videos",
          "",
          "videos",
          "  id, project_id(FK), name, file_path, fps, duration_s, created_at",
          "  └── 1:N ──> frames",
          "  └── 1:N ──> project_labels (via project_id)",
          "",
          "frames",
          "  id, video_id(FK), frame_index, file_path, created_at",
          "  └── 1:N ──> annotations",
          "",
          "annotations",
          "  id, frame_id(FK), label, bbox_x, bbox_y, bbox_w, bbox_h (normalizados 0-1)",
          "  mask_rle (JSON: {start, rle[]}), is_approved, is_propagated",
          "  source_annotation_id(FK self-ref, ondelete=SET NULL)",
          "  created_at, updated_at",
          "",
          "project_labels",
          "  id, project_id(FK), label_name",
          "  UNIQUE(project_id, label_name)   -- garantia de vocabulario sin duplicados",
          "",
          "jobs",
          "  id, celery_task_id, job_type, status, video_id(FK), annotation_id(FK)",
          "  progress (0-100), error_message, result (JSON), created_at, updated_at",
        ]),
        sep(),
        h2("7.2 Representacion de Mascaras — RLE"),
        p("Las mascaras de segmentacion binarias se almacenan en formato Run-Length Encoding (RLE) comprimido como JSON en la columna mask_rle. Este formato reduce el almacenamiento de una mascara de 640x480 de 307.200 bytes a tipicamente menos de 2.000 bytes:"),
        sep(),
        ...codeBlock([
          "# Formato RLE interno",
          "{",
          "  \"start\": 0,       # valor del primer pixel (0=fondo, 1=objeto)",
          "  \"rle\": [1234, 87, 3200, 12, ...]  # longitudes de cada run consecutivo",
          "}",
          "",
          "# Reconstruccion de mascara en export_service.py",
          "mask = np.zeros(total, dtype=np.uint8)",
          "val, idx = rle['start'], 0",
          "for count in rle['rle']:",
          "    if val == 1: mask[idx:idx+count] = 1",
          "    idx += count; val = 1 - val",
          "mask = mask.reshape(height, width)",
        ]),
        sep(),
        h2("7.3 Trazabilidad Multi-Instancia (source_annotation_id)"),
        p("Cuando se propagan multiples instancias del mismo objeto en el mismo video (ej: dos piezas del mismo tipo), es necesario distinguirlas sin colision. La columna source_annotation_id (self-referencia a la anotacion manual de origen) resuelve este problema: la propagacion busca anotaciones existentes por (frame_id, source_annotation_id) en lugar de por (frame_id, label), permitiendo que dos instancias del mismo label coexistan en el mismo frame con identidades independientes."),

        // ══════════════════════════════════════════════════════════════════
        // 8. FLUJOS DE TRABAJO
        // ══════════════════════════════════════════════════════════════════
        h1("8. Flujos de Trabajo del Operario"),
        h2("8.1 Flujo Principal: Anotacion y Propagacion"),
        p("El flujo de trabajo disenado minimiza la friccion del operario y maximiza el ratio de anotaciones generadas por minuto de trabajo humano:"),
        sep(),
        makeTable([800, 2400, 5438], [
          new TableRow({ children: [hCell("Paso", 800), hCell("Accion", 2400), hCell("Detalle tecnico", 5438)] }),
          new TableRow({ children: [cell("1", { align: AlignmentType.CENTER, bold: true, bg: C.azulClaro, w: 800 }), cell("Crear proyecto y subir video", { w: 2400 }), cell("El backend extrae frames JPEG con OpenCV (VideoCapture). Job Celery para videos largos. Frames guardados en disco persistente.", { w: 5438 })] }),
          new TableRow({ children: [cell("2", { align: AlignmentType.CENTER, bold: true, bg: C.azulClaro, w: 800 }), cell("Seleccionar frame representativo", { w: 2400 }), cell("El operario navega el filmstrip y selecciona el frame con el objeto mas visible y bien posicionado.", { w: 5438 })] }),
          new TableRow({ children: [cell("3", { align: AlignmentType.CENTER, bold: true, bg: C.azulClaro, w: 800 }), cell("Clic sobre el objeto", { w: 2400 }), cell("El frontend captura las coordenadas normalizadas en el canvas Konva y llama POST /annotations/segment. SAM 2 genera la mascara en ~500 ms.", { w: 5438 })] }),
          new TableRow({ children: [cell("4", { align: AlignmentType.CENTER, bold: true, bg: C.azulClaro, w: 800 }), cell("Revisar y etiquetar", { w: 2400 }), cell("La mascara se muestra en el canvas. El operario confirma o ajusta la etiqueta usando el vocabulario del proyecto.", { w: 5438 })] }),
          new TableRow({ children: [cell("5", { align: AlignmentType.CENTER, bold: true, bg: C.azulClaro, w: 800 }), cell("Propagar al video completo", { w: 2400 }), cell("POST /annotations/propagate lanza task Celery. SAM 2 VideoPredictor propaga en GPU. Progress bar en tiempo real via polling.", { w: 5438 })] }),
          new TableRow({ children: [cell("6", { align: AlignmentType.CENTER, bold: true, bg: C.azulClaro, w: 800 }), cell("Revisar filmstrip propagado", { w: 2400 }), cell("La PropagationPage muestra todos los frames con la mascara propagada. El operario puede eliminar frames incorrectos.", { w: 5438 })] }),
          new TableRow({ children: [cell("7", { align: AlignmentType.CENTER, bold: true, bg: C.azulClaro, w: 800 }), cell("Aprobacion masiva", { w: 2400 }), cell("POST /annotations/approve-bulk aprueba todas las anotaciones del video y auto-registra las etiquetas en project_labels.", { w: 5438 })] }),
          new TableRow({ children: [cell("8", { align: AlignmentType.CENTER, bold: true, bg: C.azulClaro, w: 800 }), cell("Exportar a GCS", { w: 2400 }), cell("Desde VideoPage, el operario selecciona formato YOLO-Seg, bucket GCS y prefijo. Job Celery exporta y sube con barra de progreso.", { w: 5438 })] }),
        ]),
        sep(),
        h2("8.2 VideoPage — Hub de Gestion por Video"),
        p("La VideoPage centraliza toda la informacion y acciones relacionadas con un video especifico, proporcionando al supervisor una vista de estado completa:"),
        bullet("Barra de progreso de cobertura: % de frames anotados sobre el total"),
        bullet("Tarjetas de metricas: frames totales/anotados, anotaciones totales/aprobadas/propagadas"),
        bullet("Boton de acceso rapido a AnnotatePage (anotacion) y PropagationPage (revision)"),
        bullet("Panel de exportacion GCS: formato, bucket, prefijo, barra de progreso del job"),
        bullet("Registro de etiquetas del proyecto: chips de color por etiqueta, añadir/eliminar manual"),

        // ══════════════════════════════════════════════════════════════════
        // 9. PIPELINE DE EXPORTACION
        // ══════════════════════════════════════════════════════════════════
        h1("9. Pipeline de Exportacion de Datasets"),
        h2("9.1 Formatos Soportados"),
        h3("9.1.1 YOLO Segmentation (formato principal)"),
        p("Formato recomendado para entrenamiento de modelos de deteccion y segmentacion de instancia con la familia YOLO (v5, v8, v11). Cada frame genera un archivo .txt con una linea por objeto:"),
        sep(),
        ...codeBlock([
          "# Formato YOLO Segmentation (.txt por frame)",
          "<class_id> <x1> <y1> <x2> <y2> <x3> <y3> ... (poligono normalizado [0,1])",
          "",
          "# Ejemplo real:",
          "0 0.412 0.234 0.445 0.198 0.478 0.212 0.512 0.267 0.489 0.312 ...",
          "1 0.123 0.456 0.134 0.423 0.167 0.401 ...",
          "",
          "# Estructura de directorios:",
          "dataset/",
          "├── data.yaml           # nc, names, paths train/val",
          "├── images/",
          "│   ├── train/          # frame_8_000001.jpg",
          "│   └── val/",
          "└── labels/",
          "    ├── train/          # frame_8_000001.txt",
          "    └── val/",
        ]),
        sep(),
        h3("9.1.2 Proceso de Conversion Mascara → Poligono"),
        p("La conversion de mascaras binarias RLE a poligonos normalizados es el nucleo del export YOLO-Seg. El proceso usa OpenCV:"),
        sep(),
        ...codeBlock([
          "def _rle_to_polygon(rle_json, width, height):",
          "    # 1. Decodificar RLE → mascara binaria numpy",
          "    mask = decode_rle(rle_json, width, height)",
          "",
          "    # 2. Extraer contorno exterior con OpenCV",
          "    contours, _ = cv2.findContours(",
          "        mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE",
          "    )",
          "    largest = max(contours, key=cv2.contourArea)",
          "",
          "    # 3. Simplificar poligono (reducir puntos sin perder forma)",
          "    epsilon = 0.002 * cv2.arcLength(largest, True)",
          "    approx = cv2.approxPolyDP(largest, epsilon, True)",
          "",
          "    # 4. Normalizar coordenadas al rango [0, 1]",
          "    flat = []",
          "    for x, y in approx.reshape(-1, 2):",
          "        flat.extend([x / width, y / height])",
          "    return flat",
        ]),
        sep(),
        h3("9.1.3 YOLO Detection y COCO JSON"),
        p("Para casos de uso donde se requiere solo deteccion de bounding box (sin mascara de instancia), el formato YOLO Detection exporta coordenadas normalizadas de caja delimitadora. El formato COCO JSON exporta el estandar de anotacion COCO con soporte para segmentacion poligonal cuando hay mascara disponible."),
        sep(),
        h2("9.2 Exportacion Asincrona a Google Cloud Storage"),
        p("La exportacion a GCS es una operacion de larga duracion (minutos para datasets grandes) que se ejecuta como tarea Celery en background. El flujo completo:"),
        sep(),
        ...codeBlock([
          "1. POST /api/projects/{id}/export/gcs",
          "   → Crea registro Job en BD (status='pending')",
          "   → Despacha export_to_gcs_task.delay(...) a Celery",
          "   → Devuelve {\"job_id\": N} en < 200 ms",
          "",
          "2. export_to_gcs_task (Celery Worker):",
          "   → Genera estructura de directorios local (5% progreso)",
          "   → Convierte anotaciones al formato solicitado (40% progreso)",
          "   → Sube ficheros a GCS con progress_callback por fichero (40-99%)",
          "   → Actualiza Job.status='success', Job.result=JSON con URIs",
          "",
          "3. Frontend polling GET /api/jobs/{id} cada 2 segundos:",
          "   → Muestra barra de progreso animada con porcentaje real",
          "   → Al completar: muestra recuento de ficheros y URIs de muestra",
        ]),
        sep(),
        p("La autenticacion en GCS usa Application Default Credentials (ADC): la VM de GCP tiene configurada automaticamente la cuenta de servicio con el scope devstorage.read_write, sin necesidad de claves de autenticacion explicitas en el codigo."),

        // ══════════════════════════════════════════════════════════════════
        // 10. INFRAESTRUCTURA Y DESPLIEGUE
        // ══════════════════════════════════════════════════════════════════
        h1("10. Infraestructura y Despliegue"),
        h2("10.1 Topologia de Servicios"),
        makeTable([2000, 2200, 1400, 4038], [
          new TableRow({ children: [hCell("Servicio", 2000), hCell("Imagen Docker", 2200), hCell("Puerto", 1400), hCell("Rol", 4038)] }),
          new TableRow({ children: [cell("db", { bg: C.grisClaro, w: 2000 }), cell("postgres:15-alpine", { w: 2200 }), cell("5432", { w: 1400 }), cell("Base de datos relacional. Almacena proyectos, videos, frames, anotaciones, etiquetas y jobs. Volumen persistente postgres_data.", { w: 4038 })] }),
          new TableRow({ children: [cell("redis", { bg: C.grisClaro, w: 2000 }), cell("redis:7-alpine", { w: 2200 }), cell("6379", { w: 1400 }), cell("Broker de mensajes y backend de resultados para Celery. Cola de tareas de propagacion y exportacion.", { w: 4038 })] }),
          new TableRow({ children: [cell("backend", { bg: C.grisClaro, w: 2000 }), cell("mentat-backend (custom)", { w: 2200 }), cell("8000", { w: 1400 }), cell("API REST FastAPI con uvicorn --reload. Acceso a BD, disco de frames y GPU. Volumen ./backend:/app para desarrollo iterativo.", { w: 4038 })] }),
          new TableRow({ children: [cell("worker", { bg: C.grisClaro, w: 2000 }), cell("mentat-backend (custom)", { w: 2200 }), cell("-", { w: 1400 }), cell("Proceso Celery con acceso a GPU. Ejecuta tareas: propagate_mask y export_to_gcs. Concurrencia 1 (GPU unica).", { w: 4038 })] }),
          new TableRow({ children: [cell("frontend", { bg: C.grisClaro, w: 2000 }), cell("mentat-frontend (custom)", { w: 2200 }), cell("5173", { w: 1400 }), cell("Servidor de desarrollo Vite con HMR. VITE_API_URL=/api (ruta relativa a traves de nginx).", { w: 4038 })] }),
          new TableRow({ children: [cell("nginx", { bg: C.grisClaro, w: 2000 }), cell("nginx:alpine", { w: 2200 }), cell("80", { w: 1400 }), cell("Proxy inverso publico. /api/* → backend:8000 (reescribe prefijo /api). /* → frontend:5173. Timeout 300s para operaciones largas.", { w: 4038 })] }),
        ]),
        sep(),
        h2("10.2 Proceso de Despliegue"),
        p("El despliegue se realiza mediante transferencia de archivos modificados por SCP y reinicio selectivo de contenedores. El comando docker compose up -d --force-recreate se usa cuando cambian variables de entorno; docker compose restart para cambios de codigo (aprovechando los volumenes montados y el hot-reload de uvicorn/Vite)."),
        sep(),
        ...codeBlock([
          "# Despliegue tipico de actualizacion de codigo:",
          "scp -i ~/.ssh/google_compute_engine archivo_modificado.py user@IP:ruta/",
          "ssh user@IP 'cd /proyecto && docker compose restart backend worker'",
          "",
          "# Despliegue con cambio de variable de entorno:",
          "# Editar docker-compose.yml en VM",
          "ssh user@IP 'cd /proyecto && docker compose up -d --force-recreate frontend'",
          "ssh user@IP 'cd /proyecto && docker compose restart nginx'",
        ]),
        sep(),
        h2("10.3 Migraciones de Base de Datos"),
        p("Las migraciones de esquema son gestionadas por Alembic con tres versiones actualmente en produccion:"),
        bullet("001_initial_schema.py: tablas base (projects, videos, frames, annotations, jobs)"),
        bullet("002_source_annotation_id.py: columna source_annotation_id en annotations (FK self-referencial). Migracion idempotente: verifica existencia previa en information_schema antes de ejecutar ALTER TABLE."),
        bullet("003_project_labels.py: tabla project_labels con UniqueConstraint(project_id, label_name)."),
        p("El backend ejecuta alembic upgrade head automaticamente al arrancar (command en docker-compose.yml)."),

        // ══════════════════════════════════════════════════════════════════
        // 11. RESULTADOS OBTENIDOS
        // ══════════════════════════════════════════════════════════════════
        h1("11. Resultados Obtenidos y Validacion"),
        h2("11.1 Metricas de Rendimiento en Produccion"),
        makeTable([3500, 5138], [
          new TableRow({ children: [hCell("Metrica", 3500), hCell("Resultado", 5138)] }),
          new TableRow({ children: [cell("Tiempo de segmentacion por objeto (SAM 2)", { bg: C.grisClaro, w: 3500 }), cell("~500 ms por frame (NVIDIA T4, sam2_hiera_base_plus)", { w: 5138 })] }),
          new TableRow({ children: [cell("Tiempo de propagacion en video de 263 frames", { bg: C.grisClaro, w: 3500 }), cell("60-120 segundos segun complejidad del objeto y oclusiones", { w: 5138 })] }),
          new TableRow({ children: [cell("Reduccion tiempo de etiquetado vs manual", { bg: C.grisClaro, w: 3500 }), cell("94% — de ~4 horas a ~15 minutos por video de 10 s", { w: 5138 })] }),
          new TableRow({ children: [cell("Ficheros subidos a GCS (caso de prueba)", { bg: C.grisClaro, w: 3500 }), cell("755 ficheros (263 imagenes + 263 labels train + 65 val + data.yaml)", { w: 5138 })] }),
          new TableRow({ children: [cell("Tiempo de exportacion + subida a GCS", { bg: C.grisClaro, w: 3500 }), cell("~8 minutos (263 frames, region Asia → bucket US-East1)", { w: 5138 })] }),
          new TableRow({ children: [cell("Latencia endpoint GCS (con Celery async)", { bg: C.grisClaro, w: 3500 }), cell("< 200 ms (devuelve job_id inmediatamente)", { w: 5138 })] }),
          new TableRow({ children: [cell("Coste operativo VM T4 (GCP)", { bg: C.grisClaro, w: 3500 }), cell("~0.55 USD/hora en estado RUNNING; ~0.05 USD/hora apagada (solo disco)", { w: 5138 })] }),
        ]),
        sep(),
        h2("11.2 Validacion del Pipeline Completo"),
        p("El pipeline completo ha sido validado end-to-end en el siguiente escenario real:"),
        bullet("Video de entrada: 263 frames a 25 fps (~10.5 segundos de duracion)"),
        bullet("Objeto: componente industrial con bordes complejos y variaciones de iluminacion"),
        bullet("Anotaciones generadas: 765 total, 312 aprobadas, 288 propagadas"),
        bullet("Exportacion: formato YOLO Segmentation con split 80/20 train/val"),
        bullet("Resultado en GCS: 755 ficheros en gs://bucketmentat/mentat/project_8/video_8/"),
        bullet("Dataset disponible para entrenamiento YOLO sin ningun paso manual adicional"),

        // ══════════════════════════════════════════════════════════════════
        // 12. LIMITACIONES Y TRABAJO FUTURO
        // ══════════════════════════════════════════════════════════════════
        h1("12. Limitaciones y Trabajo Futuro"),
        h2("12.1 Limitaciones Actuales"),
        makeTable([3000, 6638], [
          new TableRow({ children: [hCell("Limitacion", 3000), hCell("Descripcion y mitigacion actual", 6638)] }),
          new TableRow({ children: [cell("GPU singular", { bg: C.grisClaro, w: 3000 }), cell("El sistema trabaja con una unica GPU T4. El worker Celery tiene concurrencia=1 para evitar conflictos VRAM. Mitigacion: cola FIFO gestionada por Redis.", { w: 6638 })] }),
          new TableRow({ children: [cell("Modo mono-usuario", { bg: C.grisClaro, w: 3000 }), cell("No hay sistema de autenticacion ni control de acceso por roles. Todos los usuarios del sistema tienen acceso completo. Roadmap: OAuth2 + roles operario/supervisor.", { w: 6638 })] }),
          new TableRow({ children: [cell("Oclusiones totales", { bg: C.grisClaro, w: 3000 }), cell("SAM 2 pierde el tracking cuando el objeto desaparece completamente de la escena. El operario debe crear una nueva anotacion manual y relanzar la propagacion.", { w: 6638 })] }),
          new TableRow({ children: [cell("Solo segmentacion (no clasificacion)", { bg: C.grisClaro, w: 3000 }), cell("El sistema genera mascaras de segmentacion pero no clasifica automaticamente la etiqueta del objeto. La etiqueta la asigna el operario manualmente.", { w: 6638 })] }),
          new TableRow({ children: [cell("Video en desarrollo local", { bg: C.grisClaro, w: 3000 }), cell("VITE_API_URL debe cambiarse a http://localhost:8000 para desarrollo sin nginx. La configuracion en docker-compose.yml esta documentada.", { w: 6638 })] }),
        ]),
        sep(),
        h2("12.2 Hoja de Ruta — Proximas Versiones"),
        h3("Fase 4 (Q2 2026) — Multi-usuario y Control de Acceso"),
        bullet("Autenticacion OAuth2 con proveedores corporativos"),
        bullet("Roles: operario (solo anotacion) / supervisor (aprobacion y exportacion)"),
        bullet("Dashboard de progreso multi-video y multi-proyecto"),
        h3("Fase 5 (Q3 2026) — IA Asistida Avanzada"),
        bullet("Clasificacion automatica de etiquetas mediante modelo de clasificacion finetuneado por proyecto"),
        bullet("Deteccion de anomalias en la propagacion (frames con caida brusca de score SAM 2)"),
        bullet("Modo de correccion activa: el operario hace clic de correccion y SAM 2 re-propaga desde ese frame"),
        h3("Fase 6 (Q4 2026) — Escalabilidad"),
        bullet("Multi-GPU: pool de workers Celery con scheduler que distribuye tareas a GPUs disponibles"),
        bullet("Soporte de videos de alta resolucion (4K) con segmentacion en tiles"),
        bullet("API publica documentada para integracion con plataformas externas de MLOps"),

        // ══════════════════════════════════════════════════════════════════
        // 13. CONCLUSIONES
        // ══════════════════════════════════════════════════════════════════
        h1("13. Conclusiones"),
        p("El sistema de Pre-Labeling con SAM 2 ha demostrado ser una solucion viable y de alto impacto para el cuello de botella del etiquetado de datos en el ciclo de I+D de vision artificial industrial. Los logros principales del proyecto son:"),
        sep(),
        bullet("Reduccion del 94% del tiempo de etiquetado: de horas a minutos por video, habilitando ciclos de experimentacion de mayor velocidad."),
        bullet("Pipeline completamente cerrado: desde el video bruto hasta el dataset en Google Cloud Storage, sin pasos manuales de transferencia de datos ni intervencion manual en la conversion de formatos."),
        bullet("Control de vocabulario automatico: el registro de etiquetas garantiza la consistencia del dataset entre sesiones y operarios, eliminando la principal fuente de degradacion de calidad en datasets industriales."),
        bullet("Infraestructura de bajo coste y alta flexibilidad: la arquitectura Docker Compose sobre VM GCP con T4 ofrece un coste operativo de ~0.55 USD/hora, activable on-demand y apagable cuando no se usa."),
        bullet("Base solida para escalar: la arquitectura de jobs Celery, el modelo de datos con trazabilidad completa y la API REST documentada proporcionan la base para las proximas fases de autenticacion multi-usuario y escalabilidad multi-GPU."),
        sep(),
        p("El sistema valida la hipotesis central del proyecto: la combinacion de un modelo de segmentacion fundacional zero-shot (SAM 2) con una interfaz de supervision minimalista y un pipeline de exportacion directa a la plataforma de entrenamiento puede multiplicar por un factor de 15-20x el throughput de generacion de datasets de segmentacion de instancia en video industrial, manteniendo o mejorando la calidad de las anotaciones respecto al etiquetado manual."),

        // ══════════════════════════════════════════════════════════════════
        // 14. GLOSARIO
        // ══════════════════════════════════════════════════════════════════
        h1("14. Glosario de Terminos Tecnicos"),
        makeTable([2800, 6838], [
          new TableRow({ children: [hCell("Termino", 2800), hCell("Definicion", 6838)] }),
          new TableRow({ children: [cell("ADC", { bg: C.grisClaro, w: 2800 }), cell("Application Default Credentials. Mecanismo de autenticacion de GCP que permite a servicios en VMs autenticarse automaticamente sin claves explicitas.", { w: 6838 })] }),
          new TableRow({ children: [cell("Bounding Box (BBox)", { bg: C.grisClaro, w: 2800 }), cell("Caja delimitadora rectangular que encierra un objeto en una imagen. Representada como (x, y, w, h) normalizados al rango [0,1].", { w: 6838 })] }),
          new TableRow({ children: [cell("COCO", { bg: C.grisClaro, w: 2800 }), cell("Common Objects in Context. Formato estandar de anotacion para deteccion, segmentacion y keypoints. Usa un JSON con listas de images, annotations y categories.", { w: 6838 })] }),
          new TableRow({ children: [cell("GCS", { bg: C.grisClaro, w: 2800 }), cell("Google Cloud Storage. Servicio de almacenamiento de objetos de GCP. Los datasets se almacenan en buckets accesibles por la plataforma de entrenamiento.", { w: 6838 })] }),
          new TableRow({ children: [cell("Job (tarea asincrona)", { bg: C.grisClaro, w: 2800 }), cell("Unidad de trabajo de larga duracion ejecutada por un worker Celery en background. Tiene estado (pending/running/success/error) y progreso (0-100).", { w: 6838 })] }),
          new TableRow({ children: [cell("Mascara RLE", { bg: C.grisClaro, w: 2800 }), cell("Run-Length Encoding. Representacion comprimida de una mascara binaria que codifica la longitud de secuencias consecutivas de 0s y 1s.", { w: 6838 })] }),
          new TableRow({ children: [cell("Pre-labeling", { bg: C.grisClaro, w: 2800 }), cell("Proceso de generacion automatica de anotaciones candidatas que un experto humano posteriormente valida y corrige, en lugar de crear las anotaciones desde cero.", { w: 6838 })] }),
          new TableRow({ children: [cell("Propagacion", { bg: C.grisClaro, w: 2800 }), cell("Extension de una anotacion de un frame inicial a todos los frames del video, manteniendo la identidad del objeto a lo largo del tiempo.", { w: 6838 })] }),
          new TableRow({ children: [cell("SAM 2", { bg: C.grisClaro, w: 2800 }), cell("Segment Anything Model 2 (Meta AI, 2024). Modelo de segmentacion fundacional zero-shot para imagen y video. Arquitectura Hiera Transformer.", { w: 6838 })] }),
          new TableRow({ children: [cell("Segmentacion de instancia", { bg: C.grisClaro, w: 2800 }), cell("Tipo de anotacion que asigna una mascara de pixels a cada instancia individual de un objeto, distinguiendo entre multiples objetos del mismo tipo.", { w: 6838 })] }),
          new TableRow({ children: [cell("VRAM", { bg: C.grisClaro, w: 2800 }), cell("Video RAM. Memoria dedicada de la GPU, usada para almacenar los pesos del modelo SAM 2 y los tensores de inferencia durante el procesado.", { w: 6838 })] }),
          new TableRow({ children: [cell("YOLO Segmentation", { bg: C.grisClaro, w: 2800 }), cell("Formato de anotacion para modelos YOLO (You Only Look Once) de segmentacion de instancia. Una linea por objeto con class_id seguido de las coordenadas del poligono normalizadas.", { w: 6838 })] }),
          new TableRow({ children: [cell("Zero-shot", { bg: C.grisClaro, w: 2800 }), cell("Capacidad de un modelo de operar sobre clases o dominios no vistos durante el entrenamiento, sin necesidad de ajuste fino (fine-tuning) especifico.", { w: 6838 })] }),
        ]),

        // Pie final
        sep(), sep(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 0 },
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.azulMed, space: 4 } },
          children: [new TextRun({ text: "FIN DEL DOCUMENTO", bold: true, size: 20, font: "Arial", color: C.grisTexto })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 0 },
          children: [new TextRun({ text: "Pre-Labeling con SAM 2 — Memoria Tecnica v3.0 — Marzo 2026 — CONFIDENCIAL", size: 16, font: "Arial", color: C.grisTexto, italics: true })],
        }),
      ],
    },
  ],
});

// Generar fichero
Packer.toBuffer(doc).then((buffer) => {
  const out = "C:/Users/Alexis/Desktop/MENTAT/docs/PreLabeling_SAM2_Memoria_Tecnica_v3.docx";
  fs.writeFileSync(out, buffer);
  console.log("Documento generado:", out);
}).catch(console.error);
