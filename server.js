const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200);
    return res.end('ok');
  }
  res.writeHead(200);
  res.end('Lovecraft Letter Server Running');
});

const wss = new WebSocket.Server({ server });

const rooms = {};
const MAX_PLAYER = 6;
const MIN_PLAYER = 2;

function genRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function broadcast(room, data) {
  room.players.forEach(p => {
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify(data));
    }
  });
}

const ALL_CARDS = [
  {id:1,name:"调查员",num:1,count:5,insaneCard:false},
  {id:2,name:"乌尔塔尔的猫",num:2,count:2,insaneCard:false},
  {id:3,name:"大种族",num:3,count:2,insaneCard:false},
  {id:4,name:"古神印记",num:4,count:2,insaneCard:false},
  {id:5,name:"阿米蒂奇教授",num:5,count:2,insaneCard:false},
  {id:6,name:"伦道夫·卡特",num:6,count:1,insaneCard:false},
  {id:7,name:"银钥匙",num:7,count:1,insaneCard:true},
  {id:8,name:"死灵之书",num:8,count:1,insaneCard:true},
  {id:9,name:"克苏鲁",num:9,count:1,insaneCard:true},
];
const MIGO_CARD = {id:99,name:"米戈脑匣",num:0};

function createRoomData(){
  let deck = [];
  ALL_CARDS.forEach(c=>{
    for(let i=0;i<c.count;i++) deck.push({...c});
  });
  deck = shuffle(deck);
  const burn = deck.pop();
  let extraBurn = [];
  return {
    deck, burn, extraBurn,
    round:1,
    turnIndex:0,
    phase:"waitStart",
    playersData:[],
    playerTokens: [],
  }
}

function initRound(room){
  const g = room.game;
  g.deck = [];
  ALL_CARDS.forEach(c=>{
    for(let i=0;i<c.count;i++) g.deck.push({...c});
  });
  g.deck = shuffle(g.deck);
  g.burn = g.deck.pop();
  g.extraBurn = [];

  if(room.players.length===2){
    for(let i=0;i<5;i++) g.extraBurn.push(g.deck.pop());
  }

  g.playersData = [];
  room.players.forEach((_,idx)=>{
    g.playersData.push({
      hand:null,
      out:false,
      insane:false,
      discardInsaneCount:0,
      protected: false
    })
  })

  g.playersData.forEach(p=>{
    p.hand = g.deck.pop();
  })

  g.turnIndex = 0;
  g.phase = "play";
}

wss.on('connection', (ws) => {
  let roomId = null;
  let pid = null;

  ws.on('message', (raw) => {
    try{
      const msg = JSON.parse(raw);
      switch(msg.type){
        case "createRoom":{
          const rid = genRoomId();
          rooms[rid] = {
            players:[],
            game:createRoomData()
          };
          roomId = rid;
          pid = 0;
          rooms[rid].players.push({ws,pid});
          rooms[rid].game.playerTokens.push({sane:0,insane:0});
          ws.send(JSON.stringify({type:"roomCreated",roomId:rid,pid:0}));
          break;
        }

        case "joinRoom":{
          const rid = msg.roomId;
          if(!rooms[rid]) return ws.send(JSON.stringify({type:"error",msg:"房间不存在"}));
          const room = rooms[rid];
          if(room.players.length >= MAX_PLAYER) return ws.send(JSON.stringify({type:"error",msg:"房间已满"}));

          pid = room.players.length;
          roomId = rid;
          room.players.push({ws,pid});
          room.game.playerTokens.push({sane:0,insane:0});

          broadcast(room,{type:"playerSync",count:room.players.length,max:MAX_PLAYER});
          ws.send(JSON.stringify({type:"roomJoined",roomId:rid,pid}));
          break;
        }

        case "leaveRoom":{
          if(!roomId || !rooms[roomId]) return;
          const room = rooms[roomId];
          room.players = room.players.filter(x=>x.pid!==pid);
          room.game.playerTokens.splice(pid,1);
          if(room.players.length<=0){
            delete rooms[roomId];
            return;
          }
          broadcast(room,{type:"opponentLeave"});
          break;
        }

        case "startGame":{
          if(!roomId) return;
          const room = rooms[roomId];
          initRound(room);
          broadcast(room,{type:"gameStart",game:room.game});
          break;
        }

        case "gameOperate":{
          const room = rooms[roomId];
          if(!room) return;
          broadcast(room,{type:"remoteOperate",data:msg.data,pid});
          break;
        }
      }
    }catch(e){
      console.error(e);
    }
  })

  ws.on('close',()=>{
    if(!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];
    room.players = room.players.filter(x=>x.pid!==pid);
    room.game.playerTokens.splice(pid,1);
    if(room.players.length<=0) delete rooms[roomId];
    else broadcast(room,{type:"opponentLeave"});
  })
})

const PORT = process.env.PORT || 8080;
server.listen(PORT, ()=>console.log("Server run on port",PORT));
