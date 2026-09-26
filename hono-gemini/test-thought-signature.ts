import { GoogleGenAI, Type, FunctionCallingConfigMode } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
  const currentHistory: any[] = [
    { role: 'user', parts: [{ text: 'リオネル・メッシについて検索して、情報をまとめて。' }] }
  ];

  const tools = [{
    functionDeclarations: [
      {
        name: 'search_player_info',
        description: '検索する',
        parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } }, required: ['query'] }
      }
    ]
  }];

  const response1 = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: currentHistory,
    config: { tools, toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } } }
  });

  const call = response1.functionCalls?.[0];
  console.log("Called:", call?.name);

  // BAD WAY: (This reproduces the error)
  // currentHistory.push({ role: 'model', parts: [{ functionCall: call }] });
  
  // GOOD WAY:
  currentHistory.push({ role: 'model', parts: response1.candidates?.[0]?.content?.parts });

  currentHistory.push({
    role: 'user', // genai SDK usually uses user or function_response, let's check
    parts: [{ functionResponse: { name: call!.name, response: { result: "メッシはアルゼンチン代表です" } } }]
  });

  const response2 = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: currentHistory,
    config: { tools, toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } } }
  });

  console.log("Response 2:", response2.text);
}

run().catch(console.error);
