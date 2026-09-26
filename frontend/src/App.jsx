import { useState } from 'react';
import { CheckCircle2, XCircle, HelpCircle, ThumbsUp, ThumbsDown, RotateCcw } from 'lucide-react';

function App() {
  const [history, setHistory] = useState([]); // バックエンド用履歴
  const [displayHistory, setDisplayHistory] = useState([]); // 表示用の質問＆回答ペア
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

  const handleTurn = async (userText, currentHistory) => {
    setLoading(true);

    // 回答を表示用履歴に追加 (ユーザーの入力が選択肢の場合のみ)
    if (gameState === 'playing' && userText !== 'いいえ、違います。質問を続けてください。') {
      setDisplayHistory(prev => [...prev, { q: currentQuestion, a: userText }]);
    }

    const newHistory = [
      ...currentHistory,
      { role: 'user', parts: [{ text: userText }] }
    ];
    setHistory(newHistory);

    try {
      const res = await fetch('/akinator/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: newHistory }),
      });

      const data = await res.json();

      if (res.ok) {
        if (data.action === 'ask_question') {
          setCurrentQuestion(data.question);
          setGameState('playing');
        } else if (data.action === 'make_guess') {
          setCurrentGuess(data.guess);
          setGameState('guessed');
        } else if (data.action === 'rejected') {
          setCurrentQuestion(data.reason);
          setGameState('rejected');
        }

        setHistory((prev) => [
          ...prev,
          { role: 'model', parts: [{ text: JSON.stringify(data) }] }
        ]);
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
    const initialText = "ゲームスタート！サッカー選手を1人思い浮かべてください。";
    setHistory([]);
    setDisplayHistory([]);
    handleTurn(initialText, []);
  };

  const getAvatar = () => {
    if (gameState === 'start') return '🔮';
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
      
      <h1 className="title">サッカー選手アキネーター</h1>

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
                onClick={() => handleTurn(opt.text, history)}
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
                onClick={() => handleTurn(opt.text, history)}
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
            onClick={() => handleTurn('いいえ、違います。質問を続けてください。', history)}
          >
            <XCircle size={18} />
            <span>違うよ(推測再開)</span>
          </button>
        </div>
      )}

      {(gameState === 'rejected' || gameState === 'error') && (
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