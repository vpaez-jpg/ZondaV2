import { NextRequest, NextResponse } from 'next/server'

// Las 45 clases de Niza (resumen para el prompt)
const CLASES_NIZA_RESUMEN = `
Clase 1: Productos químicos para industria, ciencia, fotografía, agricultura. Resinas sintéticas, plásticos.
Clase 2: Pinturas, barnices, lacas. Preservativos contra herrumbre y deterioro. Colorantes y tintes.
Clase 3: Preparaciones para blanquear, limpiar y pulir. Jabones, cosméticos, perfumes, dentífricos.
Clase 4: Aceites y grasas industriales. Combustibles y materias de alumbrado. Bujías, mechas.
Clase 5: Productos farmacéuticos y veterinarios. Productos higiénicos para la medicina. Alimentos para bebés. Suplementos dietéticos.
Clase 6: Metales comunes y sus aleaciones. Materiales de construcción metálicos. Herramientas de mano metálicas.
Clase 7: Máquinas, herramientas máquinas. Motores (excepto para vehículos terrestres). Impresoras. Aparatos agrícolas.
Clase 8: Herramientas e instrumentos de mano accionados manualmente. Cuchillería, tenedores y cucharas. Armas blancas.
Clase 9: Aparatos e instrumentos científicos, náuticos, geodésicos, fotográficos, cinematográficos. Computadoras, software, apps. Aparatos eléctricos y electrónicos. Teléfonos celulares.
Clase 10: Aparatos e instrumentos quirúrgicos, médicos, dentales y veterinarios. Artículos ortopédicos.
Clase 11: Aparatos de alumbrado, calefacción, producción de vapor, cocción, refrigeración, secado, ventilación. Aires acondicionados.
Clase 12: Vehículos. Aparatos de locomoción terrestre, aérea o acuática. Automóviles, motocicletas, bicicletas.
Clase 13: Armas de fuego. Municiones y proyectiles. Explosivos. Fuegos artificiales.
Clase 14: Metales preciosos y sus aleaciones. Joyas, bisutería, piedras preciosas. Relojes.
Clase 15: Instrumentos musicales.
Clase 16: Papel y cartón. Productos de imprenta. Material de encuadernación. Fotografías. Papelería. Artículos de oficina. Material de instrucción o de enseñanza. Embalajes de papel o cartón.
Clase 17: Caucho, gutapercha, goma, amianto, mica. Materiales de aislamiento eléctrico. Mangueras flexibles no metálicas.
Clase 18: Cuero e imitaciones de cuero. Pieles de animales. Baúles y maletas. Paraguas y sombrillas. Arneses y artículos de talabartería. Bolsos, carteras, mochilas.
Clase 19: Materiales de construcción no metálicos. Tuberías rígidas no metálicas. Asfalto, pez y betún. Construcciones transportables no metálicas. Monumentos no metálicos.
Clase 20: Muebles, espejos, marcos. Productos de madera, corcho, caña, junco, mimbre, cuerno, hueso, marfil, ballena, concha, ámbar, nácar, espuma de mar.
Clase 21: Utensilios y recipientes para uso doméstico. Peines y esponjas. Cepillos. Materiales para cepillos. Artículos de limpieza. Cristalería, porcelana y loza.
Clase 22: Cuerdas, bramantes, redes, tiendas de campaña, toldos, velas, sacos y bolsas. Materiales de acolchado y relleno. Materias textiles fibrosas en bruto.
Clase 23: Hilos para uso textil.
Clase 24: Tejidos y sus sustitutos. Ropa de cama y de mesa. Cobertores. Telas.
Clase 25: Prendas de vestir, calzado, artículos de sombrerería. Ropa, zapatos, sombreros.
Clase 26: Encajes y bordados, cintas y lazos. Botones, corchetes y ojetes, alfileres y agujas. Flores artificiales.
Clase 27: Alfombras, felpudos, esteras, linóleum y otros revestimientos de suelos. Tapices y tapicerías de pared no textiles.
Clase 28: Juegos, juguetes, artículos de gimnasia y de deporte. Adornos para árboles de Navidad.
Clase 29: Carne, pescado, aves y caza. Extractos de carne. Frutas y verduras, hortalizas y legumbres. Gelatinas, mermeladas, compotas. Huevos. Leche y productos lácteos. Aceites y grasas comestibles.
Clase 30: Café, té, cacao y sucedáneos del café. Arroz, pasta y fideos. Tapioca y sagú. Harinas y preparaciones hechas de cereales. Pan, pastelería y confitería. Chocolate. Helados. Azúcar, miel y siropes. Levadura, polvos de hornear. Sal, mostaza. Vinagre, salsas. Especias. Hielo.
Clase 31: Granos y semillas (en bruto). Frutas y hortalizas frescas. Plantas y flores naturales. Animales vivos. Alimentos para animales. Malta.
Clase 32: Cervezas. Aguas minerales y gaseosas y otras bebidas no alcohólicas. Bebidas y zumos de frutas. Siropes y otras preparaciones para hacer bebidas.
Clase 33: Bebidas alcohólicas (excepto cervezas). Vinos, licores, aperitivos.
Clase 34: Tabaco. Artículos para fumadores. Cigarrillos electrónicos. Fósforos.
Clase 35: Publicidad. Gestión de negocios comerciales. Administración comercial. Trabajos de oficina. Servicios de marketing. Comercio al por mayor y al por menor. E-commerce.
Clase 36: Seguros. Negocios financieros. Negocios monetarios. Negocios inmobiliarios. Servicios bancarios.
Clase 37: Construcción. Reparación. Servicios de instalación. Mantenimiento de edificios.
Clase 38: Telecomunicaciones. Servicios de internet y comunicación. Transmisión de datos.
Clase 39: Transporte. Embalaje y almacenaje de mercancías. Organización de viajes. Logística y distribución.
Clase 40: Tratamiento de materiales. Fabricación personalizada. Impresión 3D. Reciclaje.
Clase 41: Educación. Formación. Servicios de entretenimiento. Actividades deportivas y culturales. Publicación de libros y revistas.
Clase 42: Servicios científicos y tecnológicos. Investigación y diseño. Análisis y consultoría industrial. Diseño de software. Servicios de computación en la nube. Desarrollo web y de apps.
Clase 43: Servicios de restauración (alimentación). Hospedaje temporal. Hoteles, restaurantes, bares, cafeterías.
Clase 44: Servicios médicos. Servicios veterinarios. Cuidados de higiene y de belleza para personas y animales. Peluquerías, salones de belleza. Servicios de agricultura, horticultura y silvicultura.
Clase 45: Servicios jurídicos. Servicios de seguridad para la protección de bienes y personas. Servicios personales y sociales prestados por terceros para satisfacer necesidades individuales.
`

export async function POST(req: NextRequest) {
  const { descripcion } = await req.json()

  if (!descripcion || descripcion.trim().length < 5) {
    return NextResponse.json({ error: 'Descripción demasiado corta' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Fallback sin API key: devolver respuesta vacía para que el partner ingrese manual
    return NextResponse.json({ clases: [], sinApiKey: true })
  }

  const prompt = `Sos un especialista en propiedad intelectual argentino. Analizá la siguiente descripción de una empresa/marca y determiná cuáles de las 45 clases de la Clasificación Internacional de Niza corresponden registrar.

DESCRIPCIÓN DEL CLIENTE: "${descripcion}"

CLASES DISPONIBLES:
${CLASES_NIZA_RESUMEN}

Respondé ÚNICAMENTE con un JSON válido con este formato exacto, sin texto adicional:
{
  "clases": [
    {
      "numero": 30,
      "nombre": "Café, té, cacao y sucedáneos del café...",
      "motivo": "Razón breve de por qué aplica",
      "descripcion_cliente": "Una o dos oraciones describiendo específicamente los productos o servicios de ESTE cliente que caen en esta clase. Usar terminología del INPI. Por ejemplo: helados artesanales, bombones rellenos, preparaciones de cacao y confitería en general."
    }
  ]
}

Reglas:
- Incluí solo las clases realmente relevantes (típicamente 1-4 clases). Priorizá exactitud sobre cantidad.
- En "descripcion_cliente" describí los productos/servicios concretos de este cliente dentro de esa clase, no la descripción genérica de la clase.
- Usá el mismo registro formal del INPI (substantivos, sin verbos en infinitivo).`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      console.error('Anthropic API error:', await response.text())
      return NextResponse.json({ clases: [], error: 'Error al clasificar' })
    }

    const data = await response.json()
    const texto = data.content?.[0]?.text ?? ''

    // Extraer JSON de la respuesta
    const match = texto.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ clases: [] })

    const parsed = JSON.parse(match[0])
    return NextResponse.json(parsed)
  } catch (err) {
    console.error('Error clasificando clases Niza:', err)
    return NextResponse.json({ clases: [] })
  }
}
