import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { GoogleGenAI, Type, FunctionCallingConfigMode, DynamicRetrievalConfigMode } from '@google/genai'
import 'dotenv/config'

const app = new Hono()
app.use('/*', cors())

const ai = new GoogleGenAI({})

app.post('/chat', async (c) => {
  try {
    const { history } = await c.req.json<{
      history: { role: 'user' | 'model', parts: [{ text: string }] }[]
    }>()

    if (!history || history.length === 0) {
      return c.json({ error: 'history is required' }, 400)
    }

    const promptText = history[history.length - 1].parts[0].text;
    const questionCount = (promptText.match(/Q:/g) || []).length;
    
    // === ステップ1: Google検索による情報収集 (コスト節約のため条件付き発動) ===
    let searchResultText = "（今回は検索を行っていません）";
    let used_google_search = false;
    
    // 3問目以降、かつ2回に1回の頻度で検索を発動する
    if (questionCount >= 3 && questionCount % 2 === 1) {
      try {
        const searchResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: promptText + '\n\n（※この情報を元に、関連する最新のサッカー選手をGoogleで検索し、その特徴を抽出してください）',
          config: {
            tools: [{ googleSearch: {} }]
          }
        });
        searchResultText = searchResponse.text || "（検索結果なし）";
        const groundingMetadata = searchResponse.candidates?.[0]?.groundingMetadata;
        used_google_search = !!(groundingMetadata?.webSearchQueries && groundingMetadata.webSearchQueries.length > 0);
        
        if (used_google_search) {
          console.log('🔍 [Backend] Google Search Triggered! Queries:', groundingMetadata?.webSearchQueries);
        }
      } catch (e) {
        console.log('Search step failed', e);
      }
    }

    // === ステップ2: アキネーターとしての回答生成 ===
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: history,
      config: {
        systemInstruction: `
        あなたは架空または実在のサッカー選手を当てるエンターテイナーなアキネーターです。
        ユーザーを楽しませるため、単なる事実（国籍やポジション）だけでなく、以下のような多様で面白い視点の質問を積極的に取り入れてください。
        - 特徴的なプレースタイルや有名な必殺技・ゴールパフォーマンス
        - 印象的な髪型やタトゥー、ファッションなどの外見的特徴
        - メディアでの発言、有名なエピソード、プライベートでの噂や事件
        - 過去に着けていた背番号や、特定のライバル選手との関係
        
        ユーザーは「はい」「いいえ」「分からない」「たぶんそう」「たぶん違う」の5択で答えます。
        ユーザは質問に間違った回答をする可能性もあるため、柔軟に推測してください。
        
        【最新のGoogle検索結果】
        ${searchResultText}
        ※上記の検索結果も参考にしながら、ターゲットを絞り込むための最適な質問を考えてください。
        
        提供されたツールを使用して、以下のいずれかのアクションを必ず実行してください。
        1. 選手を絞り込むための質問を一つする (ask_question)
        2. 選手が特定できたので推測する (make_guess)
        3. ユーザーがサッカー選手以外を考えていると判断し、ツッコミを入れてゲームを中断する (reject_non_player)
        4. 質問を繰り返しても一向に見当がつかない場合、降参してゲームを終了する (give_up)`,

        // ★ Toolの定義 (4つの関数のみ)
        tools: [{
          functionDeclarations: [
            {
              name: 'ask_question',
              description: 'ユーザーに質問をして、対象のサッカー選手を絞り込みます。',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING, description: 'ユーザーへの質問文（余計な文章は含めない）' },
                  confidence_score: {
                    type: Type.INTEGER,
                    description: '現時点でターゲットを絞り込めているかの自信度 (0から100の整数)。序盤は低く、情報が揃うにつれて高くしてください。'
                  }
                },
                required: ['question', 'confidence_score']
              }
            },
            {
              name: 'make_guess',
              description: '対象のサッカー選手が特定できた場合に、その名前を推測します。',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  player_name: { type: Type.STRING, description: '推測したサッカー選手の名前（余計な文章は含めない）' }
                },
                required: ['player_name']
              }
            },
            {
              name: 'reject_non_player',
              description: 'ユーザーがサッカー選手以外の人物や物体を思い浮かべていると判断した場合に呼び出します。',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  reason: { type: Type.STRING, description: 'なぜサッカー選手ではないと判断したかの理由や、ユーザーへのツッコミ' }
                },
                required: ['reason']
              }
            },
            {
              name: 'give_up',
              description: '質問を繰り返しても対象が全く特定できない場合、降参してゲームを終了します。',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  message: { type: Type.STRING, description: '降参する際のユーザーへの謝罪メッセージ（例: 「うーん、全くわかりません！私の負けです！」）' }
                },
                required: ['message']
              }
            }
          ]
        }],

        // ★ AIに関数呼び出しを許可する設定
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ['ask_question', 'make_guess', 'reject_non_player', 'give_up']
          },
          includeServerSideToolInvocations: true
        }
      }
    })

    // === 関数呼び出し（Function Calling）の結果を処理 ===
    const functionCalls = response.functionCalls

    // AIが関数を呼び出したかチェック
    if (functionCalls && functionCalls.length > 0) {
      // 最初に呼び出された関数を取得
      const call = functionCalls[0]
      const name = call.name
      const args = call.args as Record<string, any>

      // 呼び出されたTool名によって、フロントエンドに返すJSONの形を変える
      if (name === 'ask_question') {
        return c.json({ action: 'ask_question', question: args.question, confidence: args.confidence_score || 0, used_google_search })

      } else if (name === 'make_guess') {
        return c.json({ action: 'make_guess', guess: args.player_name, used_google_search })

      } else if (name === 'reject_non_player') {
        return c.json({ action: 'rejected', reason: args.reason, used_google_search })

      } else if (name === 'give_up') {
        return c.json({ action: 'given_up', reason: args.message, used_google_search })
      }
    }

    // 万が一関数が呼び出されなかった場合のエラーハンドリング
    return c.json({ error: 'AIが適切なアクションを選択できませんでした。' }, 500)

  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

// === フロントエンドの静的ファイルを配信 ===
app.use('/*', serveStatic({ root: '../frontend/dist' }))
app.get('*', serveStatic({ path: '../frontend/dist/index.html' }))

serve({
  fetch: app.fetch,
  port: 8080,
}, (info) => {
  console.log(`Agent Akinator Server is running on http://localhost:${info.port}`)
})