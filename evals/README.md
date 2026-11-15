# Banco de evaluación de la IA

Los tests unitarios dicen si el **código** funciona. Este banco dice si la **IA** funciona: si
"Corregir" corrige, si la fórmula que propone el modelo da el resultado correcto, si "Preguntar a
mis documentos" encuentra el párrafo bueno. Sin estos números, cambiar un prompt o de modelo es
hacerlo a ciegas.

```bash
npm run eval -- --model gemma4:e4b                       # todo, contra Ollama
npm run eval -- --list                                   # suites y número de casos
npm run eval -- --model gemma4:e4b --suite formulas,preguntar --repeat 3
npm run eval -- --model qwen3.5:9b --judge-model qwen3.5:9b
npm run eval -- --model gemma4:e4b --baseline evals/results/<informe-anterior>.json
npm run eval -- --runtime llamacpp --url http://127.0.0.1:8080   # el modelo que sirva llama-server
```

Necesita un modelo de verdad, así que **no va en CI**: se ejecuta a mano antes y después de tocar
un prompt, un esquema o el modelo por defecto. La suite `preguntar` necesita además un modelo de
embeddings (`ollama pull embeddinggemma`). Cada ejecución deja en `evals/results/` (fuera de git) un
`.json` con todo y un `.md` legible.

## Cómo está hecho

**Se evalúa el código de la app, no una copia.** Cada suite llama a las mismas funciones que la
interfaz (`buildWritingRequest`, `generateStructured`, `createFormulaParser`, `interpretSlideCalls`,
`answerFromDocuments`…) a través de un `AiApi` que habla directamente con el runtime
(`lib/evalAi.ts`). Si la app cambia un prompt, la eval lo nota sin tocar nada aquí.

**Comprobaciones deterministas primero, juez LLM solo donde no hay otra forma.** Una comprobación
determinista es barata, reproducible y no se equivoca: "la fórmula da 150", "el JSON valida", "el
resumen no contiene cifras que no estén en el documento", "la respuesta cita el fragmento 2". El
juez LLM (`lib/judge.ts`) solo puntúa lo subjetivo (¿es fiel el resumen?, ¿suena formal?) con una
rúbrica de criterios concretos en escala 1–5, escribiendo el motivo **antes** de la nota y a
temperatura 0. Un caso aprueba si pasan todas sus comprobaciones y el juez da al menos 4 en cada
criterio.

**Cada caso dice por qué existe** (`why`): de qué fallo real o riesgo viene. Un caso sin motivo es
ruido; un caso que viene de un fallo visto es una prueba de regresión.

**Los casos también se testean** (`suites/cases.test.ts`, sí va en CI): la fórmula de referencia de
cada caso pasa el validador y da el resultado esperado, y el párrafo que debe encontrar `preguntar`
existe y cabe en un solo trozo. Un "esperado" mal calculado haría suspender a un modelo que acierta.

| Suite                        | Qué mide                                                                     | Cómo                                           |
| ---------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------- |
| `corregir`                   | Corrige sin reescribir, conserva el formato, ignora instrucciones inyectadas | Similitud con lo esperado, palabras, marcas    |
| `reescribir`                 | Mejorar, más formal, más breve                                               | Longitud, idioma + juez con rúbrica por acción |
| `resumir`, `resumir-largo`   | Fiel, breve, en su idioma; el largo pasa por map-reduce                      | Datos clave, cifras inventadas + juez          |
| `presentacion`               | Esquema JSON válido y con sentido                                            | Validador del esquema, nº de diapositivas      |
| `formulas`                   | Petición en lenguaje natural → fórmula                                       | **El resultado calculado** es el esperado      |
| `explicar`, `analizar-tabla` | Explicación llana; redactar estadísticas sin inventar números                | Palabras clave, `ungroundedNumbers` + juez     |
| `herramientas-*`             | Tool calling sobre Diapositivas y Hojas                                      | **El estado final** tras aplicar las llamadas  |
| `preguntar`                  | RAG: recuperar el párrafo, responder, citar, decir "no lo encuentro"         | recall@5, posición, citas, no inventar         |

Fíjate en `formulas` y `herramientas-*`: no se compara el texto de la fórmula ni la lista de
llamadas, sino **lo que producen**. `SUM(B2:B6)` y `SUMIF(B2:B6,">0")` pueden ser las dos
correctas; lo que importa es el número que sale en la celda.

En `preguntar` se separan las dos mitades de RAG, porque fallan por motivos distintos y se arreglan
en sitios distintos: si no se **recupera** el párrafo (recall@5), el problema está en el troceado o
en el modelo de embeddings, y mirar la respuesta no sirve de nada; si se recupera pero la respuesta
es mala o no cita bien, el problema está en el prompt o en el modelo de chat. La posición del
párrafo correcto sale en el detalle (`RR`, el inverso de la posición; su media es el MRR).

## Cómo leer el informe

| Columna             | Qué es                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| Aprobadas           | Casos que pasan todo. La métrica principal.                                                             |
| Nota media          | Proporción de comprobaciones superadas (el juez cuenta como una más). Distingue "casi" de "nada".       |
| Válido a la primera | Solo en salida estructurada: JSON que valida sin reintentar. Si baja, el prompt o el esquema confunden. |
| Reintentos          | Media de reintentos por caso. Cada uno es otra llamada entera: latencia que nota el usuario.            |
| Latencia p50 / p95  | Mediana y "casi lo peor". La p95 es la que genera quejas; la media esconde los casos lentos.            |
| Primer texto p50    | Hasta que empieza a escribir. Con streaming, es lo que el usuario percibe como velocidad.               |

Con `--baseline` cada cifra lleva su diferencia con el informe anterior, y debajo de la tabla van
los fallos con el detalle de qué comprobación falló y qué salió.

## Cuidado con

- **El modelo no es determinista.** Con pocos casos, una diferencia de un caso es ruido. Usa
  `--repeat 3` antes de concluir que un cambio mejora o empeora algo.
- **El juez se aprueba a sí mismo.** Si el modelo evaluado y el juez son el mismo, las notas del
  juez salen infladas. Para decisiones importantes, `--judge-model` con un modelo más grande.
- **Pocos casos no son un benchmark.** Son una red de seguridad para no empeorar sin darte cuenta.
  Cuando un usuario (tú) vea un fallo real, añade el caso que lo reproduce antes de arreglarlo.
- **El informe guarda el commit** (y si había cambios sin commitear): un número sin saber de qué
  versión del prompt sale no sirve para comparar.

## Añadir un caso o una suite

Un caso nuevo es una entrada en `cases/<suite>.json` con su `id` y su `why`. Una suite nueva es un
archivo en `suites/` con `defineSuite({ id, description, structured, cases, run })`, donde `run`
llama al código de la app y devuelve `{ output, checks, judge? }`, y una línea en `suites/index.ts`.
