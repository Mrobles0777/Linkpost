import { GoogleGenAI, Type } from "@google/genai";

// Better safe than sorry: handle different ways process.env might be available
const apiKey = process.env.GEMINI_API_KEY || "";

if (!apiKey) {
  console.warn("WARNING: GEMINI_API_KEY is not defined. AI generation will fail.");
}

const ai = new GoogleGenAI({ apiKey });

export interface LinkedInPost {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  imageKeywords: string; // Keywords for Unsplash search
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
       REGLAS PARA LA IMAGEN:
       - Debe ser una escena profesional, técnica y minimalista relacionada con el tema del post.
       - Incluye términos como: "high-tech", "cinematic lighting", "4k", "professional photography", "minimalist", "clean composition".
       - Evita texto dentro de la imagen.
       - Ejemplo: "Futuristic data center corridor with glowing server racks, isometric view, soft blue and white lighting, hyper-realistic, 8k".

    REGLAS DE FORMATO CRÍTICAS:
    - Deja UN SALTO DE LÍNEA DOBLE entre cada párrafo y entre cada punto de la lista en el "Body".
    - El contenido debe ser visualmente aireado y fácil de leer en móvil.
    - Asegúrate de que el contenido refleje la experiencia del perfil del usuario.
  `;

  try {
    console.log("Calling Gemini 1.5 Pro for topic:", topic);
    
    if (!apiKey) {
      throw new Error("API Key de Gemini no encontrada. Por favor verifica tu archivo .env");
    }

    const response = await ai.models.generateContent({
      model: "gemini-1.5-pro",
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

    const text = response.text;
    if (!text) {
      throw new Error("No se recibió contenido de Gemini (respuesta vacía)");
    }

    const parsed = JSON.parse(text);
    console.log("Gemini 1.5 Pro Parsed Response:", parsed);
    return parsed as LinkedInPost;
  } catch (e: any) {
    console.error("Detailed Gemini Service Error:", e);
    // Be very explicit with the error message for the user
    let errorMsg = e.message || "Error desconocido";
    if (errorMsg.includes("API key not valid")) {
      errorMsg = "La API Key de Gemini no es válida o ha expirado.";
    } else if (errorMsg.includes("quota")) {
      errorMsg = "Se ha excedido la cuota gratuita de tu API Key.";
    }
    throw new Error(`Error en el servicio de IA: ${errorMsg}`);
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

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-pro",
      contents: prompt,
    });

    return response.text || "";
  } catch (e: any) {
    console.error("Error summarizing CV:", e);
    return "";
  }
}

export async function generateImagePromptFromScript(script: string): Promise<string> {
  const prompt = `
    Eres un experto en generación de prompts para IA de imagen (DALL-E, Midjourney, Pollinations).
    Analiza el siguiente título o extracto de un post de LinkedIn y genera un prompt artístico, técnico y minimalista en INGLÉS.
    
    CONTENIDO DEL POST:
    ${script}
    
    REGLAS:
    - El prompt debe ser en INGLÉS.
    - Debe describir una escena profesional de tecnología, centros de datos o infraestructura de IA.
    - Estilo: Fotografía profesional, iluminación cinematográfica, 8k, ultra detallado, composición limpia.
    - NO incluyas texto dentro de la imagen.
    - Genera SOLO el texto del prompt, sin explicaciones.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-pro",
      contents: prompt,
    });

    return response.text || "Data center technology, professional photography, cinematic lighting";
  } catch (e) {
    console.error("Error generating image prompt:", e);
    return "Data center technology, professional photography, cinematic lighting";
  }
}
