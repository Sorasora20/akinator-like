import { GoogleGenAI, Type, FunctionCallingConfigMode } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
  const currentHistory: any[] = [
    { role: 'user', parts: [{ text: 'リオネル・メッシについて検索して情報をまとめて' }] }
  ];

  const tools = [{
    functionDeclarations: [
      {
        name: 'search_player_info',
        description: '検索する',
        parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } }, required: ['query'] }
      },
      {
        name: 'done',
        description: '検索完了',
        parameters: { type: Type.OBJECT, properties: { }, required: [] }
      }
    ]
  }];

  const response1 = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: currentHistory,
    config: { tools, toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } } }
  });

  const call1 = response1.functionCalls?.[0];
  console.log("Call 1:", call1?.name);

  currentHistory.push({ role: 'model', parts: response1.candidates?.[0]?.content?.parts });

  currentHistory.push({
    role: 'user',
    parts: [{ functionResponse: { name: call1!.name, response: { result: "メッシはアルゼンチンの選手です" } } }]
  });

  const response2 = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: currentHistory,
    config: { tools, toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } } }
  });

  const call2 = response2.functionCalls?.[0];
  console.log("Call 2:", call2?.name);
}

run().catch(console.error);
