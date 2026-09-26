import { GoogleGenAI, Type, FunctionCallingConfigMode } from '@google/genai';
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
（※これまでの条件を満たす選手をGoogle検索で調べ、次の質問のヒントにしてください）`,
    config: {
      systemInstruction: 'あなたはアキネーターのようなAIです。必ず関数を呼び出してください。',
      tools: [
        { googleSearch: {} },
        {
          functionDeclarations: [{
            name: 'ask_question',
            description: 'ユーザーに「はい/いいえ/わからない/たぶんそう/たぶん違う」で答えられる質問をします。',
            parameters: {
              type: Type.OBJECT,
              properties: { question: { type: Type.STRING } },
              required: ['question']
            }
          }]
        }
      ],
      toolConfig: {
        functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
        includeServerSideToolInvocations: true
      }
    }
  });

  console.log("Called function:", response.functionCalls?.[0]?.name);
  console.log("Grounding metadata:", JSON.stringify(response.candidates?.[0]?.groundingMetadata, null, 2));
}

run().catch(console.error);
