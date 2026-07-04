function getBullHeads(card) {
    if (card % 11 === 0) return 5;
    else if (card % 10 === 0) return 3;
    else if (card % 5 === 0) return 2;
    else return 1;
}

class NimmtGame {
    constructor(totalPlayers = 4, mode = "normal") {
        this.totalPlayers = totalPlayers;
        this.mode = mode;
        this.scores = Array(totalPlayers).fill(66);
        this.names = ["あなた"].concat(Array.from({length: totalPlayers - 1}, (_, i) => `CPU ${i + 1}`));
        this.roundCount = 1;
        this.gameStarted = true;
        this.gameOver = false;
        this.winnerComment = "";
        this.isRevolution = false;
        this.rows = [];
        this.hands = [];
        this.selectedCard = null;
        this.roundEndWaiting = false;
        this.choosingRowPlayer = -1;
        this.pendingMoves = [];
        this.currentMoveIdx = 0;
        this.logs = [];
        this.turnLogs = [];

        this.startNewRound(true);
    }

    startNewRound(isFirst = false) {
        let currentBoardCards = new Set();
        if (!isFirst) {
            this.rows.forEach(row => row.forEach(c => currentBoardCards.add(c)));
        }
        let deck = [];
        for (let c = 1; c <= 104; c++) {
            if (!currentBoardCards.has(c)) deck.push(c);
        }
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }

        if (isFirst) {
            this.rows = [[deck.pop()], [deck.pop()], [deck.pop()], [deck.pop()]];
        }

        this.hands = [];
        for (let i = 0; i < this.totalPlayers; i++) {
            let hand = [];
            for (let j = 0; j < 10; j++) hand.push(deck.pop());
            hand.sort((a, b) => a - b);
            this.hands.push(hand);
        }

        this.selectedCard = null;
        this.roundEndWaiting = false;
        this.choosingRowPlayer = -1;

        const modeTitle = this.mode === "normal" ? "ノーマルマッチ（サドンデス）" : "スペシャルマッチ（なすりつけ＆軽減）";
        if (isFirst) {
            this.logs = [`🎮 【${modeTitle}】が開始されました！初期持ち点は66点です。<br>手札からカードを選んでください。`];
        } else {
            this.logs = [`🔄 第 ${this.roundCount} ラウンド開始！場札を維持して手札が配り直されました。`];
        }
    }

    checkRevolution(moves) {
        if (this.mode !== "special") return false;
        let playedCards = moves.map(m => m.card).sort((a, b) => a - b);
        if (playedCards.length < 3) return false;
        for (let i = 0; i < playedCards.length - 2; i++) {
            if (playedCards[i+1] === playedCards[i] + 1 && playedCards[i+2] === playedCards[i] + 2) {
                return true;
            }
        }
        return false;
    }

    playTurn(playerCard) {
        if (this.gameOver || this.roundEndWaiting || this.choosingRowPlayer !== -1) return;

        let moves = [{player: 0, card: playerCard}];
        for (let i = 1; i < this.totalPlayers; i++) {
            if (this.hands[i].length > 0) {
                let rIdx = Math.floor(Math.random() * this.hands[i].length);
                let cpuCard = this.hands[i].splice(rIdx, 1)[0];
                moves.push({player: i, card: cpuCard});
            }
        }
        this.hands[0] = this.hands[0].filter(c => c !== playerCard);

        let effectLogs = [];
        if (this.checkRevolution(moves)) {
            this.isRevolution = !this.isRevolution;
            const revStatus = this.isRevolution ? "💥【革命発生】世界の法則が反転した！大きい数字から順に並べます！" : "🔄【革命切り返し】世界の法則が元に戻った！";
            effectLogs.push(`<span style='color:#f43f5e; font-weight:bold; font-size:14px;'>${revStatus}</span>`);
        }

        if (this.mode === "special") {
            let hasEffect = moves.some(m => m.card % 10 === 0 || m.card % 10 === 3 || m.card % 10 === 7);
            if (hasEffect) {
                effectLogs.push("✨ --- スキル所持カード判明 --- ✨");
                moves.forEach(m => {
                    let card = m.card;
                    let pName = this.names[m.player];
                    let pIdx = m.player;
                    if (card % 10 === 0) {
                        this.scores[pIdx] += 3;
                        effectLogs.push(`💖 ${pName} の10の倍数 [${card}] ➔ <b>【自己回復】</b>ライフが3点回復！`);
                    } else if (card % 10 === 3) {
                        m.effect = "accel";
                        effectLogs.push(`⏩ ${pName} の末尾3 [${card}] ➔ <b>【アクセル】</b>バースト時、失点を他全員に押し付ける状態！`);
                    } else if (card % 10 === 7) {
                        m.effect = "brake";
                        effectLogs.push(`⏪ ${pName} の末尾7 [${card}] ➔ <b>【ブレーキ】</b>バースト時、失点を完全に0にする状態！`);
                    }
                });
            }
        }

        if (!this.isRevolution) {
            moves.sort((a, b) => a.card - b.card);
        } else {
            moves.sort((a, b) => b.card - a.card);
        }

        this.turnLogs = [`▼ --- 第 ${this.roundCount}R: ターンの結果 --- ▼`];
        if (effectLogs.length > 0) {
            this.turnLogs = effectLogs.concat([""], this.turnLogs);
        }

        this.pendingMoves = moves;
        this.currentMoveIdx = 0;
        this.processNextMove();
    }

    processNextMove() {
        while (this.currentMoveIdx < this.pendingMoves.length) {
            let m = this.pendingMoves[this.currentMoveIdx];
            let card = m.card;
            let pIdx = m.player;

            let targetRow = -1;
            if (!this.isRevolution) {
                let minDiff = 999;
                for (let r = 0; r < 4; r++) {
                    let last = this.rows[r][this.rows[r].length - 1];
                    if (card > last && (card - last) < minDiff) {
                        minDiff = card - last;
                        targetRow = r;
                    }
                }
            } else {
                let minDiff = 999;
                for (let r = 0; r < 4; r++) {
                    let last = this.rows[r][this.rows[r].length - 1];
                    if (card < last && (last - card) < minDiff) {
                        minDiff = last - card;
                        targetRow = r;
                    }
                }
            }

            if (targetRow === -1) {
                if (pIdx === 0) {
                    this.choosingRowPlayer = 0;
                    this.logs = this.turnLogs.concat([`⚠️ <b>あなたの [${card}] はどこにも置けません！引き取る列を選んでください。</b>`]);
                    render();
                    return;
                } else {
                    let penalties = this.rows.map(row => row.reduce((sum, c) => sum + getBullHeads(c), 0));
                    let minVal = Math.min(...penalties);
                    let chosenRowIdx = penalties.indexOf(minVal);
                    this.executeRowTake(pIdx, chosenRowIdx, m);
                }
            } else {
                this.rows[targetRow].push(card);
                if (this.rows[targetRow].length === 6) {
                    let pLoss = this.rows[targetRow].slice(0, 5).reduce((sum, c) => sum + getBullHeads(c), 0);
                    let pName = this.names[pIdx];
                    let skill = m.effect;

                    if (skill === "accel") {
                        this.turnLogs.push(`⏩💥 6枚目！ ${pName} の<b>【アクセル：なすりつけ】</b>発動！ 列 ${targetRow+1} の <span style='color:#ef4444;font-weight:bold;'>🐄-${pLoss}点</span> を自分以外の全員に分配！`);
                        for (let i = 0; i < this.totalPlayers; i++) {
                            if (i !== pIdx) this.scores[i] -= pLoss;
                        }
                    } else if (skill === "brake") {
                        this.turnLogs.push(`⏪🛡️ 6枚目！ ${pName} の<b>【ブレーキ：牛消滅】</b>発動！ 列 ${targetRow+1} を無傷（0点）でリセット！`);
                    } else {
                        this.scores[pIdx] -= pLoss;
                        this.turnLogs.push(`💥 6枚目！ ${pName} が 列 ${targetRow+1} を引き取り、<span style='color:#ef4444;font-weight:bold;'>🐄-${pLoss}点</span>！`);
                    }
                    this.rows[targetRow] = [card];
                } else {
                    this.turnLogs.push(`🃏 ${this.names[pIdx]} の [${card}] ➔ 列 ${targetRow+1} に配置`);
                }
            }
            this.currentMoveIdx++;
        }

        this.choosingRowPlayer = -1;
        this.turnLogs.push("▲ ------------------------------ ▲");
        this.logs = this.turnLogs;
        this.selectedCard = null;

        if (this.scores.some(s => s <= 0)) {
            this.gameOver = true;
            let maxScore = Math.max(...this.scores);
            let winnerIdx = this.scores.indexOf(maxScore);
            let winnerName = winnerIdx === 0 ? "あなた" : `CPU ${winnerIdx}`;
            this.winnerComment = `🏆 ゲーム終了！最終勝者は残り【${maxScore}点】の【${winnerName}】です！`;
        } else if (this.hands[0].length === 0) {
            this.roundEndWaiting = true;
        }
        render();
    }

    executeRowTake(pIdx, rowIdx, moveData) {
        let card = moveData.card;
        let pName = this.names[pIdx];
        let skill = moveData.effect;
        let pLoss = this.rows[rowIdx].reduce((sum, c) => sum + getBullHeads(c), 0);

        if (skill === "accel") {
            this.turnLogs.push(`⏩💥 ${pName} の [${card}] ➔ 置けない！<b>【アクセル：なすりつけ】</b>発動！ 列 ${rowIdx+1} の <span style='color:#ef4444;font-weight:bold;'>🐄-${pLoss}点</span> を自分以外の全員に分配！`);
            for (let i = 0; i < this.totalPlayers; i++) {
                if (i !== pIdx) this.scores[i] -= pLoss;
            }
        } else if (skill === "brake") {
            this.turnLogs.push(`⏪🛡️ ${pName} の [${card}] ➔ 置けない！が<b>【ブレーキ：牛消滅】</b>発動！ 列 ${rowIdx+1} を無傷（0点）で引き取り！`);
        } else {
            this.scores[pIdx] -= pLoss;
            this.turnLogs.push(`💥 ${pName} の [${card}] ➔ 置けない！ 列 ${rowIdx+1} を引き取り、<span style='color:#ef4444;font-weight:bold;'>🐄-${pLoss}点</span>`);
        }
        this.rows[rowIdx] = [card];
    }

    playerChooseRow(rowIdx) {
        if (this.choosingRowPlayer !== 0) return;
        let m = this.pendingMoves[this.currentMoveIdx];
        this.executeRowTake(0, rowIdx, m);
        this.choosingRowPlayer = -1;
        this.currentMoveIdx++;
        this.processNextMove();
    }
}

let gameState = null;
let selectedMode = "normal";

function initApp() {
    showSetup();
}

function showSetup() {
    const app = document.getElementById("app");
    app.innerHTML = `
        <div class="setup-panel">
            <h2 style="margin-top:0; color:#eab308;">🐄 ニムト・ハイパー 🐄</h2>
            <p style="font-size:13px; color:#94a3b8; margin-bottom:15px;">対戦モードを選択してください</p>
            
            <button class="rule-toggle-btn" onclick="toggleRule()">📖 詳しいルール・特殊カード説明を表示</button>
            <div id="rule-info-box" class="rule-details">
                <b>【基本の遊び方】</b><br>
                1. 全員手札から1枚選んで同時に出します。<br>
                2. 出されたカードは「数字の小さい順」に自動配置されます。<br>
                3. 配置ルール：各列の末尾より大きく、かつ一番数字が近い列の隣に置かれます。<br>
                4. どの列の末尾よりも小さいカードを出した場合、いずれか1列を引き取ります。<b>（★引き取る列を選べます！）</b><br>
                5. <b>1つの列に6枚目</b>を置いてしまったプレイヤーは、前の5枚を引き取ります。<br>
                6. 引き取ったカードの「牛（🐄）」の数がマイナス点になり、誰かのライフが0になるとゲーム終了です。<br><br>
                
                <b>【💥 スペシャルマッチ限定ルール】</b><br>
                手札に以下の印がついた特殊カードが配られます。<br>
                ・<b>10の倍数 <span style="color:#ec4899;font-weight:bold;">[+3回復]</span></b>: 出すだけで自分のライフが<b>3点回復</b>する。<br>
                ・<b>末尾3 <span style="color:#22c55e;font-weight:bold;">[なすり]</span></b>: 自分がバースト（引き取り）した時、その失点を自分以外の全員に押し付ける！<br>
                ・<b>末尾7 <span style="color:#ef4444;font-weight:bold;">[0点化]</span></b>: 自分がバースト（引き取り）した時、その列の失点を完全に0点にする！<br>
                ・<b>💥 革命システム</b>: 全員が出したカードの中に<b>「3連続の数字」</b>（例: 14, 15, 16）が揃うと世界が反転！処理順と配置ルールが<b>「大きい数字から小さい数字へ」</b>に完全逆転します！
            </div>

            <div class="mode-tab-container">
                <div id="tab-normal" class="mode-tab active" onclick="selectMode('normal')">ノーマル</div>
                <div id="tab-special" class="mode-tab" onclick="selectMode('special')">スペシャル💥</div>
            </div>
            
            <div id="desc-normal" style="font-size:12px; color:#cbd5e1; background:#0f172a; padding:10px; border-radius:6px; text-align:left; min-height:60px; border-left:4px solid #3b82f6;">
                <b>【ノーマルマッチ】</b><br>
                特殊効果や革命なしの、純粋なニムトです。誰かのライフが0以下になるまで続くサドンデス。
            </div>
            <div id="desc-special" style="display:none; font-size:12px; color:#cbd5e1; background:#0f172a; padding:10px; border-radius:6px; text-align:left; min-height:60px; border-left:4px solid #eab308;">
                <b>【スペシャルマッチ】</b><br>
                手札に「+3回復」「なすりつけ」「0点化」の特殊カードが出現。さらに「3連番」でルールが真逆になる革命が発生します！
            </div>
            
            <p style="font-size:13px; color:#94a3b8; margin-top:20px; margin-bottom:5px; text-align:left;">👥 プレイ人数</p>
            <select class="setup-select" id="player-count-select">
                <option value="2">2人プレイ</option>
                <option value="3">3人プレイ</option>
                <option value="4" selected>4人プレイ</option>
                <option value="5">5人プレイ</option>
                <option value="6">6人プレイ</option>
            </select>
            
            <button class="setup-btn" onclick="startGame()">⚔️ 試合開始！</button>
        </div>
    `;
}

function toggleRule() {
    let box = document.getElementById('rule-info-box');
    box.style.display = box.style.display === 'block' ? 'none' : 'block';
}

function selectMode(mode) {
    selectedMode = mode;
    if(mode === 'normal') {
        document.getElementById('tab-normal').className = 'mode-tab active';
        document.getElementById('tab-special').className = 'mode-tab';
        document.getElementById('desc-normal').style.display = 'block';
        document.getElementById('desc-special').style.display = 'none';
    } else {
        document.getElementById('tab-normal').className = 'mode-tab';
        document.getElementById('tab-special').className = 'mode-tab active special-active';
        document.getElementById('desc-normal').style.display = 'none';
        document.getElementById('desc-special').style.display = 'block';
    }
}

function startGame() {
    let count = parseInt(document.getElementById('player-count-select').value);
    gameState = new NimmtGame(count, selectedMode);
    render();
}

function getCardBadgeHtml(c) {
    if (gameState.mode !== "special") return "";
    if (c % 10 === 0) return '<div class="badge badge-rec">💖 +3回復</div>';
    else if (c % 10 === 3) return '<div class="badge badge-acc">⏩ なすり</div>';
    else if (c % 10 === 7) return '<div class="badge badge-brk">⏪ 0点化</div>';
    return "";
}

function render() {
    if (!gameState) return;
    const app = document.getElementById("app");

    let scoreHtml = "";
    for (let i = 0; i < gameState.totalPlayers; i++) {
        let color = i === 0 ? "#38bdf8" : "#f8fafc";
        if (gameState.scores[i] <= 0) {
            scoreHtml += `<div style="color: #ef4444; font-weight: bold; text-decoration: line-through;">${gameState.names[i]}: ${gameState.scores[i]}点</div>`;
        } else {
            scoreHtml += `<div style="color: ${color}; font-weight: bold;">${gameState.names[i]}: ⭐ ${gameState.scores[i]}点</div>`;
        }
    }

    let boardHtml = "";
    gameState.rows.forEach((row, rIdx) => {
        let cardsHtml = row.map(c => `
            <div class="card">
                <div>${c}</div>
                <div style="font-size:7px;color:red;">🐄${getBullHeads(c)}</div>
                ${getCardBadgeHtml(c)}
            </div>
        `).join("");

        let chooseBtnHtml = "";
        if (gameState.choosingRowPlayer === 0) {
            chooseBtnHtml = `<button class="row-choose-btn" onclick="gameState.playerChooseRow(${rIdx})">👈 この列を引き取る</button>`;
        }
        boardHtml += `<div class="row-container"><div class="row-label">列 ${rIdx+1}</div><div class="cards">${cardsHtml}</div>${chooseBtnHtml}</div>`;
    });

    let confirmHtml = "";
    if (gameState.gameOver) {
        confirmHtml = `<div style="background:#22c55e; color:white; padding:12px; border-radius:8px; text-align:center; font-weight:bold; font-size:15px; margin-bottom:12px;">${gameState.winnerComment}</div>`;
    } else if (gameState.choosingRowPlayer === 0) {
        confirmHtml = `
            <div class="confirm-panel" style="background:#f59e0b;">
                🚨 引き取る列を選択してください！<br>
                <span style="font-size:11px; font-weight:normal;">上の各列の右側にある「👈 この列を引き取る」ボタンを押してください。</span>
            </div>
        `;
    } else if (gameState.roundEndWaiting) {
        confirmHtml = `
            <div class="confirm-panel" style="background:#475569;">
                📢 全員手札を使い切りました！
                <button class="next-round-btn" style="margin-top:8px; background:#a855f7;" onclick="nextRound()">➔ 場札を引き継いで次のラウンドへ</button>
            </div>
        `;
    } else if (gameState.selectedCard !== null) {
        confirmHtml = `
            <div class="confirm-panel">
                📬 [${gameState.selectedCard}] を選択中... 
                <button class="confirm-btn" onclick="commitCard()">このカードで確定する</button>
            </div>
        `;
    }

    let handHtml = "";
    if (!gameState.gameOver && !gameState.roundEndWaiting && gameState.choosingRowPlayer !== 0 && gameState.hands[0]) {
        gameState.hands[0].forEach(c => {
            let isSelected = c === gameState.selectedCard ? " selected-card" : "";
            handHtml += `
                <div class="card my-card${isSelected}" onclick="selectCard(${c})">
                    <div style="font-size:11px;color:#64748b;">🐄${getBullHeads(c)}</div>
                    <div style="font-size:18px;line-height:1;">${c}</div>
                    ${getCardBadgeHtml(c) ? getCardBadgeHtml(c) : '<div style="height:12px;"></div>'}
                </div>
            `;
        });
    } else if (gameState.choosingRowPlayer === 0) {
        handHtml = "<div style='color:#f59e0b; font-size:13px; font-weight:bold;'>⚠️ 列選択のため手札は一時ロックされています。</div>";
    } else if (gameState.roundEndWaiting) {
        handHtml = "<div style='color:#94a3b8; font-size:13px;'>手札はありません。</div>";
    } else if (gameState.gameOver) {
        handHtml = "<div style='color:#ef4444; font-size:13px; font-weight:bold;'>💀 ゲーム終了 💀</div>";
    }

    let logHtml = gameState.logs.join("<br>");
    let modeDisplay = gameState.mode === "normal" ? "ノーマル（サドンデス）" : (gameState.isRevolution ? "💥 スペシャル（革命状態！）" : "スペシャル（スキルバトル）");
    let bodyClass = gameState.isRevolution ? "game-body body-rev" : "game-body body-normal";

    app.innerHTML = `
        <div class="${bodyClass}">
            <div style="text-align:center; font-size:12px; margin-bottom:4px; font-weight:bold; letter-spacing:1px;">✨ ${modeDisplay} 第 ${gameState.roundCount} ラウンド ✨</div>
            <div class="score-board">${scoreHtml}</div>
            <div id="board">${boardHtml}</div>
            <div style="margin-top:15px; background: rgba(15, 23, 42, 0.6); padding:10px; border-radius:8px; border: 1px solid #334155;">
                ${confirmHtml}
                <div style="font-size:12px; color:#94a3b8; margin-bottom:6px; font-weight:bold;">あなたの手札:</div>
                <div class="cards">${handHtml}</div>
            </div>
            <div class="log-box" id="log-box">${logHtml}</div>
        </div>
    `;

    let logBox = document.getElementById("log-box");
    if(logBox) logBox.scrollTop = logBox.scrollHeight;
}

function selectCard(card) {
    if (gameState && gameState.choosingRowPlayer === -1) {
        gameState.selectedCard = card;
        render();
    }
}

function commitCard() {
    if (gameState && gameState.selectedCard !== null && gameState.choosingRowPlayer === -1) {
        gameState.playTurn(gameState.selectedCard);
    }
}

function nextRound() {
    if (gameState && gameState.roundEndWaiting) {
        gameState.roundCount++;
        gameState.startNewRound();
        render();
    }
}

// 起動
initApp();
