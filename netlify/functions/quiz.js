export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { difficulty, previousTopics } = await req.json();

    const apiKey = Netlify.env.get('GROQ_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key no configurada' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const diffLabels = {
      1: 'muy fácil, para principiantes que nunca han reciclado',
      2: 'fácil, conocimientos básicos de separación de basura',
      3: 'intermedio, sobre tipos de plásticos y procesos de reciclaje',
      4: 'difícil, sobre impacto ambiental, normativas y datos técnicos',
      5: 'muy difícil, sobre economía circular, políticas públicas y ciencia de materiales'
    };

    const level = Math.min(Math.max(difficulty || 1, 1), 5);

    const system = `Eres un generador de preguntas de quiz sobre reciclaje y medio ambiente enfocado en México y San Luis Potosí. 

REGLAS ESTRICTAS:
- Genera UNA sola pregunta de opción múltiple
- Nivel de dificultad: ${diffLabels[level]}
- La pregunta debe ser diferente a estos temas ya usados: ${previousTopics || 'ninguno'}
- Responde SOLO con JSON válido, sin markdown, sin backticks, sin texto extra
- El JSON debe tener exactamente esta estructura:

{"question":"texto de la pregunta","options":["opción A","opción B","opción C","opción D"],"correct":0,"explanation":"breve explicación de por qué es correcta","funFact":"dato curioso relacionado"}

- "correct" es el índice (0-3) de la opción correcta
- La explicación debe ser de máximo 2 oraciones
- El dato curioso debe ser interesante y de máximo 1 oración
- Varía los temas: separación, plásticos, metales, orgánicos, electrónicos, agua, energía, legislación, datos de México/SLP`;

    const payload = {
      model: 'llama-3.1-8b-instant',
      max_tokens: 400,
      temperature: 0.9,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Genera una pregunta de nivel ${level}. Responde SOLO con JSON.` }
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
      return new Response(JSON.stringify({ error: 'API error', detail: errText }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await r.json();
    let text = data.choices?.[0]?.message?.content || '';
    
    // Limpiar posibles backticks
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    const parsed = JSON.parse(text);

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
