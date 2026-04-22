import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface Detection {
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
  label: string;
}

export interface DetectionResult {
  detections: Detection[];
  description: string;
}

export async function detectObjects(base64Image: string, mimeType: string): Promise<DetectionResult> {
  const model = "gemini-3-flash-preview";

  const prompt = `Perform object detection on this image. 
    1. Identify all distinct objects.
    2. For each object, provide a label and a bounding box in the format [ymin, xmin, ymax, xmax].
    3. Use normalized coordinates (0 to 1000).
    4. Provide a 1-sentence summary of the scene.
    Return ONLY valid JSON. 
    Example format: {"detections": [{"box_2d": [100, 200, 300, 400], "label": "camera"}], "description": "A person holding a camera."}`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { data: base64Image, mimeType } }
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
                  box_2d: {
                    type: Type.ARRAY,
                    items: { type: Type.NUMBER },
                    description: "[ymin, xmin, ymax, xmax] normalized coordinates (0-1000)"
                  },
                  label: { type: Type.STRING }
                },
                required: ["box_2d", "label"]
              }
            },
            description: { type: Type.STRING, description: "A brief description of the scene." }
          },
          required: ["detections", "description"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as DetectionResult;
  } catch (error) {
    console.error("Detection error:", error);
    throw error;
  }
}
