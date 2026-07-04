const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

let rooms = {}; // 部屋ごとのゲーム状態を管理

function getBullHeads(card) {
    if (card % 11 === 0) return 5;
    else if (card % 10 === 0) return 3;
    else if (card % 5 === 0) return 2;
    else return 1;
}

io.on('connection', (socket) => {
    let currentRoom = null;
    let playerIdx = null;

    // 部屋に入る・作成
    socket.on('joinRoom', ({ roomName, playerName, maxPlayers, mode }) => {
        if (!rooms[roomName]) {
            rooms[roomName] = {
                name: roomName,
                maxPlayers: parseInt(maxPlayers) || 4,
                mode: mode || "normal",
                players: [],
                gameStarted: false,
                rows: [],
                roundCount: 1,
                isRevolution: false,
                moves: []
            };
        }

        const room = rooms[roomName];
        if (room.gameStarted) {
            socket.emit('errorMsg', 'この部屋のゲームは既に開始されています。');
            return;
        }
        if (room.players.length >= room.maxPlayers) {
            socket.emit('errorMsg', '部屋が満員です。');
            return;
        }

        currentRoom = roomName;
        playerIdx = room.players.length;

        room.players.push({
            id: socket.id,
            name: playerName,
            score: 66,
            hand: [],
            selectedCard: null,
            effect: null
        });

        socket.join(roomName);
        io.to(roomName).emit('roomUpdate', room);

        // 人数が揃ったら自動開始
        if (room.players.length === room.maxPlayers) {
            startGame(room);
        }
    });

    // カードの選択
    socket.on('selectCard', (card) => {
        const room = rooms[currentRoom];
        if (!room || !room.gameStarted) return;

        const player = room.players[playerIdx];
        if (!player || player.selectedCard !== null) return;

        player.selectedCard = card;
        // スキル先行処理（スペシャルモード）
        if (room.mode === "special") {
            if (card % 10 === 0) player.score += 3; // 即時回復
            if (card % 10 === 3) player.effect = "accel";
            if (card % 10 === 7) player.effect = "brake";
        }

        io.to(currentRoom).emit('roomUpdate', room);

        // 全員がカードを出したかチェック
        if (room.players.every(p => p.selectedCard !== null)) {
            processTurn(room);
        }
    });

    // 置けない時の列選択
    socket.on('chooseRow', (rowIdx) => {
        const room = rooms[currentRoom];
        if (!room) return;
        
        // 処理中のプレイヤーのみ選択可能
        if (room.choosingPlayer !== playerIdx) return;

        executeRowTake(room, playerIdx, rowIdx, room.currentMoveCard, room.currentMoveEffect);
        room.choosingPlayer = null;
        room.currentMoveIdx++;
        processMovesSequence(room);
    });

    // 次のラウンドへ
    socket.on('nextRound', () => {
        const room = rooms[currentRoom];
        if (room && room.roundEndWaiting) {
            room.roundCount++;
            startNewRound(room, false);
        }
    });

    socket.on('disconnect', () => {
        if (rooms[currentRoom]) {
            io.to(currentRoom).emit('logUpdate', `⚠️ ${rooms[currentRoom].players[playerIdx]?.name || 'プレイヤー'} が切断しました。`);
            delete rooms[currentRoom]; // 誰か抜けたら部屋解体（シンプル化のため）
        }
    });
});

function startGame(room) {
    room.gameStarted = true;
    // デッキ作成（1〜104）
    let deck = [];
    for (let c = 1; c <= 104; c++) deck.push(c);
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // 初期場札4枚
    room.rows = [[deck.pop()], [deck.pop()], [deck.pop()], [deck.pop()]];
    room.deck = deck;

    startNewRound(room, true);
}

function startNewRound(room, isFirst = false) {
    let deck = room.deck;
    if (!isFirst) {
        let currentBoardCards = new Set();
        room.rows.forEach(row => row.forEach(c => currentBoardCards.add(c)));
        deck = [];
        for (let c = 1; c <= 104; c++) {
            if (!currentBoardCards.has(c)) deck.push(c);
        }
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
    }

    // 手札配り (10枚ずつ)
    room.players.forEach(p => {
        p.hand = [];
        for (let j = 0; j < 10; j++) p.hand.push(deck.pop());
        p.hand.sort((a, b) => a - b);
        p.selectedCard = null;
        p.effect = null;
    });

    room.roundEndWaiting = false;
    room.choosingPlayer = null;
    room.logs = isFirst ? [`🎮 ゲーム開始！モード: ${room.mode}`] : [`🔄 第 ${room.roundCount} ラウンド開始！`];
    
    io.to(room.name).emit('roomUpdate', room);
}

function checkRevolution(moves) {
    let playedCards = moves.map(m => m.card).sort((a, b) => a - b);
    if (playedCards.length < 3) return false;
    for (let i = 0; i < playedCards.length - 2; i++) {
        if (playedCards[i+1] === playedCards[i] + 1 && playedCards[i+2] === playedCards[i] + 2) return true;
    }
    return false;
}

function processTurn(room) {
    let moves = room.players.map((p, idx) => ({
        playerIdx: idx,
        card: p.selectedCard,
        effect: p.effect,
        name: p.name
    }));

    // 手札から消去
    room.players.forEach(p => {
        p.hand = p.hand.filter(c => c !== p.selectedCard);
    });

    room.turnLogs = [`▼ --- 第 ${room.roundCount}R: ターン結果 --- ▼`];

    // 革命チェック
    if (room.mode === "special" && checkRevolution(moves)) {
        room.isRevolution = !room.isRevolution;
        room.turnLogs.push(room.isRevolution ? "💥【革命発生】世界の法則が反転！大きい順に並べます！" : "🔄【革命切り返し】法則が元に戻りました！");
    }

    // 並び替え
    if (!room.isRevolution) {
        moves.sort((a, b) => a.card - b.card);
    } else {
        moves.sort((a, b) => b.card - a.card);
    }

    room.pendingMoves = moves;
    room.currentMoveIdx = 0;
    processMovesSequence(room);
}

function processMovesSequence(room) {
    while (room.currentMoveIdx < room.pendingMoves.length) {
        let m = room.pendingMoves[room.currentMoveIdx];
        let card = m.card;
        let pIdx = m.playerIdx;

        let targetRow = -1;
        if (!room.isRevolution) {
            let minDiff = 999;
            for (let r = 0; r < 4; r++) {
                let last = room.rows[r][room.rows[r].length - 1];
                if (card > last && (card - last) < minDiff) {
                    minDiff = card - last;
                    targetRow = r;
                }
            }
        } else {
            let minDiff = 999;
            for (let r = 0; r < 4; r++) {
                let last = room.rows[r][room.rows[r].length - 1];
                if (card < last && (last - card) < minDiff) {
                    minDiff = last - card;
                    targetRow = r;
                }
            }
        }

        if (targetRow === -1) {
            // 置けないのでプレイヤーの選択を待つ
            room.choosingPlayer = pIdx;
            room.currentMoveCard = card;
            room.currentMoveEffect = m.effect;
            io.to(room.name).emit('roomUpdate', room);
            return; 
        } else {
            room.rows[targetRow].push(card);
            if (room.rows[targetRow].length === 6) {
                let pLoss = room.rows[targetRow].slice(0, 5).reduce((sum, c) => sum + getBullHeads(c), 0);
                if (m.effect === "accel") {
                    room.turnLogs.push(`⏩💥 6枚目！ ${m.name} の【なすりつけ】！ 失点 🐄-${pLoss} を他全員に分配！`);
                    room.players.forEach((p, idx) => { if(idx !== pIdx) p.score -= pLoss; });
                } else if (m.effect === "brake") {
                    room.turnLogs.push(`⏪🛡️ 6枚目！ ${m.name} の【0点化】！ 列 ${targetRow+1} を無傷でリセット！`);
                } else {
                    room.players[pIdx].score -= pLoss;
                    room.turnLogs.push(`💥 6枚目！ ${m.name} が列 ${targetRow+1} を引き取り、🐄-${pLoss}点！`);
                }
                room.rows[targetRow] = [card];
            } else {
                room.turnLogs.push(`🃏 ${m.name} の [${card}] ➔ 列 ${targetRow+1}`);
            }
        }
        room.currentMoveIdx++;
    }

    // 全員の処理が終わったらクリーンアップ
    room.players.forEach(p => { p.selectedCard = null; p.effect = null; });
    room.logs = room.turnLogs;
    
    // 勝敗・ラウンド終了チェック
    if (room.players.some(p => p.score <= 0)) {
        room.gameOver = true;
        let max = Math.max(...room.players.map(p => p.score));
        let winner = room.players.find(p => p.score === max);
        room.logs.push(`🏆 ゲーム終了！勝者は ${winner.name} (${max}点)！`);
    } else if (room.players[0].hand.length === 0) {
        room.roundEndWaiting = true;
    }

    io.to(room.name).emit('roomUpdate', room);
}

function executeRowTake(room, pIdx, rowIdx, card, effect) {
    let pLoss = room.rows[rowIdx].reduce((sum, c) => sum + getBullHeads(c), 0);
    let pName = room.players[pIdx].name;

    if (effect === "accel") {
        room.turnLogs.push(`⏩💥 ${pName} の [${card}] 置けない！【なすりつけ】で列 ${rowIdx+1} の失点 🐄-${pLoss} を他全員に分配！`);
        room.players.forEach((p, idx) => { if(idx !== pIdx) p.score -= pLoss; });
    } else if (effect === "brake") {
        room.turnLogs.push(`⏪🛡️ ${pName} の [${card}] 置けない！【0点化】で列 ${rowIdx+1} を無傷リセット！`);
    } else {
        room.players[pIdx].score -= pLoss;
        room.turnLogs.push(`💥 ${pName} が列 ${rowIdx+1} を引き取り、🐄-${pLoss}点！`);
    }
    room.rows[rowIdx] = [card];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
