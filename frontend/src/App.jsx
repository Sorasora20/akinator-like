import { useState } from 'react';
import { CheckCircle2, XCircle, HelpCircle, ThumbsUp, ThumbsDown, RotateCcw } from 'lucide-react';

function App() {
  const [displayHistory, setDisplayHistory] = useState([]); // 表示用の質問＆回答ペア
  const [confidence, setConfidence] = useState(0); // AIの自信度 (0-100)
  const [loading, setLoading] = useState(false);
  const [gameState, setGameState] = useState('start'); // 'start', 'playing', 'guessed', 'rejected', 'error'
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentGuess, setCurrentGuess] = useState('');
  
  // 指定された5つの選択肢とその色クラスとアイコン
  const options = [
    { text: "はい", class: "btn-yes", icon: <CheckCircle2 size={18} /> },
    { text: "いいえ", class: "btn-no", icon: <XCircle size={18} /> },
    { text: "分からない", class: "btn-dunno", icon: <HelpCircle size={18} /> },
    { text: "たぶんそう", class: "btn-prob-yes", icon: <ThumbsUp size={18} /> },
    { text: "たぶん違う", class: "btn-prob-no", icon: <ThumbsDown size={18} /> },
  ];

  const handleTurn = async (userText, isNewGame = false) => {
    setLoading(true);

    let currentDisplayHistory = isNewGame ? [] : [...displayHistory];

    // 回答を表示用履歴に追加
    if (!isNewGame) {
      if (gameState === 'playing') {
        currentDisplayHistory.push({ q: currentQuestion, a: userText });
      } else if (gameState === 'guessed') {
        currentDisplayHistory.push({ q: `推測: ${currentGuess} ですね？`, a: userText });
      }
      setDisplayHistory(currentDisplayHistory);
    }

    // ★ コンテキスト希釈を防ぐための「1ターン圧縮プロンプト」を作成
    let prompt = '';
    if (currentDisplayHistory.length === 0 && gameState === 'start') {
      prompt = "ゲームスタート！サッカー選手を1人思い浮かべてください。最初の質問をお願いします。";
    } else {
      const pastQuestions = currentDisplayHistory.map((item, i) => `${i + 1}. Q: ${item.q} (A: ${item.a})`).join('\n');
      
      prompt = `
【これまでの質疑応答リスト（※重複した質問は絶対に避けること）】
${pastQuestions}

【直前のやり取り】
AIの質問: ${currentQuestion}
ユーザーの回答: ${userText}

上記を踏まえて、対象を絞り込むための「次の鋭い質問」をするか、「推測」を行ってください。`;
    }

    const payloadHistory = [
      { role: 'user', parts: [{ text: prompt }] }
    ];

    try {
      const res = await fetch('/akinator/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: payloadHistory }),
      });

      const data = await res.json();

      if (res.ok) {
        if (data.action === 'ask_question') {
          setCurrentQuestion(data.question);
          if (data.confidence !== undefined) setConfidence(data.confidence);
          setGameState('playing');
        } else if (data.action === 'make_guess') {
          setCurrentGuess(data.guess);
          setConfidence(100);
          setGameState('guessed');
        } else if (data.action === 'rejected') {
          setCurrentQuestion(data.reason);
          setConfidence(0);
          setGameState('rejected');
        } else if (data.action === 'given_up') {
          setCurrentQuestion(data.reason);
          setConfidence(0);
          setGameState('given_up');
        }
      } else {
        setCurrentQuestion(`エラー: ${data.error}`);
        setGameState('error');
      }
    } catch (err) {
      setCurrentQuestion("通信エラー: バックエンド(Hono)が起動しているか確認してください。");
      setGameState('error');
    } finally {
      setLoading(false);
    }
  };

  const startGame = () => {
    setDisplayHistory([]);
    setConfidence(0);
    handleTurn("ゲームスタート！サッカー選手を1人思い浮かべてください。", true);
  };

  const getAvatar = () => {
    if (gameState === 'start') return '🔮';
    if (gameState === 'given_up') return '🏳️';
    if (gameState === 'error' || gameState === 'rejected') return '😵';
    if (gameState === 'guessed') return '💡';
    if (loading) return '🤔';
    return '🤖';
  };

  return (
    <div style={{
      width: '100%',
      maxWidth: '600px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: gameState === 'start' ? 'center' : 'flex-start'
    }}>
      <div className="app-container">
      <div className="avatar-container">{getAvatar()}</div>
      
      {gameState === 'start' ?
        <h1 className="title">サッカー選手アキネーター</h1> :
        <></>
      }

      {gameState !== 'start' && (
        <div className="confidence-container">
          <div className="confidence-header">
            <span>AIの特定自信度</span>
            <span>{confidence}%</span>
          </div>
          <div className="confidence-bar-bg">
            <div 
              className="confidence-bar-fill" 
              style={{ width: `${confidence}%` }}
            ></div>
          </div>
        </div>
      )}

      {gameState === 'start' && (
        <button className="btn btn-primary" onClick={startGame} disabled={loading}>
          {loading ? '接続中...' : 'ゲームを始める'}
        </button>
      )}

      {gameState !== 'start' && (
        <div key={currentQuestion || currentGuess} className="question-bubble">
          {loading ? (
            <div className="typing-indicator">
              <span></span><span></span><span></span>
            </div>
          ) : gameState === 'guessed' ? (
            <div className="guess-display">
              <span className="guess-prefix">思い浮かべているのは...</span>
              <span className="guess-name">{currentGuess}</span>
              <span className="guess-suffix">ですね？</span>
            </div>
          ) : (
            currentQuestion
          )}
        </div>
      )}

      {gameState === 'playing' && (
        <div className="options-container">
          <div className="options-row">
            {options.slice(0, 3).map((opt) => (
              <button
                key={opt.text}
                className={`btn ${opt.class}`}
                onClick={() => handleTurn(opt.text)}
                disabled={loading}
              >
                {opt.icon}
                <span>{opt.text}</span>
              </button>
            ))}
          </div>
          <div className="options-row">
            {options.slice(3, 5).map((opt) => (
              <button
                key={opt.text}
                className={`btn ${opt.class}`}
                onClick={() => handleTurn(opt.text)}
                disabled={loading}
              >
                {opt.icon}
                <span>{opt.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {gameState === 'guessed' && (
        <div className="options-row">
          <button
            className="btn btn-yes"
            onClick={startGame}
          >
            <CheckCircle2 size={18} />
            <span>正解！(最初から)</span>
          </button>
          <button
            className="btn btn-no"
            onClick={() => handleTurn('いいえ、違います。質問を続けてください。')}
          >
            <XCircle size={18} />
            <span>違うよ(推測再開)</span>
          </button>
        </div>
      )}

      {(gameState === 'rejected' || gameState === 'error' || gameState === 'given_up') && (
        <div className="options-row">
          <button
            className="btn btn-primary"
            onClick={startGame}
          >
            <RotateCcw size={18} />
            <span>最初からやり直す</span>
          </button>
        </div>
      )}

      {/* 回答の軌跡 */}
      {displayHistory.length > 0 && (
        <div className="history-container">
          <div className="history-title">これまでの回答 ({displayHistory.length}問)</div>
          <div className="history-tags">
            {displayHistory.map((item, i) => (
              <div key={i} className="history-tag">
                <span className="tag-question">{item.q}</span>
                <span className="tag-answer" style={{
                  color: item.a === 'はい' ? 'var(--btn-yes)' : item.a === 'いいえ' ? 'var(--btn-no)' : 'var(--btn-dunno)'
                }}>
                  {item.a}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

export default App;