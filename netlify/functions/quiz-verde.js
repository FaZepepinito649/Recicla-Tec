// Netlify Function: /.netlify/functions/quiz-verde
// Recibe { answers, baseScore } desde el frontend y genera un análisis
// personalizado con IA sobre qué tan "verde" es el estilo de vida del usuario,
// junto con tips accionables para mejorar — contextualizado a SLP / México.

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { answers, baseScore } = await req.json();

    if (!Array.isArray(answers) || answers.length === 0) {
      return new Response(JSON.stringify({ error: 'answers debe ser un array no vacío' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const apiKey = Netlify.env.get('GROQ_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key no configurada' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Resumen compacto de respuestas para el prompt
    const resumen = answers.map((a, i) =>
      `${i + 1}. [${a.topic}] "${a.question}" → respuesta: "${a.choice}" (puntaje: ${a.score}/4)`
    ).join('\n');

    // Identificar áreas débiles (respuestas con score <= 2)
    const debiles = answers
      .filter(a => a.score <= 2)
      .map(a => a.topic)
      .join(', ') || 'ninguna área crítica';

    const system = `Eres un experto en sustentabilidad y educación ambiental para San Luis Potosí, México. Analizas el estilo de vida ecológico de una persona y le das retroalimentación personalizada, honesta pero motivadora, en español mexicano informal.

REGLAS ESTRICTAS:
- Responde SOLO con JSON válido, sin markdown, sin backticks, sin texto extra
- El JSON debe tener EXACTAMENTE esta estructura:

{"analysis":"análisis personalizado de 2-3 oraciones","tips":["tip accionable 1","tip accionable 2","tip accionable 3","tip accionable 4"]}

- "analysis": 2-3 oraciones que resuman el estilo de vida del usuario basándote en sus respuestas. Sé honesto: si lo hace bien, felicítalo; si hay áreas débiles, menciónalas con empatía. NO uses saludos genéricos.
- "tips": entre 3 y 5 recomendaciones CONCRETAS, específicas y accionables. Cada tip debe:
  * Ser corto (máximo 1-2 oraciones)
  * Enfocarse en las áreas más débiles del usuario
  * Ser realista y aplicable en San Luis Potosí / México (menciona recicladoras locales, mercados, tianguis, OXXO, costumbres mexicanas cuando sea relevante)
  * Empezar con un verbo en imperativo ("Lleva...", "Separa...", "Cambia...")
  * NO ser genérico ("recicla más" NO vale, "lleva tus PET al CIEA Casa Colorada los viernes" SÍ vale)`;

    const userMsg = `Respuestas del usuario:
${resumen}

Puntaje base calculado: ${baseScore}/${answers.length * 4}
Áreas más débiles detectadas: ${debiles}

Genera el análisis personalizado y los tips. Responde SOLO con JSON.`;

    const payload = {
      model: 'llama-3.1-8b-instant',
      max_tokens: 600,
      temperature: 0.8,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg }
      ]
    };

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error('Groq error:', errText);
      return new Response(JSON.stringify({ error: 'API error', detail: errText }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await r.json();
    let text = data.choices?.[0]?.message?.content || '';

    // Limpiar posibles backticks / markdown
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    const parsed = JSON.parse(text);

    // Validar estructura mínima
    if (!parsed.analysis || !Array.isArray(parsed.tips)) {
      throw new Error('Formato de respuesta inválido');
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
