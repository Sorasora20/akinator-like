import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
  console.log("Running...");
  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: '今日の東京の天気と、最新の日本の首相を教えてください',
    config: {
      tools: [
        { googleSearch: { dynamicRetrievalConfig: { mode: 'MODE_DYNAMIC', dynamicThreshold: 0.1 } } }
      ],
      systemInstruction: 'あなたはAIです。'
    }
  });

  console.log("Candidate 0 keys:", Object.keys(response.candidates[0] || {}));
  console.log("Grounding metadata:", JSON.stringify(response.candidates[0]?.groundingMetadata, null, 2));
}

run().catch(console.error);
