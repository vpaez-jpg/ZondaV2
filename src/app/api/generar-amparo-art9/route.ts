// GET /api/generar-amparo-art9?tramiteId=...
//
// Genera el DOCX del escrito de inicio de Acción de Amparo por Art. 9 Ley 24.463.
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
function buildArt9Paragraphs(datos: Record<string, unknown>, jurisdiccion: string): string[] {
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
  }

  // Domicilio legal según jurisdicción
  const domicilioLegal = jurisdiccion === 'san_rafael'
    ? 'Servando Butti 1658, San Rafael, Provincia de Mendoza, domicilio electrónico usuario 20-42749912-0 vpaez@zondalegal.com, lcalvo@zondalegal.com, info@zondaelegal.com, que solicito se valide, y número telefónico 260-154671231'
    : 'Catamarca 07, piso 2 oficina 10, Ciudad de Mendoza, domicilio electrónico usuario 20-42749912-0 vpaez@zondalegal.com, lcalvo@zondalegal.com, info@zondaelegal.com, que solicito se valide, y número telefónico 260-154671231'

  const ps: string[] = []

  const add  = (t: string, o?: Parameters<typeof p>[1]) => ps.push(p(t, o))
  const addH1 = (t: string) => ps.push(h1(t))
  const addH2 = (t: string) => ps.push(h2(t))

  // ── Encabezado ──────────────────────────────────────────────
  add('INTERPONE ACCIÓN DE AMPARO', { bold: true, center: true, spaceAfter: SPC_AFTER })
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
  add(`Que en tiempo y forma venimos a interponer acción de amparo conforme lo reglado por la Ley N° 16.986 y lo establecido por el artículo 43 de nuestra Constitución Nacional, a fin de que ordene a ANSES cesar de manera definitiva el descuento efectuado sobre el beneficio previsional de ${g.laEl} ${g.actora} bajo concepto DESCUENTO LEY 24463 ART 9 (o denominaciones similares), por resultar inaplicable al beneficio que percibe nuestra ${g.repO}.`)
  add(`Todo ello en tanto dicha deducción resulta irrazonable y manifiestamente arbitraria, en tanto es la propia demandada la que ha reconocido el carácter de DOCENTE de ${g.laEl} ${g.actora}, resultando por tanto inaplicable el tope mencionado.`)
  add(`Que tal acto arbitrario y embebido de ilegalidad manifiesta lesiona y restringe derechos individuales de ${g.laEl} ${g.actora} como el de integralidad del haber jubilatorio, de propiedad, de igualdad -garantizados constitucionalmente- generando un perjuicio grave, actual, cierto y colocando a ${g.laEl} ${g.actora} en una situación de desprotección frente a la afectación de sus haberes jubilatorios siendo los mismos de carácter alimentario.`)
  add(`Que, en razón de ello, solicito a Usía ordene reintegrar al actor todos los descuentos en concepto de "Art. 9" (u otra denominación análoga utilizada) que se hayan aplicado sobre el haber previsional de mi representado durante los 2 años anteriores a la interposición del presente amparo y aquellos montos que se devenguen durante la tramitación del presente, y hasta su efectivo pago, más intereses, por resultar una práctica ostensiblemente ilegítima conforme la inconstitucionalidad que al respecto ya ha decretado la CSJN.`)
  add(`Asimismo, solicito a V.S, que oportunamente se ordene el cese definitivo de los descuentos relativos a "Art. 9" en el haber de mi representado.`)
  add(`Que si al día de la sentencia, existiera ley, doctrina o jurisprudencia que aplicaran índices de actualización monetaria, por organismos oficiales o privados, atento al aumento de los índices inflacionarios existentes, solicito que los mismos sean aplicados a la presente causa, desde el día de la efectivización de la retención indebida hasta el día del efectivo pago, todo con expresa condenación en costas.`)

  // ── V. TEMPORALIDAD ─────────────────────────────────────────
  addH1('V.- TEMPORALIDAD')
  add(`La presente acción es promovida en tiempo oportuno, ello de acuerdo a lo dispuesto por el art. 2 inc. e) de la Ley 16.986, es decir que la demanda haya sido interpuesta dentro de los quince días hábiles a partir de la fecha en que el acto fue ejecutado o debió producirse.`)
  add(`En el caso de marras mi mandante ha quedado notificada formalmente del nuevo acto arbitrario de las demandadas al momento de percibir sus haberes mensuales.`)
  add(`Cabe destacar que la presente causa es de aquéllas que la doctrina y la jurisprudencia han calificado como de "ilegalidad continuada", en las cuales no es de aplicación el plazo de caducidad de la acción. Así lo sostuvo la Corte Suprema de Justicia en el precedente "Mosqueda" entre otros.`)
  add(`La ilegalidad perpetrada por el accionar de ANSES no se consuma en un acto sino que continua cada vez que las sumas son retenidas del haber previsional del actor.`)

  // ── VI. LEGITIMACIÓN ────────────────────────────────────────
  addH1('VI.- LEGITIMACIÓN')
  add(`La legitimación activa para deducir la presente acción de amparo se funda en la circunstancia de que ${g.laElTrat} ${nombreCompleto} es ${g.damnif} de la acción injustificada en la que incurre la accionada, generando un daño irreparable a su patrimonio, afectando su derecho a cobrar lo que legítimamente le corresponde: su haber previsional de jubilación en forma íntegra, "principio de integralidad", y la devolución de las sumas indebidamente descontadas.`)
  add(`En este sentido, es dable destacar V.S. que el artículo 43 de la CN y art. 40 de la Constitución Provincial habilitan a toda persona a interponer acción de amparo ante la configuración de los requisitos allí establecidos, circunstancia que se torna, de suyo, evidente en este supuesto.`)
  add(`Resulta insoslayable que el carácter de beneficiaria de una prestación previsional se encuentra acreditado con la documentación que se adjunta, y que ofrezco como prueba en el punto pertinente.`)

  // ── VII. COMPETENCIA ────────────────────────────────────────
  addH1('VII.- COMPETENCIA')
  add(`Que V.S. resulta competente para entender en esta causa en virtud de lo dispuesto por el artículo 4° de la Ley N° 16.986 que establece que será competente para conocer la acción de amparo el Juez de Primera Instancia con jurisdicción en el lugar en que el acto se exteriorice o tuviere o pudiere tener efecto. En consecuencia, se encuentra justificada la competencia territorial de V.S. debido a que los efectos de los actos se producen en su jurisdicción.`)
  add(`Como así también, cabe resaltar que la competencia federal se impone, correspondiendo entender a V.S. en esta causa por tratarse de una acción entablada contra actos de la entidad nacional "ANSES", y donde el discernimiento de las cuestiones planteadas involucran normas y principios institucionales y constitucionales de prioritaria trascendencia: Art. 14 bis de la CN: "El Estado otorgará los beneficios de la seguridad social, que tendrá carácter de integral e irrenunciable; "derecho de obtener una jubilación justa", "a percibir su jubilación", "de propiedad", "de igualdad".`)
  add(`Corresponde entender en este proceso al Juzgado Federal de la Provincia con competencia en la materia, en la medida que somete a debate el alcance de normas del mismo carácter.`)

  // ── VIII. HECHOS ─────────────────────────────────────────────
  addH1('VIII.- HECHOS')
  add(`Que mi mandante, ${g.trat} ${nombreCompleto}, es titular de beneficio previsional, con fecha de alta ${fechaJub}, habiéndosele reconocido el mismo en virtud de su desempeño profesional como Docente, bajo el amparo del Régimen Especial Docente (Decreto 137/2005 y Ley 24.016).`)
  add(`La naturaleza "especial" del beneficio percibido por esta parte resulta incontrastable y surge de los propios actos de la demandada. En efecto, de la simple lectura de las liquidaciones previsionales (bonos de haberes) y/o de la Resolución de otorgamiento que se acompaña, se desprende que ANSES ha reconocido y liquidado el beneficio bajo la normativa del Decreto 137/05 (Suplemento Régimen Especial Docente), lo que confirma, sin lugar a dudas, que ${g.laEl} ${g.actora} pertenece a un estatuto diferenciado del sistema general.`)
  add(`No obstante el reconocimiento de dicho estatus jurídico, el haber jubilatorio de mi ${g.repO} se ve mensual, sistemática e ilegítimamente cercenado por la aplicación del descuento en concepto de "Tope Haber Máximo" previsto en el Art. 9 de la Ley 24.463. Esta quita se materializa en los recibos de haberes bajo el concepto "DESCUENTO LEY 24.463 ART 9", resultando absolutamente improcedente, arbitraria y confiscatoria, por cuanto la Administración pretende limitar, mediante una norma general restrictiva, un beneficio amparado por un régimen especial que garantiza la integralidad del 82%.`)
  add(`Dicha conducta lesiva se verifica de manera continuada y actual, tal como se acredita con la prueba documental acompañada (recibos de haberes de los últimos 2 años), donde consta la aplicación efectiva del citado descuento.`)
  add(`En cuanto a la cuantía total del perjuicio económico acumulado, solicito que la misma sea determinada con exactitud al momento de dictarse la sentencia definitiva. A tales fines, la liquidación deberá practicarse en base al resultado de la prueba informativa e instrumental ofrecida en el Apartado XII de este escrito, mediante la cual se requerirá a la demandada la remisión de la totalidad de las liquidaciones previsionales (bonos de sueldo) de mi mandante desde la fecha de alta del beneficio. De dicha compulsa surgirá el detalle histórico de las sumas retenidas mensualmente bajo el concepto del Art. 9 de la Ley 24.463, permitiendo a V.S. cuantificar el daño y ordenar su reintegro en la sentencia, con más intereses y costas.`)

  // ── IX. PROCEDENCIA FORMAL ──────────────────────────────────
  addH1('IX.- PROCEDENCIA FORMAL DEL AMPARO')
  add(`La acción de amparo promovida resulta plenamente procedente por cuanto se verifican en autos todos los presupuestos de admisibilidad exigidos por el artículo 43 de la Constitución Nacional y la Ley 16.986.`)
  add(`Nos encontramos ante un acto de autoridad pública (ANSES) que, en forma actual e inminente, lesiona, restringe y altera con arbitrariedad e ilegalidad manifiesta derechos y garantías explícitamente reconocidos por nuestra Carta Magna (propiedad, integralidad del haber jubilatorio, igualdad ante la ley, defensa en juicio), no existiendo otro medio judicial más idóneo para la tutela urgente que el caso requiere.`)

  addH2('IX.1) IDONEIDAD DE LA VÍA Y ARBITRARIEDAD MANIFIESTA')
  add(`Nuestra Corte Suprema de Justicia de la Nación ha sostenido invariablemente que el amparo es un proceso utilizable en las delicadas y extremas situaciones en las que, por carecer de otras vías aptas, peligra la salvaguarda de derechos fundamentales, su apertura exige circunstancias muy particulares, caracterizadas por la presencia de arbitrariedad o ilegalidad manifiesta, frente a las cuales los procedimientos ordinarios resultan ineficaces.`)
  add(`En el caso de análisis, la arbitrariedad es patente, la Administración aplica un tope previsto para el régimen general a un beneficio amparado por un régimen especial, violentando el principio de legalidad y la jerarquía normativa. Esta conducta no requiere de mayor debate o prueba para ser desvirtuada, sino de la simple confrontación de la norma aplicada con el estatuto legal del beneficio, lo que torna al amparo en la vía procesal adecuada.`)
  add(`La Cámara Federal de Mendoza, Sala B, en reciente jurisprudencia, ha ratificado que el amparo ha dejado de ser una vía residual para convertirse en la principal ante arbitrariedades patentes. En los autos "AMARAL", sentenció:`)
  add(`"Asimismo, corresponde el ejercicio de la acción de amparo a tenor del nuevo artículo 43 de la CN, destacando que tal remedio procesal no puede tener ya un carácter residual, sino que debe considerárselo la vía principal y excluyente de otras, carentes de celeridad, cuando se advierte la existencia de un accionar arbitrario o ilegítimo". (Cámara Federal de Mendoza, Sala B, "AMARAL, MARIA JULIA c/ ANSES s/ AMPARO LEY 16.986", Expte. Nº 24988/2025, sentencia del 11/12/2025).`, { italic: true })
  add(`Al respecto, la misma Sala tiene dicho en autos de análogo objeto:`)
  add(`"No obstante, la Corte Federal ha sostenido que, si bien, es cierto que la vía excepcional del amparo, en principio, no sustituye las instancias ordinarias judiciales... no lo es menos que, siempre que aparezca de un modo claro y manifiesto el daño grave e irreparable que se causaría remitiendo el examen de la cuestión a los procedimiento ordinarios... corresponderá que los jueces restablezcan de inmediato el derecho restringido por la vía rápida del recurso de amparo a fin de que el curso de los procedimientos ordinarios no torne abstracta o tardía la efectividad de las garantías constitucionales". (Fallos 280:228; 294:152, citados por Cám. Fed. Mza).`, { italic: true })
  add(`Asimismo, el Máximo Tribunal ha señalado que la exclusión del amparo por la existencia de otros recursos no puede fundarse en una apreciación meramente ritual e insuficiente, ya que el instituto tiene por objeto una efectiva protección de derechos más que una ordenación o resguardo de competencias (Fallos 330:5201). Como bien destaca el Dr. Rosatti (Fallos 342:2125), el amparo constituye una herramienta cuyo núcleo es la defensa de derechos frente a violaciones que imponen una respuesta jurisdiccional urgente.`)

  addH2('IX.2) TUTELA DIFERENCIADA Y VULNERABILIDAD DEL ADULTO MAYOR')
  add(`Resulta imperioso destacar que la procedencia de esta acción se cimienta en la condición de sujeto vulnerable de mi mandante. La jurisprudencia reciente de este fuero ha incorporado el concepto de "Tutela Diferenciada" para los adultos mayores, conforme la Convención Interamericana sobre la Protección de los Derechos Humanos de las Personas Mayores (Ley 27.360).`)
  add(`La Sala A de la Cámara Federal de Mendoza, en el reciente fallo "LUCERO", ha sido contundente al respecto:`)
  add(`"Dentro de la vulnerabilidad de los adultos mayores podemos destacar sin hesitación, el peligro siempre inminente de que el plazo del proceso sea tan largo y escabroso que no se logre la justicia por no haber llegado a tiempo la solución... Las tutelas diferenciadas, son herramientas de protección de los derechos fundamentales y su objeto es remover la acción ilícita sobre los mismos... En el presente caso, las circunstancias fácticas de vulnerabilidad... hacen que la vía del amparo sea la más adecuada y más idónea para la solución del conflicto". (Cámara Federal de Mendoza, Sala A, "LUCERO, ESTELA MARISA c/ ANSES s/ AMPARO LEY 16.986", Expte. FMZ N° 25034/2024/CA1, sentencia del 25/11/2025).`, { italic: true })

  addH2('IX.3) INNECESARIEDAD DEL AGOTAMIENTO DE LA VÍA ADMINISTRATIVA Y RITUALISMO INÚTIL')
  add(`La exigencia del reclamo administrativo previo se torna, en casos como el presente, en un ritualismo inútil que solo dilataría la protección de un crédito de naturaleza alimentaria. La jurisprudencia es conteste en que no es exigible el agotamiento de la vía administrativa cuando el acto lesivo emana de una norma general o cuando la demora pueda tornar ineficaz la tutela judicial.`)
  add(`Sobre este punto, la Cámara Federal de Mendoza (Sala B), en el fallo "DEFACCI", rechazó los agravios de la demandada sobre la improcedencia de la vía, sosteniendo que:`)
  add(`"A lo expuesto, debe añadirse que la cuestión a resolver no requiere de mayor debate o prueba a los fines de la debida acreditación de la alegada existencia de arbitrariedad e ilegalidad manifiesta. Retrotraer el proceso en esta instancia, implicaría un ritualismo formal excesivo y un desgaste jurisdiccional innecesario, además del concreto y evidente perjuicio al accionante, máxime cuando el objeto del proceso detenta la naturaleza previsional mentada". (Cámara Federal de Mendoza, Sala B, "DEFACCI, ADRIANA ALEJANDRA c/ ANSES s/ AMPARO LEY 16.986", Expte. Nº 16651/2025, sentencia del 02/12/2025).`, { italic: true })
  add(`Paralelamente, la Sala I de la CNFed. Contencioso Administrativo ha dicho: "(...) hoy, frente al texto del nuevo art. 43 de la Carta Magna, no puede sostenerse ya como requisito de procedencia de este remedio sumarísimo y excepcional la inexistencia de vía administrativa idónea para la tutela del derecho que se invoca como conculcado" ("Aydin S. A. c. Secretaría de Medios", 22/05/1996).`)

  addH2('IX.4) TEMPORALIDAD Y DAÑO CONTINUADO')
  add(`Se rechaza cualquier planteo de extemporaneidad o caducidad de la acción (Art. 2 inc. e, Ley 16.986), por cuanto nos encontramos frente a un supuesto de ilegalidad continuada.`)
  add(`El acto lesivo (el descuento) se renueva mes a mes con cada liquidación de haberes, actualizando periódicamente el perjuicio y el plazo para accionar. La doctrina y jurisprudencia son pacíficas al respecto:`)
  add(`"Ello así, porque la presente causa es de aquellas que la doctrina y la jurisprudencia han calificado como de 'ilegalidad continuada', en las cuales no es de aplicación el plazo de caducidad de la acción, tal como sostuvo la Corte Suprema de Justicia de la Nación en el precedente 'Mosqueda' (Fallos 329:4918), entre otros." ("Zallocco viuda de Chifani, Mónica Susana c/ ENA y Anses y otro s/ Amparo". Cámara Federal de Mendoza, Sala A).`, { italic: true })

  // ── X. INAPLICABILIDAD ──────────────────────────────────────
  addH1('X.- INAPLICABILIDAD DEL TOPE DISPUESTO POR EL ART. 9 DE LA LEY 24.463')
  add(`Que a continuación transcribo la norma que se ataca:`)
  add(`"ARTICULO 9º — Haberes máximos. 1. Las prestaciones que se otorguen después de la sanción de la presente ley y en virtud de leyes anteriores a la Ley 24.241 tendrán el tope máximo establecido en la ley respectiva. 2. Los haberes previsionales mensuales correspondientes a las prestaciones otorgadas en virtud de leyes anteriores a la Ley 24.241 que no tuvieren otro haber máximo menor, en la suma equivalente al ochenta y dos por ciento (82%) del monto máximo de la remuneración sujeta a aportes y contribuciones (...) estarán sujetos a la siguiente escala de deducciones: (...)"`, { italic: true })
  add(`Ahora bien, conforme el análisis literal de la norma, se requiere del cumplimiento de dos condiciones para que pueda ser efectivo el descuento por tope: 1°) que la prestación haya sido otorgada en virtud de leyes anteriores a la ley 24.241; y 2°) que la prestación no cuente con otro tope máximo mayor.`)
  add(`En el caso de marras, no se cumple con el primer recaudo. La prestación de ${g.laEl} ${g.actora} se otorga bajo el amparo del Régimen Especial para Docentes (Decreto 137/05 y Ley 24.016). Este régimen posee una garantía específica de movilidad y, en su reactivación mediante el Decreto 137/2005, constituye una norma especial y posterior a la sanción de la Ley de Solidaridad Previsional (24.463).`)

  addH2('X.1) LA SUPREMACÍA DEL RÉGIMEN ESPECIAL DOCENTE (DEC. 137/05 y LEY 24.016)')
  add(`El Decreto 137/2005 fue dictado con el objeto específico de crear el suplemento "Régimen Especial para Docentes" para abonar la diferencia entre el haber del sistema general y el porcentaje del 82% establecido en la Ley 24.016.`)
  add(`Resulta una contradicción jurídica insalvable que el Estado Nacional, por un lado, reconozca mediante el Dec. 137/05 el derecho a un suplemento para alcanzar el 82%, y por el otro, mediante la aplicación mecánica del Art. 9 de la Ley 24.463 (norma general y anterior), proceda a confiscar parte de ese mismo haber mediante topes no previstos en el estatuto docente.`)
  add(`Como bien sostiene la doctrina clásica, Lex specialis derogat legi generali. La Ley 24.463 regula el Sistema Integrado general, mientras que el Decreto 137/05 y la Ley 24.016 regulan el estatuto especial del docente, el cual no prevé topes máximos en su diseño de movilidad.`)

  addH2('X.2) INCONSTITUCIONALIDAD Y EXCESO REGLAMENTARIO DE LA RESOLUCIÓN SSS 06/2009')
  add(`Es fundamental destacar que la aplicación efectiva de este tope en el recibo de haberes de mi mandante se instrumenta a través de la Resolución SSS 06/2009. Esta norma administrativa, en su artículo 9, dispone arbitrariamente la aplicación de la escala de deducción del 15% sobre el excedente del haber máximo a las prestaciones previsionales, sin distinguir ni excluir a los regímenes especiales docentes.`)
  add(`Esto constituye un palmario exceso reglamentario violatorio del Art. 99 inc. 2 de la Constitución Nacional. Una resolución de la Secretaría de Seguridad Social no puede imponer una quita patrimonial (el tope) a un beneficio que está amparado por un Decreto del Poder Ejecutivo (137/05) y una Ley Nacional (24.016) que garantizan la integralidad del haber.`)
  add(`Al no existir en la Ley 24.016 ni en el Decreto 137/05 una limitación de "haber máximo", la Resolución 06/09 crea una restricción sustancial al derecho de propiedad no prevista por el legislador, alterando el espíritu de la ley que dice reglamentar.`)
  add(`Este argumento ha sido receptado explícitamente por la Cámara Federal de Mendoza, Sala B, en los recientes autos "APARICI, ROSA MARIA c/ ANSES" (Fallo del 12/12/2025), donde el Tribunal de Alzada declaró:`)
  add(`"Así, advierto que el Art. 14 de la Resolución de la Secretaría de Seguridad Social Nº 6/2009 ha creado un nuevo tope que no está previsto en el Art. 24 de la Ley Nº 24.241, de donde surge un claro exceso reglamentario (...) La Resolución de la SSS 6/2009 resulta inconstitucional por vulnerar la debida proporción entre el haber de pasividad y el haber de actividad, limitando por una reglamentación más allá de la misma ley, alterando, el texto constitucional previsto en el artículo 14 bis." (Cámara Federal de Mendoza, Sala B, "APARICI, ROSA MARIA c/ ANSES s/AMPARO LEY 16.986", Expte. Nº 23761/2025, sentencia del 12/12/2025).`, { italic: true })

  addH2('X.3) JURISPRUDENCIA UNIFORME Y PACÍFICA DE LA CÁMARA FEDERAL DE MENDOZA EN CASOS ANÁLOGOS')
  add(`La postura aquí vertida tiene recepción favorable, actual y uniforme en la jurisprudencia de nuestro fuero federal. Es dable destacar que la Sala B de la Excma. Cámara Federal de Apelaciones de Mendoza ha dictado una serie de sentencias en noviembre y diciembre de 2025 que consolidan, sin lugar a dudas, la inaplicabilidad del Art. 9 de la Ley 24.463 a los regímenes especiales docentes.`)
  add(`No se trata de antecedentes aislados, sino de un criterio jurisprudencial consolidado y pacífico que V.S. debe considerar a los fines de la economía procesal y la seguridad jurídica. A saber, algunos de los antecedentes que se pueden citar son los casos:`)
  add(`"AMARAL, MARIA JULIA c/ ANSES s/ AMPARO" (Expte. 24988/2025 - Sala B, 11/12/2025): Confirma la inaplicabilidad del tope citando a la CSJN en "Guzmán" y rechaza el argumento de ANSES sobre la "cuestión política no justiciable".`)
  add(`"GASTALDO, MIRTA ELSA c/ ANSES s/ AMPARO" (Expte. 24337/2025 - Sala B, 12/12/2025): Ratifica que el régimen de la Ley 24.016 (docentes) ha quedado sustraído de las disposiciones del sistema general.`)
  add(`"APARICI, ROSA MARIA c/ ANSES s/ AMPARO" (Expte. 23761/2025 - Sala B, 12/12/2025): Declara inconstitucional la Res. SSS 06/2009 por exceso reglamentario.`)
  add(`"DEFACCI, ADRIANA ALEJANDRA c/ ANSES s/ AMPARO" (Expte. 16651/2025 - Sala B, 02/12/2025): Confirma la inaplicabilidad del tope y la competencia judicial para el control de constitucionalidad.`)
  add(`"SAAVEDRA, JORGE EDUARDO c/ ANSES s/ AMPARO" (Expte. 14619/2025 - Sala B, 19/11/2025): Reitera la analogía con el fallo "Gemelli" de la Corte Suprema.`)
  add(`En el fallo "DEFACCI", la Cámara establece contundentemente:`)
  add(`"Tampoco prosperará el agravio de la demandada dirigido a cuestionar la inaplicabilidad del tope previsto por el art. 9 de la ley N°24.463. Sobre el particular, cabe remitirse a lo decidido por la Corte Suprema de Justicia de la Nación en la causa 'Guzmán, Cristina c/ ANSES' (Fallo 339:189, del 2/3/16), oportunidad en la que el Máximo Tribunal concluyó que el art. 9 de la ley 24.463 no resulta aplicable al haber de una persona que obtuvo su jubilación bajo el régimen especial de jubilaciones y pensiones previsto por la ley 24.016 para el personal docente." (Cámara Federal de Mendoza, Sala B, "DEFACCI, ADRIANA ALEJANDRA c/ ANSES s/AMPARO LEY 16.986", Expte. Nº 16651/2025, sentencia del 02/12/2025).`, { italic: true })
  add(`Asimismo, en los autos "SAAVEDRA", la Alzada ratifica la vigencia del fallo "Gemelli", sosteniendo:`)
  add(`"Que, en consecuencia, (...) guardan sustancial analogía con cuestiones que han sido tratadas por el Tribunal en el precedente 'Gemelli' (Fallos: 328:2829) en el que se afirmó que el régimen jubilatorio de la ley 24.016 ha quedado sustraído de las disposiciones que integran el sistema general reglamentado por las leyes 24.241 y 24.463, con el que coexiste, manteniéndose vigente con todas sus características." (Cámara Federal de Mendoza, Sala B, "SAAVEDRA, JORGE EDUARDO c/ ANSES s/AMPARO LEY 16.986", Expte. Nº 14619/2025, sentencia del 19/11/2025).`, { italic: true })
  add(`Por su parte, en el fallo "AMARAL", respecto al planteo que suele esgrimir ANSES sobre que los topes son una "cuestión política no justiciable", la Cámara Federal de Mendoza (citando a su vez el fallo "Colombo" de la CFSS) ha rechazado de plano tal defensa:`)
  add(`"No se advierte que se trate de un acto político y/o de gobierno no susceptible de control jurisdiccional (...) la constitucionalidad del tope del artículo 9 de la ley 24.463 es una cuestión netamente jurídica y, por tanto, justiciable." (Cámara Federal de Mendoza, Sala B, "AMARAL, MARIA JULIA c/ ANSES s/AMPARO LEY 16.986", Expte. Nº 24988/2025, sentencia del 11/12/2025).`, { italic: true })
  add(`Es decir, la jurisprudencia local es pacífica al considerar que el régimen docente de la Ley 24.016 (al cual accede mi mandante vía Dec. 137/05) está "sustraído" del sistema general y, por ende, exento de sus topes.`)

  addH2('X.4) INAPLICABILIDAD EN CASO DE SIMULTANEIDAD DE SERVICIOS')
  add(`A mayor abundamiento, y para el hipotético caso de que V.S. considerara que el tope pudiera tener alguna vigencia residual, el mismo jamás podría aplicarse sobre la totalidad del haber en los casos de beneficios otorgados por simultaneidad de servicios.`)
  add(`Dado que el beneficio de mi mandante se compone, en gran medida, de servicios pertenecientes al régimen especial docente (Dec. 137/05), el tope del Art. 9 Ley 24.463 es inaplicable a la porción del haber generada bajo dicho régimen especial. Aplicar el tope indiscriminadamente sobre el componente 'especial' del haber implica confiscar la garantía del 82% que el Decreto 137/05 vino expresamente a restituir.`)
  add(`Esta distinción también ha sido receptada en primera instancia, tal como surge de los autos "BESSO PIANETTO, JORGE OSCAR c/ ANSES" (Juzgado Federal N° 4 de Mendoza, 19/09/2025), donde se resolvió declarar la inaplicabilidad del tope "solo en la parte que corresponde a la integración del haber bajo dicho régimen legal (...) no así sobre la parte proporcional del haber que corresponde a la prestación por simultaneidad de la Ley 24241 del régimen general", criterio que solicitamos se aplique subsidiariamente para resguardar, al menos, la porción del haber amparada por el régimen especial.`)
  add(`En definitiva, las normas cuestionadas (Art. 9 Ley 24.463 y Res. SSS 06/09) contravienen el derecho a la propiedad y la integralidad del haber jubilatorio, garantías constitucionales que solicitamos sean restablecidas mediante la presente acción.`)

  // ── XI. EXENCIÓN DE GANANCIAS SOBRE RETROACTIVOS ────────────
  addH1('XI.- EXENCIÓN DE IMPUESTO A LAS GANANCIAS SOBRE LOS RETROACTIVOS')
  add(`Resulta necesario que se declaren exentos del impuesto a las ganancias los valores retroactivos que surjan de la liquidación de las diferencias que corresponda restituir a mi poderdante en virtud de la manda que surja de este proceso, tanto respecto del capital como de los intereses que tal retroactividad devengue.`)

  // ── XII. CONTROL DE CONVENCIONALIDAD ───────────────────────
  addH1('XII.- CONTROL DE CONVENCIONALIDAD.')
  add(`Que conforme la recepción constitucional de diversos tratados internacionales (Art. 75 inc. 22 C.N.) y en relación a los derechos que en esta acción planteamos, los mismos se encuentran expresamente consagrados en el plexo normativo supranacional, Art. XVI (derecho a la seguridad social), XVIII y XXIV de la Declaración Americana de los Derechos y Deberes del Hombre y Art. 8 de la Declaración Universal de Derechos Humanos.`)
  add(`Asimismo, resulta de aplicación imperativa la Convención Interamericana sobre la Protección de los Derechos Humanos de las Personas Mayores, ratificada por Ley 27.360, que otorga jerarquía constitucional a la protección especial de los adultos mayores.`)
  add(`Al respecto, la jurisprudencia local ha sido contundente. En la causa "Zallocco Vda. de Chifani, Mónica c/ ENA, ANSES y ot. s/ Amparo", la Cámara Federal de Mendoza se pronunció sosteniendo que:`)
  add(`"La Convención Americana sobre la Protección de los Derechos Humanos de las Personas Mayores (CIPDHPM), consagra el compromiso de los Estados partes para adoptar y fortalecer todas las medidas legislativas, administrativas, judiciales, presupuestarias y de cualquier otra índole, incluido el adecuado acceso a la justicia a fin de garantizar a la persona mayor un trato diferenciado y preferencial en todos los ámbitos. (...) Dicho imperativo constitucional resulta transversal a todo el ordenamiento jurídico, proyectándose concretamente a la materia tributaria, ya que no es dable postular que el Estado actúe con una mirada humanista en ámbitos carentes de contenido económico inmediato (libertades de expresión, ambulatoria o tránsito) y sea insensible al momento de definir su política fiscal (…)".`, { italic: true })
  add(`En consecuencia, el descuento confiscatorio aquí impugnado no solo vulnera la ley interna, sino que violenta los compromisos internacionales asumidos por el Estado Argentino de garantizar una vida digna y un trato preferencial a las personas mayores, obligando al control de convencionalidad de la norma cuestionada.`)

  // ── XII. PRUEBA ─────────────────────────────────────────────
  addH1('XII.- PRUEBA')
  add(`A fin de acreditar los extremos invocados, ofrezco la siguiente prueba:`)
  add(`A) INSTRUMENTAL:`, { bold: true })
  add(`Se acompaña la siguiente documentación original y/o en copias simples para ser agregadas a autos:`)
  add(`Anexo I: Poder Apud Acta`)
  add(`Anexo II: Copia del Documento Nacional de Identidad de la parte actora.`)
  add(`Anexo III: Recibos de Haberes (Bonos de Sueldo): Se adjuntan las liquidaciones previsionales correspondientes a los últimos 2 años, en los cuales consta la efectiva aplicación del descuento bajo el código "DESCUENTO LEY 24.463 ART 9" (o la denominación que figure).`)
  add(`Para el hipotético caso de que la demandada desconozca la autenticidad de esta documentación acompañada, solicito se libre oficio a la ANSES a fin de que remita a este Tribunal, en formato digital o papel, el detalle completo de las liquidaciones mensuales (sábana de haberes o histórico de pagos) de los 2 años previos a la interposición de esta demanda y hasta la fecha de efectivo pedido de los mismos, ello con la finalidad que V.S. pueda constatar en la sentencia definitiva el monto exacto descontado y con ello proceder a la liquidación del capital, intereses y costas en dicho pronunciamiento, conforme lo solicitado en el apartado "VIII.- Hechos" de este escrito de inicio.`)
  add(`B) INSTRUMENTAL EN PODER DE LA CONTRARIA:`, { bold: true })
  add(`Solicito se libre oficio a la ANSES a fin de que remita a este Tribunal, en formato digital o papel, el detalle completo de las liquidaciones mensuales (sábana de haberes o histórico de pagos) del beneficio de mi mandante, desde la fecha de alta del mismo hasta la actualidad.`)
  add(`Esta prueba tiene por finalidad que V.S. pueda constatar en la sentencia definitiva el monto exacto descontado mes a mes en concepto de "Tope Art. 9 Ley 24.463" y proceder a la liquidación del capital, intereses y costas en dicho pronunciamiento, conforme lo solicitado en el apartado VIII.- Hechos de este escrito de inicio.`)

  // ── XV. PETITORIO ───────────────────────────────────────────
  addH1('XV.- PETITORIO')
  add(`Por todo lo expuesto, a V.S. solicito:`)
  add(`Me tenga por presentado, por parte en el carácter invocado y con el domicilio legal y electrónico constituidos.`)
  add(`Tenga por interpuesta en tiempo y forma la presente ACCIÓN DE AMPARO (Art. 43 C.N. y Ley 16.986) contra la ADMINISTRACIÓN NACIONAL DE LA SEGURIDAD SOCIAL (A.N.S.E.S.).`)
  add(`Tenga por ofrecida la prueba documental acompañada y, para el caso de desconocimiento, ordene la producción de la prueba informativa subsidiaria.`)
  add(`Tenga presente la reserva del Caso Federal efectuada para ocurrir ante la CSJN.`)
  add(`Oportunamente, dicte sentencia haciendo lugar a la acción de amparo en todas sus partes, resolviendo: a) Declarar la INAPLICABILIDAD del tope previsto en el Art. 9 de la Ley 24.463 y la INCONSTITUCIONALIDAD / INAPLICABILIDAD de la Resolución SSS 06/2009 (y normativa concordante) respecto del beneficio previsional de la parte actora, por encontrarse amparado por un Régimen Especial Docente. b) Ordenar a ANSES el cese definitivo de los descuentos por dicho concepto. c) Condenar a ANSES a restituir la totalidad de las sumas indebidamente retenidas por aplicación de dicho tope correspondiente a los períodos no prescriptos, con más sus intereses correspondientes (Tasa Pasiva B.C.R.A. o la que V.S. estime corresponder para mantener la incolumidad del crédito) hasta su efectivo pago. d) Declarar EXENTO del Impuesto a las Ganancias al capital retroactivo e intereses que se generen a favor del actor como consecuencia de la presente sentencia.`)
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
  <dc:title>Acción de Amparo Art. 9 Ley 24.463</dc:title>
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
  if (tramite.tipo !== 'ART9') return new NextResponse('Tipo de trámite incorrecto', { status: 400 })

  const datos       = (tramite.datos_cliente   ?? {}) as Record<string, unknown>
  const propuesta   = (tramite.datos_propuesta ?? {}) as Record<string, unknown>
  const jurisdiccion = String(propuesta.jurisdiccion ?? 'mendoza')

  if (!propuesta.jurisdiccion)
    return new NextResponse('Jurisdicción no seleccionada. Seleccioná el juzgado en el panel antes de generar.', { status: 400 })

  // Construir párrafos
  const paragraphs = buildArt9Paragraphs(datos, jurisdiccion)
  const docXml     = buildDocumentXml(paragraphs)

  // Escribir archivos en tmpdir
  const uid     = randomUUID().replace(/-/g, '').slice(0, 8)
  const tmpDir  = join(tmpdir(), `art9_${uid}`)
  const wordDir = join(tmpDir, 'word')
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

  const zipPath = join(tmpdir(), `Amparo_Art9_${uid}.docx`)
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
      'Content-Disposition': `attachment; filename="Amparo_Art9_${uid}.docx"`,
    },
  })
}
