import { GoogleGenAI } from "@google/genai";

// Use local enum-like object if SchemaType is not exported
const SchemaType = {
  OBJECT: "OBJECT" as any,
  ARRAY: "ARRAY" as any,
  STRING: "STRING" as any,
  NUMBER: "NUMBER" as any,
};

const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY!);

export interface Detection {
  label: string;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
}

export interface DetectionResult {
  detections: Detection[];
  description: string;
}

export async function detectObjects(base64Image: string, mimeType: string): Promise<DetectionResult> {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          detections: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                label: { type: SchemaType.STRING },
                box_2d: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.NUMBER },
                }
              },
              required: ["label", "box_2d"]
            }
          },
          description: { type: SchemaType.STRING }
        },
        required: ["detections", "description"]
      }
    }
  });

  const prompt = "Act as an expert computer vision system. Detect all objects in the image. For each object, return its label and bounding box coordinates in [ymin, xmin, ymax, xmax] format. Coordinates must be normalized (0-1000). Provide a clear scene description.";

  try {
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType, data: base64Image } }
    ]);

    const response = await result.response;
    const text = response.text();
    return JSON.parse(text) as DetectionResult;
  } catch (error) {
    console.error("AI Analysis Failed:", error);
    throw error;
  }
}
