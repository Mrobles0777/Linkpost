import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

export interface LinkedInPost {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  imageKeywords: string;
}

export async function generateLinkedInContent(
  profile: string,
  topic: string,
  tone: string
): Promise<LinkedInPost> {
  const prompt = `
    Eres una persona real con años de experiencia en Centros de Datos e Infraestructura de IA, y sabes cómo conectar con tu audiencia en LinkedIn de forma auténtica.

    PERFIL DEL USUARIO (CV/BIO):
    ${profile}

    TEMA A TRATAR:
    ${topic}

    TONO:
    ${tone}

    Tu tarea es escribir un post de LinkedIn que suene completamente humano, como si lo escribiera una persona de verdad desde su experiencia personal, NO una empresa ni una IA.

    INSTRUCCIONES DE ESCRITURA:
    - Escribe en PRIMERA PERSONA, desde la experiencia propia del usuario.
    - El "hook" debe ser una frase corta e intrigante: una pregunta, una confesión, una observación inesperada o una cifra impactante. NUNCA empieces con "En el mundo de..." o frases genéricas.
    - El "body" debe fluir de forma narrativa y conversacional. Mezcla párrafos cortos con párrafos más elaborados. Puedes usar alguna lista puntual si surge naturalmente, pero no abuses. Que se sienta como alguien contando algo, no redactando un artículo.
    - El "cta" debe ser una invitación genuina a la conversación, no una frase corporativa. Por ejemplo: "¿A vosotros también os ha pasado esto?" o "Cuéntame tu experiencia en los comentarios."
    - Los "hashtags" deben ser relevantes y no exceder de 5.
    - "imageKeywords": Una descripción artística detallada en INGLÉS (prompt) para un generador de imágenes por IA que complemente el post.

    EVITA A TODA COSTA:
    - Frases cliché como "En el dinámico mundo de...", "Como profesional de...", "Es un honor compartir..."
    - Listas de bullets que hacen el texto parecer un PowerPoint.
    - Un tono demasiado formal o corporativo.
    - Que parezca escrito por una IA.

    IMPORTANTE: RESPONDE EXCLUSIVAMENTE EN FORMATO JSON.
  `;

  try {
    console.log("Calling Gemini (flash-latest) for topic:", topic);
    
    // Using gemini-flash-latest which is confirmed working with current quota
    const result = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hook: { type: Type.STRING },
            body: { type: Type.STRING },
            cta: { type: Type.STRING },
            hashtags: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            imageKeywords: { type: Type.STRING }
          },
          required: ["hook", "body", "cta", "hashtags", "imageKeywords"]
        }
      }
    });

    const text = result.text;
    if (!text) throw new Error("Respuesta vacía de la IA.");

    return JSON.parse(text) as LinkedInPost;
  } catch (e: any) {
    console.error("Gemini Error:", e);
    
    // Fallback if structured output fails
    try {
      console.log("Attempting fallback without structured output config...");
      const fallbackResult = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: prompt + "\n\nResponde únicamente con un objeto JSON válido que contenga los campos: hook, body, cta, hashtags (array), imageKeywords.",
      });
      const fallbackText = fallbackResult.text;
      if (fallbackText) {
        const cleaned = fallbackText.replace(/```json|```/g, "").trim();
        return JSON.parse(cleaned) as LinkedInPost;
      }
    } catch (fallbackErr) {
      console.error("Fallback also failed:", fallbackErr);
    }
    
    let errorMsg = e.message || "Error desconocido";
    if (errorMsg.includes("429")) {
      errorMsg = "Se ha agotado la cuota de la API Key. Por favor intenta en unos minutos o usa una clave con mayor límite.";
    }
    throw new Error(`Error en el servicio de IA: ${errorMsg}`);
  }
}

export async function summarizeCV(cvText: string): Promise<string> {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: `Resume este CV en máximo 200 palabras, destacando experiencia técnica en Data Centers e IA:\n\n${cvText}`,
    });
    return result.text || "";
  } catch (e) {
    console.error("Error summarizing CV:", e);
    return cvText.substring(0, 500);
  }
}

export async function generateImagePromptFromScript(script: string): Promise<string> {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: `Genera un prompt artístico en INGLÉS para este contenido de LinkedIn (sin explicaciones, solo el prompt):\n\n${script}`,
    });
    return result.text || "Data center technology";
  } catch (e) {
    return "Data center technology";
  }
}
