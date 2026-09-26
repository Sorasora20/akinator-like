import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { GoogleGenAI } from '@google/genai'
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

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: history,
      config: {
        systemInstruction: `
        あなたは架空または実在のサッカー選手を当てるアキネーターです。
        ユーザーは「はい」「いいえ」「分からない」「たぶんそう」「たぶん違う」の5択で答えます。
        ユーザは質問に間違った回答をする可能性があります。そのため、ある程度の柔軟性を持って回答してください。
        提供されたツールを使用して、以下のいずれかのアクションを必ず実行してください。
        1. 選手を絞り込むための質問を一つする (ask_question)
        2. 選手が特定できたので推測する (make_guess)
        3. ユーザーがサッカー選手以外を考えていると判断し、ゲームを中断する (reject_non_player)`,

        // ★ 3つのToolを定義
        tools: [{
          functionDeclarations: [
            {
              name: 'ask_question',
              description: 'ユーザーに「はい/いいえ」等で答えられる質問をして、対象のサッカー選手を絞り込みます。',
              parameters: {
                type: 'OBJECT',
                properties: {
                  question: { type: 'STRING', description: 'ユーザーへの質問文（余計な文章は含めない）' }
                },
                required: ['question']
              }
            },
            {
              name: 'make_guess',
              description: '対象のサッカー選手が特定できた場合に、その名前を推測します。',
              parameters: {
                type: 'OBJECT',
                properties: {
                  player_name: { type: 'STRING', description: '推測したサッカー選手の名前（余計な文章は含めない）' }
                },
                required: ['player_name']
              }
            },
            {
              name: 'reject_non_player',
              description: 'ユーザーがサッカー選手以外の人物や物体を思い浮かべていると判断した場合に呼び出します。',
              parameters: {
                type: 'OBJECT',
                properties: {
                  reason: { type: 'STRING', description: 'なぜサッカー選手ではないと判断したかの理由や、ユーザーへのツッコミ' }
                },
                required: ['reason']
              }
            }
          ]
        }],

        // ★ AIに「必ず関数を呼び出す」ことを強制する設定
        toolConfig: {
          functionCallingConfig: {
            mode: 'ANY',
            allowedFunctionNames: ['ask_question', 'make_guess', 'reject_non_player']
          }
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
        return c.json({ action: 'ask_question', question: args.question })

      } else if (name === 'make_guess') {
        return c.json({ action: 'make_guess', guess: args.player_name })

      } else if (name === 'reject_non_player') {
        return c.json({ action: 'rejected', reason: args.reason })
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
  port: 3000,
}, (info) => {
  console.log(`Agent Akinator Server is running on http://localhost:${info.port}`)
})