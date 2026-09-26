import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: `【これまでの質疑応答リスト】
1. Q: 日本人ですか？ (A: はい)
2. Q: プレミアリーグでプレーしていますか？ (A: はい)

【直前のやり取り】
ユーザーの回答: はい

【指示】
必ず最新の情報をGoogle検索で調べてから、次の質問を作成してください。`,
    config: {
      systemInstruction: 'あなたはアキネーターのようなAIです。必ず以下のJSONフォーマットのみで応答してください: {"action": "ask_question", "question": "次の質問文"}',
      responseMimeType: 'application/json',
      tools: [
        { googleSearch: {} }
      ]
    }
  });

  console.log("Raw Response:", response.text());
  console.log("Grounding metadata:", JSON.stringify(response.candidates?.[0]?.groundingMetadata, null, 2));
}

run().catch(console.error);
