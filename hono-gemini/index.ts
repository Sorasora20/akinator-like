import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { GoogleGenAI, Type, FunctionCallingConfigMode } from '@google/genai'
import 'dotenv/config'

const app = new Hono()
app.use('/*', cors())

// ※ process.env.GEMINI_API_KEY が読み込まれている前提
const ai = new GoogleGenAI({})

app.post('/chat', async (c) => {
  try {
    const { history } = await c.req.json<{
      // functionCall なども履歴に積むため、型の柔軟性を少し上げています
      history: any[]
    }>()

    if (!history || history.length === 0) {
      return c.json({ error: 'history is required' }, 400)
    }

    let used_google_search = false;
    const search_logs: string[] = [];

    // === ツールの定義（5つ） ===
    const tools = [{
      functionDeclarations: [
        {
          name: 'ask_question',
          description: 'ユーザーに質問をして、対象のサッカー選手を絞り込みます。',
          parameters: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING, description: 'ユーザーへの質問文（余計な文章は含めない）' },
              confidence_score: { type: Type.INTEGER, description: '現時点でターゲットを絞り込めているかの自信度 (0-100)' }
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
              message: { type: Type.STRING, description: '降参する際のユーザーへの謝罪メッセージ' }
            },
            required: ['message']
          }
        },
        {
          // ★ 新しく追加した「内部検索用ツール」
          name: 'search_player_info',
          description: '選手の事実確認や最新情報をGoogleで検索します。ユーザーには見えない内部アクションです。質問を考えるための情報が足りない時に使用します。',
          parameters: {
            type: Type.OBJECT,
            properties: {
              query: { type: Type.STRING, description: 'Google検索に入力する具体的なキーワード。※重要: 「2024」「25/26」などの特定の年やシーズンは検索キーワードに含めないでください。Googleが自動的に最新の情報を取得します。（例: "レアルマドリード 背番号10 歴代"）' }
            },
            required: ['query']
          }
        }
      ]
    }];

    const systemInstruction = `
    現在の日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} です。
    
    あなたは架空または実在のサッカー選手を当てるエンターテイナーなアキネーターです。
    ユーザーは基本的に「はい」「いいえ」「分からない」「たぶんそう」「たぶん違う」の5択で答えますが、推測が外れた場合は「違うよ！」と返してきます。

    【最も重要なこと】
    速く推測まで到達したほうが良いです。ただし、自信の無い推測は絶対に避けてください。
    「search_player_info」を使用すると時間がかかるため、質問を追加することで条件を絞り込める余地がある場合は、「search_player_info」を使用しないでください。
    
    【推測と検索に関する重要なルール】
    - 「search_player_info」は、条件に合う選手のリストアップや事実確認に使用する補助ツールです。Google検索が一発で正解を教えてくれるとは限らないため、検索結果に正解ズバリがなくても、そこからヒントを得て自力で推測するか、次の「ask_question」に進んでください。
    - 検索結果が不満だからといって何度も別キーワードで再検索を繰り返そうとしないでください。
    - 過去のやり取りで「推測: 〇〇 ですね？」に対してユーザーが「違うよ！」と答えている場合、その選手は除外して別の選手を推測するか、さらに質問で絞り込んでください。

    【各ツールの使い方】
    状況に応じて、以下のいずれかのツール（関数）を必ず1つ呼び出してください。
    1. ask_question: 対象を絞り込むための質問をします。まだ選手が1人に絞りきれていない場合は、基本的にこのツールを使用してください。
    2. make_guess: 対象の選手が1人に特定できたと確信した場合に使用し、選手名を回答します。当てずっぽうの推測は避けてください。
    3. search_player_info: 質問だけでは絞り込みが難しく、事実確認や候補のリストアップがどうしても必要な場合のみ使用します。（※極力ask_questionを優先してください）
    4. reject_non_player: ユーザーの回答から、明らかにサッカー選手ではない（別競技の選手やアニメキャラなど）と判断した場合に、ツッコミを入れてゲームを中断するために使用します。
    5. give_up: 質問や検索を何度繰り返しても全く見当がつかない、または候補がいなくなった場合に、降参するために使用します。
    `;

    // 状態を保持するローカルの履歴配列
    const currentHistory = [...history];

    // 無限ループ防止（最大3回までエージェントの連続行動を許容）
    let loopCount = 0;
    const MAX_LOOPS = 3;

    // === エージェントの思考ループ ===
    while (loopCount < MAX_LOOPS) {
      loopCount++;

      // 最後のループ（MAX_LOOPS）では、これ以上の検索を禁止し、強制的にユーザー向けアクションを選ばせる
      const currentTools = [{
        functionDeclarations: tools[0].functionDeclarations.filter(f => {
          return !(loopCount === MAX_LOOPS && f.name === 'search_player_info');
        })
      }];

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: currentHistory,
        config: {
          systemInstruction,
          tools: currentTools,
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY, // 必ずどれかのツールを使わせる
            }
          }
        }
      });

      const call = response.functionCalls?.[0];

      if (!call) {
        return c.json({ error: 'AIが適切なアクションを選択できませんでした。' }, 500);
      }

      const name = call.name;
      const args = call.args as Record<string, any>;
      console.log(`[Agent Loop ${loopCount}] AIが選んだアクション: ${name}`);

      // 1. 内部ツール：検索が選ばれた場合
      if (name === 'search_player_info') {
        console.log(`🔍 [Agent] 内部検索を実行中: ${args.query}`);
        used_google_search = true;

        let searchResultText = "（検索結果なし）";
        try {
          // 既存の実装を活かし、ここでGeminiの標準機能であるGoogle検索を実行
          const searchResponse = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: `現在の日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} です。以下のキーワードについてGoogle検索を行い、サッカー選手を特定するための特徴を要約して出力してください。\nキーワード: ${args.query}`,
            config: {
              tools: [{ googleSearch: {} }] // 実際のGoogle検索を叩く
            }
          });
          searchResultText = searchResponse.text || "（検索結果なし）";
        } catch (e) {
          console.log('Search step failed', e);
          searchResultText = "（検索エラーが発生しました）";
        }

        search_logs.push(`検索キーワード: ${args.query}\n結果: ${searchResultText}`);

        // 履歴に「AIが検索ツールを呼んだこと」と「その検索結果」を追記
        currentHistory.push({ role: 'model', parts: response.candidates?.[0]?.content?.parts || [{ functionCall: call }] });
        currentHistory.push({
          role: 'user', // functionResponseはuserロールとして渡す仕様
          parts: [{ functionResponse: { name: call.name, response: { result: searchResultText } } }]
        });

        // continue で while ループの先頭に戻り、検索結果を踏まえてもう一度AIに考えさせる
        continue;
      }

      // 2. ユーザー向けのアクションが選ばれた場合（ループを抜けてフロントエンドに返す）
      if (name === 'ask_question') {
        return c.json({ action: 'ask_question', question: args.question, confidence: args.confidence_score || 0, used_google_search, search_logs });
      } else if (name === 'make_guess') {
        return c.json({ action: 'make_guess', guess: args.player_name, used_google_search, search_logs });
      } else if (name === 'reject_non_player') {
        return c.json({ action: 'rejected', reason: args.reason, used_google_search, search_logs });
      } else if (name === 'give_up') {
        return c.json({ action: 'given_up', reason: args.message, used_google_search, search_logs });
      }
    }

    // 検索ループが MAX_LOOPS を超えた場合のフェールセーフ
    return c.json({ error: 'エージェントの内部処理がタイムアウトしました。' }, 500);

  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

// === 以下のフロントエンド配信・サーバー起動処理は変更なし ===
app.use('/*', serveStatic({ root: '../frontend/dist' }))
app.get('*', serveStatic({ path: '../frontend/dist/index.html' }))

serve({
  fetch: app.fetch,
  port: 8080,
}, (info) => {
  console.log(`Agent Akinator Server is running on http://localhost:${info.port}`)
})