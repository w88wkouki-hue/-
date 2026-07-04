import asyncio, json, random
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
app = FastAPI()
def get_bull_heads(card):
    if card == 55: return 7
    elif card % 11 == 0: return 5
    elif card % 10 == 0: return 3
    elif card % 5 == 0: return 2
    else: return 1
class NimmtEngine:
    def __init__(self):
        self.deck = list(range(1, 105))
        random.shuffle(self.deck)
        self.rows = [[self.deck.pop()] for _ in range(4)]
        self.hands = [sorted([self.deck.pop() for _ in range(10)]) for _ in range(4)]
        self.scores = [0] * 4
        self.player_names = ["プレイヤー1", "プレイヤー2", "CPU 1", "CPU 2"]
        self.current_moves = {}
        self.waiting_row = None
        self.pending_moves = []
    def get_state(self, p_idx):
        return {"rows": self.rows, "hand": self.hands[p_idx], "scores": self.scores, "names": self.player_names, "player_idx": p_idx, "waiting_row": self.waiting_row}
game = NimmtEngine()
class ConnectionManager:
    def __init__(self): self.active = {}
    async def connect(self, ws, p_idx): await ws.accept(); self.active[p_idx] = ws
    def disconnect(self, p_idx):
        if p_idx in self.active: del self.active[p_idx]
    async def broadcast(self):
        for p_idx, ws in self.active.items():
            try: await ws.send_text(json.dumps({"type": "state", "data": game.get_state(p_idx)}))
            except: pass
    async def send_log(self, msg):
        for ws in self.active.values():
            try: await ws.send_text(json.dumps({"type": "log", "message": msg}))
            except: pass
manager = ConnectionManager()
async def process_turns():
    for cpu in [2, 3]:
        if game.hands[cpu]:
            c = random.choice(game.hands[cpu]); game.hands[cpu].remove(c); game.current_moves[cpu] = c
    await manager.send_log("全員がカードを出し終えました。順に配置します...")
    await asyncio.sleep(1)
    game.pending_moves = sorted([{"player": p, "card": c} for p, c in game.current_moves.items()], key=lambda x: x["card"])
    game.current_moves = {}
    await next_move()
async def next_move():
    if not game.pending_moves:
        if len(game.hands[0]) == 0:
            winner = game.player_names[game.scores.index(min(game.scores))]
            await manager.send_log(f"🎉 <b>ゲーム終了！</b> 勝者は 【{winner}】 です！")
        else: await manager.send_log("次のターンです。手札からカードを選んでください。")
        await manager.broadcast(); return
    move = game.pending_moves.pop(0); card = move["card"]; p_idx = move["player"]; p_name = game.player_names[p_idx]
    target_row = -1; min_diff = 999
    for r in range(4):
        last = game.rows[r][-1]
        if card > last and (card - last) < min_diff: min_diff = card - last; target_row = r
    if target_row == -1:
        if p_idx in [0, 1]:
            game.waiting_row = p_idx; game.pending_moves.insert(0, move)
            await manager.send_log(f"⚠️ 【{p_name}】の [{card}] は置けません！列を選択中...")
            await manager.broadcast()
        else:
            penalties = [sum(get_bull_heads(c) for c in r) for r in game.rows]
            await execute_take(p_idx, card, penalties.index(min(penalties)))
    else:
        game.rows[target_row].append(card)
        await manager.send_log(f"【{p_name}】の [{card}] ➔ 列 {target_row+1}")
        await manager.broadcast(); await asyncio.sleep(1.2)
        if len(game.rows[target_row]) == 6:
            p = sum(get_bull_heads(c) for c in game.rows[target_row][:5])
            game.scores[p_idx] += p; game.rows[target_row] = [card]
            await manager.send_log(f"💥 6枚目！【{p_name}】が列 {target_row+1} を引き取り 🐄{p} 失点！")
            await manager.broadcast(); await asyncio.sleep(1.5)
        await next_move()
async def execute_take(p_idx, card, r_idx):
    p = sum(get_bull_heads(c) for c in game.rows[r_idx])
    game.scores[p_idx] += p; game.rows[r_idx] = [card]; game.waiting_row = None
    await manager.send_log(f"💥 【{game.player_names[p_idx]}】が列 {r_idx+1} を引き取り 🐄{p} 失点！")
    await manager.broadcast(); await asyncio.sleep(1.5); await next_move()
@app.get("/")
async def get(): return HTMLResponse(html_content)
@app.websocket("/ws/{p_idx}")
async def websocket_endpoint(ws: WebSocket, p_idx: int):
    await manager.connect(ws, p_idx); await manager.broadcast()
    try:
        while True:
            data = await ws.receive_text(); event = json.loads(data)
            if event["type"] == "play_card" and game.waiting_row is None:
                card = event["card"]
                if card in game.hands[p_idx]:
                    game.hands[p_idx].remove(card); game.current_moves[p_idx] = card
                    await manager.send_log(f"✓ {game.player_names[p_idx]} がカードを伏せました。")
                    if 0 in game.current_moves and 1 in game.current_moves: asyncio.create_task(process_turns())
                    else: await manager.broadcast()
            elif event["type"] == "choose_row" and game.waiting_row == p_idx:
                asyncio.create_task(execute_take(p_idx, game.pending_moves.pop(0)["card"], event["row_idx"]))
    except WebSocketDisconnect: manager.disconnect(p_idx)

html_content = """
<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><title>スマホニムト</title><style>body{font-family:sans-serif;background:#0f172a;color:#f8fafc;margin:0;padding:10px;}#game{width:100%;max-width:500px;margin:0 auto;background:#1e293b;padding:12px;border-radius:12px;box-sizing:border-box;}.btn-group{display:flex;gap:10px;margin-bottom:15px;}.join-btn{flex:1;padding:12px;font-weight:bold;border:none;border-radius:6px;background:#38bdf8;color:#0f172a;}.score-board{background:#0f172a;padding:8px;border-radius:8px;font-size:12px;display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:12px;text-align:center;}.row-container{display:flex;align-items:center;background:#0f172a;padding:6px;margin-bottom:6px;border-radius:6px;min-height:55px;position:relative;}.row-label{width:40px;font-size:12px;font-weight:bold;color:#94a3b8;}.cards{display:flex;gap:4px;flex-wrap:wrap;flex-grow:1;}.card{width:32px;height:48px;background:white;color:black;border-radius:4px;display:flex;flex-direction:column;justify-content:space-between;align-items:center;padding:2px;font-weight:bold;font-size:13px;box-shadow:0 2px 4px rgba(0,0,0,0.3);box-sizing:border-box;}.card.my-card{width:42px;height:60px;font-size:16px;background:#fef9c3;border:2px solid #eab308;}.take-btn{position:absolute;right:5px;background:#ef4444;color:white;border:none;padding:6px 10px;font-size:11px;font-weight:bold;border-radius:4px;}#log{background:#000;padding:8px;border-radius:6px;min-height:50px;font-size:13px;color:#38bdf8;margin-top:12px;}</style></head><body><div id="game"><div class="btn-group"><button class="join-btn" onclick="connectAs(0)">P1参戦</button><button class="join-btn" onclick="connectAs(1)">P2参戦</button></div><div class="score-board" id="scores">入室してください</div><div id="board"></div><div style="margin-top:15px;background:#0f172a;padding:8px;border-radius:8px;"><div style="font-size:12px;color:#94a3b8;margin-bottom:6px;">手札:</div><div class="cards" id="hand"></div></div><div id="log">参戦ボタンをタップしてください。</div></div><script>let ws;let myIdx=-1;function getBulls(c){if(c===55)return"🐄7";if(c%11===0)return"🐄5";if(c%10===0)return"🐄3";if(c%5===0)return"🐄2";return"🐄1";}function connectAs(idx){myIdx=idx;const loc=window.location;const p=loc.protocol==="https:"?"wss:":"ws:";ws=new WebSocket(`${p}//${loc.host}/ws/${idx}`);ws.onmessage=function(e){const msg=JSON.parse(e.data);if(msg.type==="state")render(msg.data);if(msg.type==="log")document.getElementById("log").innerHTML=msg.message;};document.querySelector(".btn-group").style.display="none";}function render(data){document.getElementById("scores").innerHTML=data.names.map((name,i)=>`<div style="color:${i===myIdx?'#38bdf8':'#f8fafc'}">${name}: 🐄${data.scores[i]}</div>`).join("");document.getElementById("board").innerHTML=data.rows.map((row,rIdx)=>`<div class="row-container"><div class="row-label">列 ${rIdx+1}</div><div class="cards">${row.map(c=>`<div class="card"><div>${c}</div><div style="font-size:7px;color:red;">${getBulls(c)}</div></div>`).join("")}</div><button class="take-btn" onclick="chooseRow(${rIdx})" style="display:${data.waiting_row===myIdx?'block':'none'}">引き取る</button></div>`).join("");document.getElementById("hand").innerHTML=data.hand.map(c=>`<div class="card my-card" onclick="playCard(${c})"><div>${c}</div><div style="font-size:8px;color:red;">${getBulls(c)}</div></div>`).join("");}function playCard(c){ws.send(JSON.stringify({type:"play_card",card:c}));}function chooseRow(r){ws.send(JSON.stringify({type:"choose_row",row_idx:r}));}</script></body></html>
"""
