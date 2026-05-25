// GET /api/generar-amparo-ganancias?tramiteId=...
//
// Genera el DOCX del escrito de inicio de Acción de Amparo + Medida Cautelar
// por Impuesto a las Ganancias sobre haber jubilatorio (art. 82 inc. c Ley 20.628).
// Solo accesible por usuarios con rol 'zonda'.
// La jurisdicción se toma de datos_propuesta.jurisdiccion ('san_rafael' | 'mendoza').
//
// Formato: Times New Roman 12pt · Interlineado 1,5 · Justificado · Nº página al pie

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { execSync }                  from 'child_process'
import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { join }                      from 'path'
import { randomUUID }                from 'crypto'
import { tmpdir }                    from 'os'

// ── Constantes de formato ──────────────────────────────────────
const FONT         = 'Times New Roman'
const SZ_BODY      = 24
const SZ_H1        = 24
const SZ_H2        = 24
const LINE_15      = 360
const SPC_AFTER    = 160
const SPC_AFTER_H1 = 120
const SPC_BEF_H1   = 280
const SPC_BEF_H2   = 200

// ── XML helpers ────────────────────────────────────────────────
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function p(text: string, opts: {
  bold?: boolean; center?: boolean; right?: boolean
  spaceBefore?: number; spaceAfter?: number
  fontSize?: number; italic?: boolean
} = {}): string {
  const {
    bold = false, center = false, right = false,
    spaceBefore = 0, spaceAfter = SPC_AFTER,
    fontSize = SZ_BODY, italic = false,
  } = opts
  const jc = center ? '<w:jc w:val="center"/>' : right ? '<w:jc w:val="right"/>' : '<w:jc w:val="both"/>'
  const rPr = `<w:rPr>${bold?'<w:b/><w:bCs/>':''}${italic?'<w:i/><w:iCs/>':''}<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/><w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/></w:rPr>`
  const runs = text.split('\n').map((line, i) => `${i>0?'<w:br/>':''}<w:r>${rPr}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`).join('')
  return `<w:p><w:pPr><w:spacing w:before="${spaceBefore}" w:after="${spaceAfter}" w:line="${LINE_15}" w:lineRule="auto"/>${jc}</w:pPr>${runs}</w:p>`
}

function h1(text: string) {
  return p(text, { bold: true, spaceBefore: SPC_BEF_H1, spaceAfter: SPC_AFTER_H1 })
}

function h2(text: string) {
  return p(text, { bold: true, spaceBefore: SPC_BEF_H2, spaceAfter: SPC_AFTER_H1 })
}

// ── Helpers de datos ───────────────────────────────────────────
function formatearFecha(iso: string): string {
  if (!iso) return '___'
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const [y, m, d] = iso.split('-')
  return `${parseInt(d)} de ${meses[parseInt(m)-1]} del año ${y}`
}

// ── Contenido del escrito de inicio ───────────────────────────
function buildGananciasParagraphs(datos: Record<string, unknown>, jurisdiccion: string): string[] {
  const nombreCompleto = String(datos.nombre_completo ?? '').trim()
  const nombreUpper    = nombreCompleto.toUpperCase()
  const dni            = String(datos.dni ?? '').trim()
  const domicilioReal  = String(datos.domicilio ?? '').trim()
  const fechaJub       = formatearFecha(String(datos.fecha_jubilacion ?? ''))
  const sexo           = String(datos.sexo ?? 'F')
  const esFemenino     = sexo === 'F'

  // Género
  const g = {
    trat:     esFemenino ? 'Sra.' : 'Sr.',
    laEl:     esFemenino ? 'la'   : 'el',
    laElTrat: esFemenino ? 'la Sra.' : 'el Sr.',
    actora:   esFemenino ? 'actora'  : 'actor',
    Actora:   esFemenino ? 'Actora'  : 'Actor',
    repO:     esFemenino ? 'representada' : 'representado',
    damnif:   esFemenino ? 'damnificada directa' : 'damnificado directo',
    jubilada: esFemenino ? 'jubilada' : 'jubilado',
  }

  // Domicilio legal según jurisdicción
  const domicilioLegal = jurisdiccion === 'san_rafael'
    ? 'Servando Butti 1658, San Rafael, Provincia de Mendoza, domicilio electrónico usuario 20-42749912-0 vpaez@zondalegal.com, lcalvo@zondalegal.com, info@zondaelegal.com, que solicito se valide, y número telefónico 260-154671231'
    : 'Catamarca 07, piso 2 oficina 10, Ciudad de Mendoza, domicilio electrónico usuario 20-42749912-0 vpaez@zondalegal.com, lcalvo@zondalegal.com, info@zondaelegal.com, que solicito se valide, y número telefónico 260-154671231'

  const ps: string[] = []

  const add   = (t: string, o?: Parameters<typeof p>[1]) => ps.push(p(t, o))
  const addH1 = (t: string) => ps.push(h1(t))
  const addH2 = (t: string) => ps.push(h2(t))

  // ── Encabezado ──────────────────────────────────────────────
  add('INTERPONE ACCIÓN DE AMPARO', { bold: true, center: true, spaceAfter: SPC_AFTER })
  add('SOLICITA MEDIDA CAUTELAR', { bold: true, center: true, spaceAfter: SPC_AFTER })
  add('')
  add(`Sr. JUEZ:`, { bold: true })
  add(`Valentín Paez, abogado, Mat. Fed. T°150 F°920, en representación de ${g.laEl} ${g.trat} ${nombreUpper}, con el patrocinio letrado de Lucas Matias Calvo, abogado, Mat. Fed. T°707 F°310, ante V.S. respetuosamente me presento y digo:`)

  // ── I. PERSONERÍA ───────────────────────────────────────────
  addH1('I.- PERSONERÍA')
  add(`Que acredito la representación invocada mediante poder apud acta -que se acompaña como Anexo I- extendido a nuestro favor por ${g.laElTrat} ${nombreCompleto}.`)

  // ── II. DATOS PERSONALES ────────────────────────────────────
  addH1('II.- DATOS PERSONALES')
  add(`Que los datos personales de mi mandante son: ${g.trat} ${nombreUpper}, D.N.I. N°${dni}, con domicilio real en ${domicilioReal}.`)

  // ── III. DOMICILIO LEGAL - ELECTRÓNICO ─────────────────────
  addH1('III.- DOMICILIO LEGAL - ELECTRÓNICO')
  add(`Que constituimos conjuntamente, patrocinado y patrocinantes, domicilio legal en ${domicilioLegal}.`)

  // ── IV. OBJETO ──────────────────────────────────────────────
  addH1('IV.- OBJETO')
  add(`Que en tiempo y forma venimos a interponer acción de amparo conforme lo reglado por la Ley N° 16.986 y lo establecido por el artículo 43 de nuestra Constitución Nacional, a fin de que se declare la inconstitucionalidad e inaplicabilidad del artículo 82 inciso c) de la Ley 20.628 (Ley de Impuesto a las Ganancias) en cuanto grava el haber jubilatorio de ${g.laEl} ${g.actora}, y en consecuencia se ordene a la AGENCIA DE RECAUDACIÓN Y CONTROL ADUANERO (ARCA, ex AFIP) cesar definitivamente las retenciones en concepto de Impuesto a las Ganancias que se vienen practicando sobre el beneficio previsional de ${g.repO}.`)
  add(`Que dicha retención resulta manifiestamente arbitraria e ilegítima, por cuanto el Máximo Tribunal de la Nación ya ha declarado su inconstitucionalidad en el precedente "García, María Isabel c/ AFIP s/ acción meramente declarativa de inconstitucionalidad" (Fallos: 342:411, del 26/03/2019), en tanto afecta la sustancia del haber previsional de ${g.laEl} ${g.actora}, quien reviste la condición de persona mayor en situación de vulnerabilidad.`)
  add(`Que tal acto arbitrario y embebido de ilegalidad manifiesta lesiona y restringe derechos individuales de ${g.laEl} ${g.actora} como el de integralidad del haber jubilatorio, de propiedad, de igualdad y de no confiscatoriedad -garantizados constitucionalmente- generando un perjuicio grave, actual, cierto y colocando a ${g.laEl} ${g.actora} en una situación de desprotección frente a la afectación de sus haberes jubilatorios siendo los mismos de carácter alimentario.`)
  add(`Que, en razón de ello, solicito a Usía ordene reintegrar a ${g.laEl} ${g.actora} todos los descuentos en concepto de "Impuesto a las Ganancias" (u otra denominación análoga utilizada) que se hayan aplicado sobre el haber previsional de mi ${g.repO} durante los 5 años anteriores a la interposición del presente amparo y aquellos montos que se devenguen durante la tramitación del presente, y hasta su efectivo pago, más intereses, por resultar una práctica ostensiblemente ilegítima conforme la inconstitucionalidad que al respecto ya ha decretado la CSJN.`)
  add(`Asimismo, solicito a V.S. que oportunamente se ordene el cese definitivo de las retenciones relativas a "Impuesto a las Ganancias" sobre el haber de mi ${g.repO}.`)
  add(`Que si al día de la sentencia, existiera ley, doctrina o jurisprudencia que aplicaran índices de actualización monetaria, por organismos oficiales o privados, atento al aumento de los índices inflacionarios existentes, solicito que los mismos sean aplicados a la presente causa, desde el día de la efectivización de la retención indebida hasta el día del efectivo pago, todo con expresa condenación en costas.`)

  // ── V. TEMPORALIDAD ─────────────────────────────────────────
  addH1('V.- TEMPORALIDAD')
  add(`La presente acción es promovida en tiempo oportuno, ello de acuerdo a lo dispuesto por el art. 2 inc. e) de la Ley 16.986, es decir que la demanda haya sido interpuesta dentro de los quince días hábiles a partir de la fecha en que el acto fue ejecutado o debió producirse.`)
  add(`En el caso de marras mi mandante ha quedado notificada formalmente del nuevo acto arbitrario de las demandadas al momento de percibir sus haberes mensuales.`)
  add(`Cabe destacar que la presente causa es de aquéllas que la doctrina y la jurisprudencia han calificado como de "ilegalidad continuada", en las cuales no es de aplicación el plazo de caducidad de la acción. Así lo sostuvo la Corte Suprema de Justicia en el precedente "Mosqueda" entre otros.`)
  add(`La ilegalidad perpetrada por el accionar de ARCA no se consuma en un acto sino que continúa cada vez que las sumas son retenidas del haber previsional del actor.`)

  // ── VI. LEGITIMACIÓN ────────────────────────────────────────
  addH1('VI.- LEGITIMACIÓN')
  add(`La legitimación activa para deducir la presente acción de amparo se funda en la circunstancia de que ${g.laElTrat} ${nombreCompleto} es ${g.damnif} de la acción injustificada en la que incurre la accionada, generando un daño irreparable a su patrimonio, afectando su derecho a cobrar lo que legítimamente le corresponde: su haber previsional de jubilación en forma íntegra, "principio de integralidad", y la devolución de las sumas indebidamente descontadas.`)
  add(`En este sentido, es dable destacar V.S. que el artículo 43 de la CN y art. 40 de la Constitución Provincial habilitan a toda persona a interponer acción de amparo ante la configuración de los requisitos allí establecidos, circunstancia que se torna, de suyo, evidente en este supuesto.`)
  add(`Resulta insoslayable que el carácter de beneficiaria de una prestación previsional se encuentra acreditado con la documentación que se adjunta, y que ofrezco como prueba en el punto pertinente.`)

  // ── VII. COMPETENCIA ────────────────────────────────────────
  addH1('VII.- COMPETENCIA')
  add(`Que V.S. resulta competente para entender en esta causa en virtud de lo dispuesto por el artículo 4° de la Ley N° 16.986 que establece que será competente para conocer la acción de amparo el Juez de Primera Instancia con jurisdicción en el lugar en que el acto se exteriorice o tuviere o pudiere tener efecto. En consecuencia, se encuentra justificada la competencia territorial de V.S. debido a que los efectos de los actos se producen en su jurisdicción.`)
  add(`Como así también, cabe resaltar que la competencia federal se impone, correspondiendo entender a V.S. en esta causa por tratarse de una acción entablada contra actos de la entidad nacional "ARCA (ex AFIP)", y donde el discernimiento de las cuestiones planteadas involucran normas y principios institucionales y constitucionales de prioritaria trascendencia: Art. 14 bis de la CN: "El Estado otorgará los beneficios de la seguridad social, que tendrá carácter de integral e irrenunciable"; "derecho de obtener una jubilación justa"; "a percibir su jubilación"; "de propiedad"; "de igualdad"; "de no confiscatoriedad".`)
  add(`Corresponde entender en este proceso al Juzgado Federal de la Provincia con competencia en la materia, en la medida que somete a debate el alcance de normas del mismo carácter.`)

  // ── VIII. HECHOS ─────────────────────────────────────────────
  addH1('VIII.- HECHOS')
  add(`Que mi mandante, ${g.trat} ${nombreCompleto}, es titular de beneficio previsional, con fecha de alta ${fechaJub}, percibiéndose su haber jubilatorio por intermedio de ANSES.`)
  add(`No obstante el reconocimiento de dicho beneficio de naturaleza alimentaria, el haber jubilatorio de mi ${g.repO} se ve mensual, sistemática e ilegítimamente cercenado por la retención en concepto de "Impuesto a las Ganancias" que practica ARCA (ex AFIP) conforme lo normado por el artículo 82 inciso c) de la Ley 20.628.`)
  add(`Dicha retención resulta absolutamente improcedente, arbitraria y confiscatoria, por cuanto la Corte Suprema de Justicia de la Nación ya ha declarado su inconstitucionalidad en el precedente "García, María Isabel" (Fallos: 342:411), en tanto grava la sustancia del haber previsional vulnerando los principios de proporcionalidad, razonabilidad y no confiscatoriedad garantizados por nuestra Carta Magna.`)
  add(`Dicha conducta lesiva se verifica de manera continuada y actual, tal como se acredita con la prueba documental acompañada (recibos de haberes de los últimos 5 años), donde consta la efectiva retención mensual del tributo bajo el código "IMPUESTO A LAS GANANCIAS" (o la denominación que figure en el recibo).`)
  add(`En cuanto a la cuantía total del perjuicio económico acumulado, solicito que la misma sea determinada con exactitud al momento de dictarse la sentencia definitiva. A tales fines, la liquidación deberá practicarse en base al resultado de la prueba informativa e instrumental ofrecida en el Apartado XIV de este escrito, mediante la cual se requerirá a la demandada la remisión de la totalidad de las liquidaciones previsionales (bonos de sueldo) de mi mandante desde la fecha de alta del beneficio. De dicha compulsa surgirá el detalle histórico de las sumas retenidas mensualmente en concepto de Impuesto a las Ganancias, permitiendo a V.S. cuantificar el daño y ordenar su reintegro en la sentencia, con más intereses y costas.`)

  // ── IX. PROCEDENCIA FORMAL ──────────────────────────────────
  addH1('IX.- PROCEDENCIA FORMAL DEL AMPARO')
  add(`La acción de amparo promovida resulta plenamente procedente por cuanto se verifican en autos todos los presupuestos de admisibilidad exigidos por el artículo 43 de la Constitución Nacional y la Ley 16.986.`)
  add(`Nos encontramos ante un acto de autoridad pública (ARCA) que, en forma actual e inminente, lesiona, restringe y altera con arbitrariedad e ilegalidad manifiesta derechos y garantías explícitamente reconocidos por nuestra Carta Magna (propiedad, integralidad del haber jubilatorio, igualdad ante la ley, no confiscatoriedad), no existiendo otro medio judicial más idóneo para la tutela urgente que el caso requiere.`)

  addH2('IX.1) IDONEIDAD DE LA VÍA Y ARBITRARIEDAD MANIFIESTA')
  add(`Nuestra Corte Suprema de Justicia de la Nación ha sostenido invariablemente que el amparo es un proceso utilizable en las delicadas y extremas situaciones en las que, por carecer de otras vías aptas, peligra la salvaguarda de derechos fundamentales, su apertura exige circunstancias muy particulares, caracterizadas por la presencia de arbitrariedad o ilegalidad manifiesta, frente a las cuales los procedimientos ordinarios resultan ineficaces.`)
  add(`En el caso de análisis, la arbitrariedad es patente: ARCA continúa reteniendo el Impuesto a las Ganancias sobre haberes previsionales pese a que la propia CSJN ya declaró la inconstitucionalidad de dicha práctica en el fallo "García". Esta conducta omisiva del organismo recaudador no requiere de mayor debate o prueba para ser desvirtuada, tornando al amparo en la vía procesal adecuada y urgente.`)
  add(`La Cámara Federal de Mendoza ha ratificado que el amparo ha dejado de ser una vía residual para convertirse en la principal ante arbitrariedades patentes como la aquí denunciada, en los términos del nuevo artículo 43 de la Constitución Nacional.`)

  addH2('IX.2) TUTELA DIFERENCIADA Y VULNERABILIDAD DEL ADULTO MAYOR')
  add(`Resulta imperioso destacar que la procedencia de esta acción se cimienta en la condición de sujeto vulnerable de mi mandante. La jurisprudencia reciente de este fuero ha incorporado el concepto de "Tutela Diferenciada" para los adultos mayores, conforme la Convención Interamericana sobre la Protección de los Derechos Humanos de las Personas Mayores (Ley 27.360).`)
  add(`La Sala A de la Cámara Federal de Mendoza ha sido contundente al respecto, reconociendo que las circunstancias fácticas de vulnerabilidad de los adultos mayores hacen que la vía del amparo sea la más adecuada y más idónea para la solución del conflicto, especialmente cuando se trata de créditos de naturaleza alimentaria que se ven afectados por retenciones ilegítimas practicadas por el Estado.`)

  addH2('IX.3) INNECESARIEDAD DEL AGOTAMIENTO DE LA VÍA ADMINISTRATIVA Y RITUALISMO INÚTIL')
  add(`La exigencia del reclamo administrativo previo se torna, en casos como el presente, en un ritualismo inútil que solo dilataría la protección de un crédito de naturaleza alimentaria. La jurisprudencia es conteste en que no es exigible el agotamiento de la vía administrativa cuando el acto lesivo emana de una norma general o cuando la demora pueda tornar ineficaz la tutela judicial.`)
  add(`En efecto, exigir a ${g.laEl} ${g.actora} el agotamiento de la vía administrativa ante ARCA, organismo que continúa aplicando mecánicamente una norma ya declarada inconstitucional por el Máximo Tribunal, implicaría someterlo a un procedimiento desgastante, lento e ineficaz para la tutela de sus derechos alimentarios, tornando ilusoria la protección que la Constitución garantiza.`)

  addH2('IX.4) TEMPORALIDAD Y DAÑO CONTINUADO')
  add(`Se rechaza cualquier planteo de extemporaneidad o caducidad de la acción (Art. 2 inc. e, Ley 16.986), por cuanto nos encontramos frente a un supuesto de ilegalidad continuada.`)
  add(`El acto lesivo (la retención del tributo) se renueva mes a mes con cada liquidación de haberes, actualizando periódicamente el perjuicio y el plazo para accionar. La doctrina y jurisprudencia son pacíficas al respecto, aplicando en forma analógica el precedente "Mosqueda" de la CSJN (Fallos: 329:4918) a los casos de retenciones previsionales de tracto sucesivo.`)

  // ── X. ARGUMENTOS DE FONDO ──────────────────────────────────
  addH1('X.- ARGUMENTOS DE FONDO')

  addH2('X.1) NATURALEZA JURÍDICA DEL HABER PREVISIONAL Y PRINCIPIO DE SUSTENTABILIDAD')
  add(`El haber previsional tiene naturaleza alimentaria y constituye la contraprestación por los aportes realizados durante toda la vida activa del trabajador. Como tal, se encuentra protegido por los principios de integralidad, proporcionalidad y sustitutividad consagrados en el artículo 14 bis de la Constitución Nacional.`)
  add(`La Corte Suprema de Justicia de la Nación, en su histórico fallo "Badaro" (Fallos: 329:3089 y 330:4866), estableció que el Estado tiene la obligación de garantizar que los haberes previsionales mantengan una relación razonable con los ingresos de los trabajadores activos. En ese mismo sentido, el Tribunal cimero dejó sentado que los haberes jubilatorios no pueden verse disminuidos en su sustancia.`)
  add(`En este contexto, la aplicación del Impuesto a las Ganancias sobre el haber previsional de ${g.laEl} ${g.actora} importa una doble reducción del ingreso: primero, la quita que el Estado ya realizó durante la vida activa (en concepto de aportes previsionales); y ahora, una nueva detracción sobre la prestación que ese mismo aporte generó, violentando el principio de proporcionalidad y la garantía de no confiscatoriedad.`)

  addH2('X.2) INCONSTITUCIONALIDAD DEL ART. 82 INC. C) LEY 20.628 — FALLO "GARCÍA"')
  add(`El precedente que rige la cuestión de manera definitiva es el fallo "García, María Isabel c/ AFIP s/ acción meramente declarativa de inconstitucionalidad" dictado por la Corte Suprema de Justicia de la Nación el 26 de marzo de 2019 (Fallos: 342:411).`)
  add(`En dicho pronunciamiento, el Máximo Tribunal declaró la inconstitucionalidad del artículo 79 inciso c) —actual artículo 82 inciso c) del Texto Ordenado 2019— de la Ley 20.628 en cuanto somete al Impuesto a las Ganancias las jubilaciones, pensiones, retiros o subsidios que tienen su origen en el trabajo personal, cuando dichas rentas corresponden a personas en situación de vulnerabilidad.`)
  add(`La doctrina sentada en "García" establece que la aplicación del tributo a los haberes previsionales de adultos mayores resulta confiscatoria y contraria a los estándares constitucionales e internacionales de protección de las personas mayores, toda vez que afecta la sustancia del ingreso de quien ya no tiene posibilidad de reponer lo descontado mediante actividad laboral futura.`)
  add(`La CSJN ordenó en dicho precedente que la AFIP (hoy ARCA) adecuara su conducta al mandato constitucional, cesando las retenciones sobre los haberes jubilatorios de las personas en situación de vulnerabilidad. Sin embargo, el organismo recaudador continúa practicando las retenciones de manera sistemática, obligando a cada jubilado a litigar individualmente para obtener la tutela de un derecho ya reconocido por el Máximo Tribunal.`)

  addH2('X.3) DOBLE IMPOSICIÓN Y CONFISCATORIEDAD')
  add(`La retención del Impuesto a las Ganancias sobre el haber jubilatorio configura, en los hechos, una situación de doble imposición: durante toda su vida activa, ${g.laEl} ${g.actora} tributó Impuesto a las Ganancias sobre sus ingresos laborales y, simultáneamente, realizó aportes obligatorios al sistema previsional sobre esas mismas remuneraciones. Ahora, al percibir la jubilación —que es la prestación resultante de aquellos aportes— vuelve a tributar el mismo impuesto.`)
  add(`Este fenómeno de doble imposición sobre un mismo origen de renta (el trabajo personal) resulta manifiestamente irrazonable y violatorio del principio de no confiscatoriedad consagrado por el artículo 17 de la Constitución Nacional.`)
  add(`La Corte Suprema ha sostenido reiteradamente que un tributo es confiscatorio cuando absorbe una parte sustancial de la renta o del capital gravado. Tratándose de haberes jubilatorios —que ya son en sí mismos de carácter sustitutivo y no generan posibilidad de ahorro o capitalización adicional— la aplicación del impuesto afecta directamente la sustancia del ingreso alimentario, superando con creces el umbral de razonabilidad constitucional.`)

  addH2('X.4) VULNERABILIDAD Y PROTECCIÓN ESPECIAL DE LAS PERSONAS MAYORES')
  add(`La condición de adulto mayor de mi mandante impone al Estado un deber reforzado de protección, conforme los estándares del derecho internacional de los derechos humanos incorporados a nuestra Constitución Nacional (art. 75 inc. 22 C.N.).`)
  add(`La Convención Interamericana sobre la Protección de los Derechos Humanos de las Personas Mayores (Ley 27.360) establece en su artículo 17 el derecho a la seguridad social de la persona mayor, obligando a los Estados a garantizar el acceso a prestaciones que aseguren una vida digna. La retención del Impuesto a las Ganancias sobre el haber jubilatorio importa una violación directa de esta garantía convencional.`)
  add(`En el fallo "García", la CSJN incorporó expresamente la perspectiva de la vulnerabilidad del adulto mayor como criterio determinante para la declaración de inconstitucionalidad, reconociendo que las personas mayores merecen una tutela judicial diferenciada y prioritaria. Esta doctrina es de aplicación directa al presente caso.`)

  // ── XI. JURISPRUDENCIA ──────────────────────────────────────
  addH1('XI.- JURISPRUDENCIA')
  add(`La postura aquí vertida tiene recepción favorable, actual y uniforme en la jurisprudencia de nuestro fuero federal. La Cámara Federal de Apelaciones de Mendoza ha dictado una serie de sentencias que consolidan, sin lugar a dudas, la procedencia de la presente acción.`)

  addH2('XI.1) JURISPRUDENCIA DE LA CÁMARA FEDERAL DE MENDOZA')
  add(`En autos "GÓMEZ, ELSA BEATRIZ c/ ARCA s/ AMPARO LEY 16.986", la Cámara Federal de Mendoza declaró la inconstitucionalidad del artículo 82 inciso c) de la Ley 20.628 respecto de jubilados en situación de vulnerabilidad, ratificando la doctrina del fallo "García" y ordenando el cese de las retenciones y la restitución de las sumas indebidamente retenidas.`)
  add(`En autos "MAULEON, JORGE ALBERTO c/ ARCA s/ AMPARO LEY 16.986", el Tribunal de Alzada confirmó la procedencia del amparo como vía idónea para impugnar la retención del Impuesto a las Ganancias sobre haberes previsionales, rechazando el planteo de la demandada sobre la necesidad de agotar la vía administrativa previa.`)
  add(`En autos "SOSA, RITA BEATRIZ c/ ARCA s/ AMPARO LEY 16.986", la Cámara Federal de Mendoza ratificó que la ilegalidad continuada de las retenciones descarta la aplicación del plazo de caducidad previsto en la Ley 16.986, reconociendo el derecho de los jubilados a accionar en cualquier momento mientras persista la conducta lesiva.`)
  add(`En autos "ALBARRACÍN, HUGO DANTE c/ ARCA s/ AMPARO LEY 16.986", el Tribunal confirmó que la condición de persona mayor en situación de vulnerabilidad es criterio suficiente para la aplicación de la doctrina del fallo "García", sin necesidad de demostrar una situación de indigencia o desamparo extremo.`)

  addH2('XI.2) DOCTRINA CSJN — FALLO "GARCÍA"')
  add(`La Corte Suprema de Justicia de la Nación, en el fallo "García" (Fallos: 342:411), sostuvo que:`)
  add(`"La situación de vulnerabilidad de quien ha cesado en su actividad laboral —y que, por ello, no cuenta con otra fuente de ingresos que su haber previsional— impide que el legislador aplique sobre tal renta un tributo que absorba una porción sustancial de lo percibido, pues ello menoscaba las condiciones mínimas de una vida digna que la Constitución garantiza a todas las personas". (CSJN, "García, María Isabel c/ AFIP s/ acción meramente declarativa de inconstitucionalidad", Fallos: 342:411, sentencia del 26/03/2019).`, { italic: true })
  add(`Asimismo, el Máximo Tribunal expresó que la norma cuestionada "vulnera la garantía de proporcionalidad en cuanto exige al jubilado —persona mayor y por ende sujeto de tutela preferente— un esfuerzo fiscal que el Estado no puede imponerle sin lesionar la sustancia de su prestación alimentaria". (Ibídem).`, { italic: true })

  // ── XII. SOLICITA MEDIDA CAUTELAR ───────────────────────────
  addH1('XII.- SOLICITA MEDIDA CAUTELAR URGENTE')
  add(`En los términos del artículo 15 de la Ley 16.986 y de las Reglas de Brasilia sobre Acceso a la Justicia de las Personas en Condición de Vulnerabilidad, venimos a solicitar a V.S. que, con carácter previo o simultáneo al traslado de la demanda, dicte medida cautelar disponiendo la suspensión inmediata de las retenciones del Impuesto a las Ganancias que ARCA practica sobre el haber jubilatorio de ${g.laElTrat} ${nombreCompleto}.`)

  addH2('XII.1) VEROSIMILITUD DEL DERECHO')
  add(`La verosimilitud del derecho invocado —fumus boni iuris— resulta de acreditación sencilla e indiscutible en el presente caso, por cuanto:`)
  add(`a) La CSJN ya declaró la inconstitucionalidad de la retención del Impuesto a las Ganancias sobre haberes jubilatorios de personas en situación de vulnerabilidad en el fallo "García" (Fallos: 342:411), que constituye la doctrina legal vigente y de aplicación obligatoria para los tribunales inferiores.`)
  add(`b) La Cámara Federal de Mendoza, en los precedentes citados en el apartado anterior (GÓMEZ, MAULEON, SOSA, ALBARRACÍN), ha reiterado dicha doctrina en forma uniforme y pacífica, aplicándola a casos sustancialmente análogos al presente.`)
  add(`c) Mi mandante acredita su condición de jubilad${esFemenino ? 'a' : 'o'} y la retención efectiva del tributo mediante la documentación que se adjunta.`)
  add(`En este sentido, la Cámara Federal de Mendoza, en los autos "CARBAJAL, BEATRIZ ELENA c/ ARCA s/ AMPARO LEY 16.986", al confirmar la medida cautelar dictada en primera instancia, expresó:`)
  add(`"La verosimilitud del derecho se encuentra sobradamente acreditada mediante la sola exhibición del recibo de haberes donde consta la retención del tributo, toda vez que la inconstitucionalidad de dicha práctica ha sido declarada por el Máximo Tribunal de la Nación en el precedente 'García', cuya aplicación a casos como el presente no admite duda alguna". (Cámara Federal de Mendoza, "CARBAJAL, BEATRIZ ELENA c/ ARCA s/AMPARO LEY 16.986").`, { italic: true })

  addH2('XII.2) PELIGRO EN LA DEMORA')
  add(`El periculum in mora se configura en forma palmaria, pues cada mes que transcurre sin la medida cautelar implica una nueva e irreparable afectación patrimonial al haber alimentario de ${g.laEl} ${g.actora}.`)
  add(`La naturaleza alimentaria del haber jubilatorio y la condición de persona mayor de mi mandante tornan especialmente gravosa la espera del proceso principal para obtener tutela. En efecto, ${g.laEl} ${g.actora} no dispone de otra fuente de ingresos que su haber previsional, de modo que cada retención mensual del tributo lesiona directamente su capacidad de sustento y calidad de vida.`)
  add(`Por otra parte, la demora en la tutela puede generar una situación de difícil o imposible reparación ulterior, en la medida en que las sumas retenidas se van acumulando y su reintegro tardío —aunque con intereses— no repara el daño patrimonial y existencial sufrido durante el período en que el jubilado debió prescindir de esos fondos.`)
  add(`Al respecto, la Cámara Federal de Mendoza, en autos "MIRARCHI, OSCAR ABEL c/ ARCA s/ AMPARO LEY 16.986", sostuvo que:`)
  add(`"El peligro en la demora resulta evidente cuando se trata de retenciones sobre haberes jubilatorios de carácter alimentario. El tiempo que insume el proceso principal importa, en tales casos, un daño concreto y mensurable que se incrementa mes a mes, justificando sobradamente el dictado de la medida cautelar para evitar que la sentencia de fondo llegue tarde o sea de cumplimiento meramente simbólico". (Cámara Federal de Mendoza, "MIRARCHI, OSCAR ABEL c/ ARCA s/AMPARO LEY 16.986").`, { italic: true })

  addH2('XII.3) CONTRACAUTELA')
  add(`Atento la manifiesta verosimilitud del derecho y tratándose de un crédito de naturaleza alimentaria perteneciente a una persona mayor en situación de vulnerabilidad, solicito a V.S. que la contracautela sea fijada en caución juratoria, lo que así se ofrece en este acto.`)
  add(`Ello así, por cuanto exigir una contracautela de mayor entidad implicaría trasladar al actor —que ya sufre la afectación de su único ingreso— la carga económica adicional de garantizar una medida que tiende, precisamente, a protegerlo de dicha afectación.`)

  // ── XIII. CONTROL DE CONVENCIONALIDAD ──────────────────────
  addH1('XIII.- CONTROL DE CONVENCIONALIDAD.')
  add(`Que conforme la recepción constitucional de diversos tratados internacionales (Art. 75 inc. 22 C.N.) y en relación a los derechos que en esta acción planteamos, los mismos se encuentran expresamente consagrados en el plexo normativo supranacional, Art. XVI (derecho a la seguridad social), XVIII y XXIV de la Declaración Americana de los Derechos y Deberes del Hombre y Art. 8 de la Declaración Universal de Derechos Humanos.`)
  add(`Asimismo, resulta de aplicación imperativa la Convención Interamericana sobre la Protección de los Derechos Humanos de las Personas Mayores, ratificada por Ley 27.360, que otorga jerarquía constitucional a la protección especial de los adultos mayores.`)
  add(`Al respecto, la jurisprudencia local ha sido contundente. En la causa "Zallocco Vda. de Chifani, Mónica c/ ENA, ANSES y ot. s/ Amparo", la Cámara Federal de Mendoza se pronunció sosteniendo que:`)
  add(`"La Convención Americana sobre la Protección de los Derechos Humanos de las Personas Mayores (CIPDHPM), consagra el compromiso de los Estados partes para adoptar y fortalecer todas las medidas legislativas, administrativas, judiciales, presupuestarias y de cualquier otra índole, incluido el adecuado acceso a la justicia a fin de garantizar a la persona mayor un trato diferenciado y preferencial en todos los ámbitos. (...) Dicho imperativo constitucional resulta transversal a todo el ordenamiento jurídico, proyectándose concretamente a la materia tributaria, ya que no es dable postular que el Estado actúe con una mirada humanista en ámbitos carentes de contenido económico inmediato (libertades de expresión, ambulatoria o tránsito) y sea insensible al momento de definir su política fiscal (…)".`, { italic: true })
  add(`En consecuencia, la retención confiscatoria aquí impugnada no solo vulnera la ley interna, sino que violenta los compromisos internacionales asumidos por el Estado Argentino de garantizar una vida digna y un trato preferencial a las personas mayores, obligando al control de convencionalidad de la norma cuestionada.`)

  // ── XIV. PRUEBA ─────────────────────────────────────────────
  addH1('XIV.- PRUEBA')
  add(`A fin de acreditar los extremos invocados, ofrezco la siguiente prueba:`)
  add(`A) INSTRUMENTAL:`, { bold: true })
  add(`Se acompaña la siguiente documentación original y/o en copias simples para ser agregadas a autos:`)
  add(`Anexo I: Poder Apud Acta`)
  add(`Anexo II: Copia del Documento Nacional de Identidad de la parte actora.`)
  add(`Anexo III: Recibos de Haberes (Bonos de Sueldo): Se adjuntan las liquidaciones previsionales correspondientes a los últimos 5 años, en los cuales consta la efectiva retención del tributo bajo el código "IMPUESTO A LAS GANANCIAS" (o la denominación que figure).`)
  add(`Para el hipotético caso de que la demandada desconozca la autenticidad de esta documentación acompañada, solicito se libre oficio a ARCA a fin de que remita a este Tribunal, en formato digital o papel, el detalle completo de las retenciones mensuales practicadas en concepto de Impuesto a las Ganancias sobre el haber previsional de mi mandante desde la fecha de alta del beneficio. De dicha compulsa surgirá el detalle histórico de las sumas retenidas mensualmente, permitiendo a V.S. cuantificar el daño y ordenar su reintegro en la sentencia, con más intereses y costas.`)
  add(`B) INSTRUMENTAL EN PODER DE LA CONTRARIA:`, { bold: true })
  add(`Solicito se libre oficio a ARCA (ex AFIP) a fin de que remita a este Tribunal, en formato digital o papel, el detalle completo de las retenciones practicadas en concepto de Impuesto a las Ganancias sobre el haber previsional de mi mandante, desde la fecha de alta del mismo hasta la actualidad.`)
  add(`Esta prueba tiene por finalidad que V.S. pueda constatar en la sentencia definitiva el monto exacto retenido mes a mes en concepto de "Impuesto a las Ganancias" y proceder a la liquidación del capital, intereses y costas en dicho pronunciamiento, conforme lo solicitado en el apartado VIII.- Hechos de este escrito de inicio.`)

  // ── XV. PETITORIO ───────────────────────────────────────────
  addH1('XV.- PETITORIO')
  add(`Por todo lo expuesto, a V.S. solicito:`)
  add(`Me tenga por presentado, por parte en el carácter invocado y con el domicilio legal y electrónico constituidos.`)
  add(`Tenga por interpuesta en tiempo y forma la presente ACCIÓN DE AMPARO (Art. 43 C.N. y Ley 16.986) contra la AGENCIA DE RECAUDACIÓN Y CONTROL ADUANERO (ARCA, ex AFIP).`)
  add(`Con carácter urgente, dicte MEDIDA CAUTELAR disponiendo la suspensión inmediata de las retenciones del Impuesto a las Ganancias sobre el haber jubilatorio de ${g.laElTrat} ${nombreCompleto}, hasta tanto se dicte sentencia definitiva, fijando la contracautela en caución juratoria.`)
  add(`Tenga por ofrecida la prueba documental acompañada y, para el caso de desconocimiento, ordene la producción de la prueba informativa subsidiaria.`)
  add(`Tenga presente la reserva del Caso Federal efectuada para ocurrir ante la CSJN.`)
  add(`Oportunamente, dicte sentencia haciendo lugar a la acción de amparo en todas sus partes, resolviendo: a) Declarar la INCONSTITUCIONALIDAD e INAPLICABILIDAD del artículo 82 inciso c) de la Ley 20.628 (Impuesto a las Ganancias) respecto del haber jubilatorio de la parte actora, conforme la doctrina del fallo "García" de la CSJN (Fallos: 342:411). b) Ordenar a ARCA el cese definitivo de las retenciones del Impuesto a las Ganancias sobre el haber previsional de mi ${g.repO}. c) Condenar a ARCA a restituir la totalidad de las sumas indebidamente retenidas en concepto de Impuesto a las Ganancias correspondiente a los períodos no prescriptos, con más sus intereses correspondientes (Tasa Pasiva B.C.R.A. o la que V.S. estime corresponder para mantener la incolumidad del crédito) hasta su efectivo pago.`)
  add(`Imponga las costas del proceso a la demandada vencida (Art. 14 Ley 16.986).`)
  add(`Regule los honorarios profesionales de los letrados intervinientes conforme la Ley 27.423.`)
  add('')
  add(`PROVEER DE CONFORMIDAD,`, { bold: true, center: true })
  add(`SERÁ JUSTICIA.`, { bold: true, center: true })

  return ps
}

// ── Builders de archivos OOXML ─────────────────────────────────
function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:latentStyleCount="0">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>
      <w:sz w:val="${SZ_BODY}"/><w:szCs w:val="${SZ_BODY}"/>
      <w:lang w:val="es-AR"/>
    </w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr>
      <w:spacing w:after="${SPC_AFTER}" w:line="${LINE_15}" w:lineRule="auto"/>
      <w:jc w:val="both"/>
    </w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/>
    <w:pPr><w:jc w:val="both"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>
      <w:sz w:val="${SZ_BODY}"/><w:szCs w:val="${SZ_BODY}"/>
    </w:rPr>
  </w:style>
</w:styles>`
}

function buildContentTypes(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/footer.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`
}

function buildRootRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
}

function buildWordRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer.xml"/>
</Relationships>`
}

function buildFooterXml(): string {
  const rPr = `<w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/><w:sz w:val="${SZ_BODY}"/><w:szCs w:val="${SZ_BODY}"/></w:rPr>`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:r>${rPr}<w:fldChar w:fldCharType="begin"/></w:r>
    <w:r>${rPr}<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
    <w:r>${rPr}<w:fldChar w:fldCharType="separate"/></w:r>
    <w:r>${rPr}<w:t>1</w:t></w:r>
    <w:r>${rPr}<w:fldChar w:fldCharType="end"/></w:r>
  </w:p>
</w:ftr>`
}

function buildCoreXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>Acción de Amparo — Impuesto a las Ganancias sobre Haber Jubilatorio</dc:title>
  <dc:creator>Zonda Legal</dc:creator>
</cp:coreProperties>`
}

function buildAppXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Zonda Legal</Application>
</Properties>`
}

function buildDocumentXml(paragraphs: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${paragraphs.join('\n    ')}
    <w:sectPr>
      <w:footerReference w:type="default" r:id="rId2"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>
    </w:sectPr>
  </w:body>
</w:document>`
}

// ── Route handler ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('No autenticado', { status: 401 })

  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).single()
  if (!perfil || perfil.rol !== 'zonda')
    return new NextResponse('Acceso denegado', { status: 403 })

  const tramiteId = req.nextUrl.searchParams.get('tramiteId')
  if (!tramiteId) return new NextResponse('tramiteId requerido', { status: 400 })

  const { data: tramite } = await supabase
    .from('tramites')
    .select('id, tipo, datos_cliente, datos_propuesta')
    .eq('id', tramiteId)
    .single()

  if (!tramite) return new NextResponse('Trámite no encontrado', { status: 404 })
  if (tramite.tipo !== 'GANANCIAS') return new NextResponse('Tipo de trámite incorrecto', { status: 400 })

  const datos       = (tramite.datos_cliente   ?? {}) as Record<string, unknown>
  const propuesta   = (tramite.datos_propuesta ?? {}) as Record<string, unknown>
  const jurisdiccion = String(propuesta.jurisdiccion ?? 'mendoza')

  if (!propuesta.jurisdiccion)
    return new NextResponse('Jurisdicción no seleccionada. Seleccioná el juzgado en el panel antes de generar.', { status: 400 })

  // Construir párrafos
  const paragraphs = buildGananciasParagraphs(datos, jurisdiccion)
  const docXml     = buildDocumentXml(paragraphs)

  // Escribir archivos en tmpdir
  const uid      = randomUUID().replace(/-/g, '').slice(0, 8)
  const tmpDir   = join(tmpdir(), `ganancias_${uid}`)
  const wordDir  = join(tmpDir, 'word')
  const docProps = join(tmpDir, 'docProps')
  mkdirSync(join(tmpDir, '_rels'), { recursive: true })
  mkdirSync(wordDir, { recursive: true })
  mkdirSync(join(wordDir, '_rels'), { recursive: true })
  mkdirSync(docProps, { recursive: true })

  writeFileSync(join(tmpDir, '[Content_Types].xml'), buildContentTypes())
  writeFileSync(join(tmpDir, '_rels', '.rels'), buildRootRels())
  writeFileSync(join(wordDir, 'document.xml'), docXml)
  writeFileSync(join(wordDir, 'styles.xml'), buildStylesXml())
  writeFileSync(join(wordDir, 'footer.xml'), buildFooterXml())
  writeFileSync(join(wordDir, '_rels', 'document.xml.rels'), buildWordRels())
  writeFileSync(join(docProps, 'core.xml'), buildCoreXml())
  writeFileSync(join(docProps, 'app.xml'), buildAppXml())

  const zipPath = join(tmpdir(), `Amparo_Ganancias_${uid}.docx`)
  execSync(`cd "${tmpDir}" && zip -r "${zipPath}" . -x "*.DS_Store"`, { timeout: 30_000 })

  const buf = readFileSync(zipPath)
  try {
    const { rmSync } = await import('fs')
    rmSync(tmpDir,  { recursive: true, force: true })
    rmSync(zipPath, { force: true })
  } catch { /* ignore cleanup errors */ }

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="Amparo_Ganancias_${uid}.docx"`,
    },
  })
}
