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
    Eres un experto en estrategia de contenido para LinkedIn, especializado en el sector de Centros de Datos e Infraestructura de IA.
    
    PERFIL DEL USUARIO (CV/BIO):
    ${profile}
    
    TEMA A TRATAR:
    ${topic}
    
    TONO:
    ${tone}
    
    Genera un post de LinkedIn estructurado en bloques:
    1. Un "Hook" (gancho) impactante.
    2. Un "Body" (cuerpo) con insights técnicos y estratégicos. Usa ENUMERACIONES o BULLET POINTS claros. 
    3. Un "CTA" (llamada a la acción) profesional.
    4. Una lista de hashtags relevantes.
    5. "imageKeywords": Una descripción artística detallada en INGLÉS (prompt) para un generador de imágenes por IA.

    REGLAS DE FORMATO CRÍTICAS:
    - Deja UN SALTO DE LÍNEA DOBLE entre cada párrafo y entre cada punto de la lista en el "Body".
    - El contenido debe ser visualmente aireado y fácil de leer en móvil.
    - Asegúrate de que el contenido refleje la experiencia del perfil del usuario.
    
    IMPORTANTE: RESPONDE EXCLUSIVAMENTE EN FORMATO JSON.
  `;

  try {
    console.log("Calling Gemini 1.5 Flash (default version) for topic:", topic);
    
    const result = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
      config: {
        // Structured output can sometimes be finicky depending on the SDK/API version combo.
        // We'll try without the strict schema first if hits errors, 
        // but let's try the standard way with the default API version (v1beta usually).
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
    
    // FALLBACK: If structured output fails with 400, try a plain text call and manual parse
    if (e.message?.includes("400") || e.message?.includes("Invalid JSON payload")) {
      console.log("Attempting fallback without structured output config...");
      try {
        const fallbackResult = await ai.models.generateContent({
          model: "gemini-1.5-flash",
          contents: prompt + "\n\nResponde únicamente con un objeto JSON válido que contenga los campos: hook, body, cta, hashtags (array), imageKeywords.",
        });
        const fallbackText = fallbackResult.text;
        if (fallbackText) {
          // Clean the text in case it has markdown blocks
          const cleaned = fallbackText.replace(/```json|```/g, "").trim();
          return JSON.parse(cleaned) as LinkedInPost;
        }
      } catch (fallbackErr) {
        console.error("Fallback also failed:", fallbackErr);
      }
    }
    
    throw new Error(`Error en el servicio de IA: ${e.message}`);
  }
}

export async function summarizeCV(cvText: string): Promise<string> {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: `Resume este CV en máximo 200 palabras, destacando experiencia técnica en Data Centers e IA:\n\n${cvText}`,
    });
    return result.text || "";
  } catch (e) {
    console.error("Error summarizing CV:", e);
    return cvText.substring(0, 500); // Return first 500 chars as fallback
  }
}

export async function generateImagePromptFromScript(script: string): Promise<string> {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: `Genera un prompt artístico en INGLÉS para este contenido de LinkedIn (sin explicaciones, solo el prompt):\n\n${script}`,
    });
    return result.text || "Data center technology";
  } catch (e) {
    return "Data center technology";
  }
}
