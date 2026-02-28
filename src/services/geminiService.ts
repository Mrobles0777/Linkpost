import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface LinkedInPost {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
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
    2. Un "Body" (cuerpo) con insights técnicos y estratégicos sobre el impacto de la IA en los centros de datos.
    3. Un "CTA" (llamada a la acción) profesional.
    4. Una lista de hashtags relevantes.
    
    Asegúrate de que el contenido refleje la experiencia del perfil del usuario y aporte valor real a la comunidad técnica de LinkedIn.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-flash-lite-latest",
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
          }
        },
        required: ["hook", "body", "cta", "hashtags"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}") as LinkedInPost;
  } catch (e) {
    console.error("Error parsing Gemini response", e);
    throw new Error("No se pudo generar el contenido estructurado.");
  }
}

export async function summarizeCV(cvText: string): Promise<string> {
  const prompt = `
    Eres un experto en reclutamiento técnico y marca personal. 
    Analiza el siguiente texto de un CV o perfil profesional y genera un resumen ejecutivo profesional de máximo 200 palabras.
    
    El resumen debe destacar:
    1. Experiencia principal y roles clave.
    2. Habilidades técnicas (especialmente en infraestructura, centros de datos o IA si están presentes).
    3. Logros significativos.
    
    TEXTO DEL CV:
    ${cvText}
    
    Genera solo el texto del resumen, en un tono profesional y directo, listo para ser usado como bio o perfil profesional.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-flash-lite-latest",
    contents: prompt,
  });

  return response.text || "";
}
