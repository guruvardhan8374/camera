import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface Detection {
  label: string;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
}

export interface DetectionResult {
  detections: Detection[];
  description: string;
}

export async function detectObjects(base64Image: string, mimeType: string): Promise<DetectionResult> {
  // Use gemini-3-flash-preview as recommended in skill
  const modelToUse = "gemini-3-flash-preview";

  const prompt = "Act as an expert computer vision system. Detect all objects in the image. For each object, return its label and bounding box coordinates in [ymin, xmin, ymax, xmax] format. Coordinates must be normalized (0-1000). Provide a clear scene description.";

  try {
    const response = await ai.models.generateContent({
      model: modelToUse,
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64Image } }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  box_2d: {
                    type: Type.ARRAY,
                    items: { type: Type.NUMBER }
                  }
                },
                required: ["label", "box_2d"]
              }
            },
            description: { type: Type.STRING }
          },
          required: ["detections", "description"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as DetectionResult;
  } catch (error) {
    console.error("AI Analysis Failed:", error);
    throw error;
  }
}
