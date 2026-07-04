// ⚠️ RenderでWeb Serviceを作成後、発行されたURL（例: https://xxx.onrender.com）にここを書き換えてください！
const RENDER_SERVER_URL = "https://あなたのRenderサービス名.onrender.com"; 

let socket = null;
let myRoom = null;
let myId = null;
let myPlayerIdx = -1;

function getBullHeads(card) {
    if (card % 11 === 0) return 5;
    else if (card % 10 === 0) return 3;
    else if (card % 5 === 0) return 2;
    else return 1;
}

function initApp() {
    showSetup();
}

function showSetup() {
    const app = document.getElementById("app");
    app.innerHTML = `
        <div class="setup-panel">
            <h2 style="margin-top:0; color:#eab308;">🐄 ニムト・ハイパー (通信版) 🐄</h2>
            
            <p style="font-size:13px; color:#94a3b8; text-align:left; margin-bottom:5px;">👤 プレイヤー名</p>
            <input type="text" id="player-name" class="setup-select" value="プレイヤー" style="padding:10px;">

            <p style="font-size:13px; color:#94a3b8; text-align:left; margin-bottom:5px;">🔑 部屋名 (友達と同じ名前にする)</p>
            <input type="text" id="room-name" class="setup-select" value="room123" style="padding:10px;">

            <p style="font-size:13px; color:#94a3b8; text-align:left; margin-bottom:5px;">👥 プレイ人数上限 (最大8人)</p>
            <select class="setup-select" id="player-count-select">
                <option value="2">2人プレイ</option>
                <option value="3">3人プレイ</option>
                <option value="4" selected>4人プレイ</option>
                <option value="5">5人プレイ</option>
                <option value="6">6人プレイ</option>
                <option value="7">7人プレイ</option>
                <option value="8">8人プレイ</option>
            </select>

            <div class="mode-tab-container" style="margin-top:15px;">
                <div id="tab-normal" class="mode-tab active" onclick="selectMode('normal')">ノーマル</div>
                <div id="tab-special" class="mode-tab" onclick="selectMode('special')">スペシャル💥</div>
            </div>
            <input type="hidden" id="selected-mode" value="normal">
            
            <button class="setup-btn" onclick="connectAndJoin()">部屋に入る / 作成 ⚔️</button>
        </div>
    `;
}

let selectedMode = "normal";
function selectMode(mode) {
    selectedMode = mode;
    document.getElementById('tab-normal').className = mode === 'normal' ? 'mode-tab active' : 'mode-tab';
    document.getElementById('tab-special').className = mode === 'special' ? 'mode-tab active special-active' : 'mode-tab';
}

function connectAndJoin() {
    const pName = document.getElementById("player-name").value;
    const rName = document.getElementById("room-name").value;
    const pCount = document.getElementById("player-count-select").value;

    document.getElementById("app").innerHTML = `<div class="setup-panel">⏳ サーバーに接続中...全員揃うと自動で始まります。</div>`;

    // Socket接続開始
    socket = io(RENDER_SERVER_URL);

    socket.emit('joinRoom', {
        roomName: rName,
        playerName: pName,
        maxPlayers: pCount,
        mode: selectedMode
    });

    socket.on('roomUpdate', (room) => {
        myRoom = room;
        myId = socket.id;
        myPlayerIdx = room.players.findIndex(p => p.id === myId);
        render();
    });

    socket.on('logUpdate', (msg) => {
        alert(msg);
    });

    socket.on('errorMsg', (msg) => {
        alert(msg);
        location.reload();
    });
}

function getCardBadgeHtml(c) {
    if (myRoom.mode !== "special") return "";
    if (c % 10 === 0) return '<div class="badge badge-rec">💖 +3回復</div>';
    else if (c % 10 === 3) return '<div class="badge badge-acc">⏩ なすり</div>';
    else if (c % 10 === 7) return '<div class="badge badge-brk">⏪ 0点化</div>';
    return "";
}

function render() {
    if (!myRoom) return;
    const app = document.getElementById("app");

    // 待機画面
    if (!myRoom.gameStarted) {
        app.innerHTML = `
            <div class="setup-panel">
                <h3>🚪 部屋: ${myRoom.name} に参加中</h3>
                <p>現在の人数のマルチプレイ待機中... (${myRoom.players.length} / ${myRoom.maxPlayers}人)</p>
                <div style="text-align:left; background:rgba(0,0,0,0.2); padding:10px; border-radius:6px;">
                    ${myRoom.players.map(p => `<div>👤 ${p.name}</div>`).join("")}
                </div>
            </div>
        `;
        return;
    }

    // スコアボード
    let scoreHtml = myRoom.players.map(p => {
        let isMe = p.id === myId ? "color:#38bdf8; font-weight:bold;" : "color:#f8fafc;";
        let status = p.selectedCard !== null ? " ✅選択済" : " 🕒選考中";
        if (myRoom.gameOver) status = "";
        return `<div style="${isMe}">${p.name}: ⭐${p.score}点${status}</div>`;
    }).join("");

    // 場札の列
    let boardHtml = myRoom.rows.map((row, rIdx) => {
        let cardsHtml = row.map(c => `
            <div class="card">
                <div>${c}</div>
                <div style="font-size:7px;color:red;">🐄${getBullHeads(c)}</div>
                ${getCardBadgeHtml(c)}
            </div>
        `).join("");

        let chooseBtnHtml = "";
        if (myRoom.choosingPlayer === myPlayerIdx) {
            chooseBtnHtml = `<button class="row-choose-btn" onclick="socket.emit('chooseRow', ${rIdx})">👈 この列を引き取る</button>`;
        }
        return `<div class="row-container"><div class="row-label">列 ${rIdx+1}</div><div class="cards">${cardsHtml}</div>${chooseBtnHtml}</div>`;
    }).join("");

    // アクションパネル
    let confirmHtml = "";
    const me = myRoom.players[myPlayerIdx];

    if (myRoom.gameOver) {
        confirmHtml = `<div style="background:#22c55e; color:white; padding:12px; border-radius:8px; text-align:center; font-weight:bold;">ゲーム終了！</div>`;
    } else if (myRoom.choosingPlayer === myPlayerIdx) {
        confirmHtml = `<div class="confirm-panel" style="background:#f59e0b;">🚨 あなたのカードは置けません！引き取る列を上のボタンから選んでください。</div>`;
    } else if (myRoom.choosingPlayer !== null && myRoom.choosingPlayer !== undefined) {
        confirmHtml = `<div class="confirm-panel" style="background:#475569;">🕒 ${myRoom.players[myRoom.choosingPlayer].name} が列を選択しています...</div>`;
    } else if (myRoom.roundEndWaiting) {
        confirmHtml = `
            <div class="confirm-panel" style="background:#475569;">
                📢 ラウンドが終了しました
                <button class="next-round-btn" onclick="socket.emit('nextRound')">➔ 次のラウンドへ進む</button>
            </div>
        `;
    } else if (me && me.selectedCard !== null) {
        confirmHtml = `<div class="confirm-panel" style="background:#3b82f6;">📬 カード [${me.selectedCard}] を提出済み。他の人を待っています...</div>`;
    }

    // 手札
    let handHtml = "";
    if (me && me.hand && !myRoom.gameOver && !myRoom.roundEndWaiting && myRoom.choosingPlayer === null) {
        me.hand.forEach(c => {
            handHtml += `
                <div class="card my-card" onclick="socket.emit('selectCard', ${c})">
                    <div style="font-size:11px;color:#64748b;">🐄${getBullHeads(c)}</div>
                    <div style="font-size:18px;line-height:1;">${c}</div>
                    ${getCardBadgeHtml(c) ? getCardBadgeHtml(c) : '<div style="height:12px;"></div>'}
                </div>
            `;
        });
    }

    let logHtml = myRoom.logs.join("<br>");
    let bodyClass = myRoom.isRevolution ? "game-body body-rev" : "game-body body-normal";

    app.innerHTML = `
        <div class="${bodyClass}">
            <div style="text-align:center; font-size:12px; margin-bottom:4px; font-weight:bold;">✨ モード: ${myRoom.mode} 第 ${myRoom.roundCount} ラウンド ✨</div>
            <div class="score-board">${scoreHtml}</div>
            <div id="board">${boardHtml}</div>
            <div style="margin-top:15px; background: rgba(15, 23, 42, 0.6); padding:10px; border-radius:8px;">
                ${confirmHtml}
                ${handHtml ? `<div style="font-size:12px; color:#94a3b8; margin-bottom:6px; font-weight:bold;">あなたの手札 (タップすると即提出されます):</div>` : ''}
                <div class="cards">${handHtml}</div>
            </div>
            <div class="log-box" id="log-box">${logHtml}</div>
        </div>
    `;
}

// 起動
initApp();
