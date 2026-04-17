export interface StatusGameMeta {
  id: string;
  name: string;
  slug: string;
  gameStatus: string;
  hasData: boolean;
}

export function getStatusScript(workerUrl: string, games: StatusGameMeta[]): string {
  const W = JSON.stringify(workerUrl);
  const G = JSON.stringify(games);

  return `(function(){
'use strict';
var WORKER_URL=${W};
var GAMES=${G};

function el(id){return document.getElementById(id);}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function fmt(n){return n!==null&&n!==undefined?(Math.round(n*10)/10)+'%':'N/A';}
function timeAgo(ts){
  var s=Math.round((Date.now()-ts)/1000);
  if(s<60)return 'just now';
  if(s<3600)return Math.round(s/60)+' min ago';
  return Math.round(s/3600)+' hr ago';
}

var STATUS_LABEL={operational:'Operational',degraded:'Degraded',down:'Down',unknown:'Unknown',preview:'Preview'};
function label(s){return STATUS_LABEL[s]||s;}

function overallStatus(data){
  if(!data||!data.latest)return 'unknown';
  var ss=[data.latest.roblox.status].concat(data.latest.games.map(function(g){return g.status;}));
  if(ss.every(function(s){return s==='operational';}))return 'operational';
  if(ss.some(function(s){return s==='down';}))return 'down';
  return 'degraded';
}

function renderTimeline(ticks){
  if(!ticks||!ticks.length)return '';
  var slice=ticks.slice(-60);
  return '<div class="status-timeline" aria-label="Uptime over last '+slice.length+' checks" role="img">'+
    slice.map(function(v){return '<span class="status-tick'+(v===0?' status-tick-down':'')+'" aria-hidden="true"></span>';}).join('')+
  '</div><p class="status-timeline-legend"><span class="status-tick" aria-hidden="true"></span> Up &nbsp; <span class="status-tick status-tick-down" aria-hidden="true"></span> Down</p>';
}

function renderBanner(data,error){
  var banner=el('status-banner');
  var text=el('status-banner-text');
  var sub=el('status-banner-sub');
  var time=el('status-checked-at');
  if(!banner)return;

  if(error){
    banner.className='status-banner status-banner-unknown';
    if(text)text.textContent='Status unavailable';
    if(sub)sub.textContent='Could not reach the status API. Retrying…';
    if(time)time.textContent='';
    return;
  }
  if(!data||!data.latest){
    banner.className='status-banner status-banner-loading';
    if(text)text.textContent='Checking status…';
    if(sub)sub.textContent='';
    if(time)time.textContent='';
    return;
  }
  var overall=overallStatus(data);
  banner.className='status-banner status-banner-'+overall;
  if(text)text.textContent={operational:'All systems operational',degraded:'Some systems experiencing issues',down:'Major outage detected'}[overall]||'Status unknown';
  if(sub)sub.textContent=data.latest.games.length+' games monitored';
  if(time)time.textContent='Updated '+timeAgo(data.latest.checkedAt);
}

function renderGames(data){
  var container=el('status-games');
  if(!container)return;
  container.innerHTML=GAMES.map(function(meta){
    var apiGame=data&&data.latest?data.latest.games.find(function(g){return g.id===meta.id;}):null;
    var u24=data&&data.uptime?data.uptime['24h'][meta.id]:null;
    var u7d=data&&data.uptime?data.uptime['7d'][meta.id]:null;
    var tl=data&&data.timeline?data.timeline[meta.id]:null;
    var s=meta.hasData&&apiGame?apiGame.status:(meta.hasData?'unknown':'preview');
    var playing=apiGame&&meta.hasData?apiGame.playing:null;
    var uptimeHtml='';
    if(meta.hasData&&(u24!==null||u7d!==null)){
      uptimeHtml='<div class="status-uptime-row">'+
        (u24!==null?'<span class="status-uptime-item"><span class="status-uptime-label">24h</span><span class="status-uptime-val">'+fmt(u24)+'</span></span>':'')+
        (u7d!==null?'<span class="status-uptime-item"><span class="status-uptime-label">7d</span><span class="status-uptime-val">'+fmt(u7d)+'</span></span>':'')+
      '</div>';
    } else if(!meta.hasData){
      uptimeHtml='<p class="status-game-nodata">Live status available after release</p>';
    }
    return '<div class="status-game-card">'+
      '<div class="status-game-header">'+
        '<div class="status-game-info">'+
          '<span class="status-dot status-dot-'+esc(s)+'" aria-hidden="true"></span>'+
          '<a class="status-game-name" href="/'+esc(meta.slug)+'/about">'+esc(meta.name)+'</a>'+
        '</div>'+
        '<span class="status-badge status-badge-'+esc(s)+'" role="status">'+label(s)+'</span>'+
      '</div>'+
      (playing!==null?'<p class="status-game-players">'+playing.toLocaleString()+' playing now</p>':'')+
      (meta.hasData&&tl?renderTimeline(tl):'')+
      uptimeHtml+
    '</div>';
  }).join('');
}

function renderPlatform(data){
  var container=el('status-platform');
  if(!container)return;
  var roblox=data&&data.latest?data.latest.roblox:null;
  var u24=data&&data.uptime?data.uptime['24h']['roblox']:null;
  var u7d=data&&data.uptime?data.uptime['7d']['roblox']:null;
  var tl=data&&data.timeline?data.timeline['roblox']:null;
  var s=roblox?roblox.status:'unknown';
  container.innerHTML=
    '<div class="status-platform-row">'+
      '<div class="status-game-info">'+
        '<span class="status-dot status-dot-'+s+'" aria-hidden="true"></span>'+
        '<span class="status-game-name">Roblox Platform API</span>'+
      '</div>'+
      '<span class="status-badge status-badge-'+s+'" role="status">'+label(s)+'</span>'+
    '</div>'+
    (roblox?'<p class="status-platform-note">Response time: '+roblox.responseMs+'ms</p>':'')+
    (tl?renderTimeline(tl):'')+
    (u24!==null||u7d!==null?(
      '<div class="status-uptime-row">'+
      (u24!==null?'<span class="status-uptime-item"><span class="status-uptime-label">24h</span><span class="status-uptime-val">'+fmt(u24)+'</span></span>':'')+
      (u7d!==null?'<span class="status-uptime-item"><span class="status-uptime-label">7d</span><span class="status-uptime-val">'+fmt(u7d)+'</span></span>':'')+
      '</div>'
    ):'');
}

function renderIncidents(incidents){
  var container=el('status-incidents');
  if(!container)return;
  if(!incidents||!incidents.length){
    container.innerHTML='<p class="status-no-incidents">No recent incidents.</p>';
    return;
  }
  container.innerHTML=incidents.slice(0,10).map(function(inc){
    var date=new Date(inc.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    var updatesHtml='';
    if(inc.updates&&inc.updates.length){
      updatesHtml='<div class="status-incident-updates">'+
        inc.updates.map(function(u){
          var t=new Date(u.time).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
          return '<div class="status-incident-update"><span class="status-incident-update-time">'+esc(t)+'</span><p>'+esc(u.message)+'</p></div>';
        }).join('')+
      '</div>';
    }
    return '<div class="status-incident-card">'+
      '<div class="status-incident-header">'+
        '<span class="status-incident-badge status-incident-badge-'+esc(inc.status)+'">'+esc(inc.status)+'</span>'+
        '<span class="status-incident-date">'+esc(date)+'</span>'+
      '</div>'+
      '<h3 class="status-incident-title">'+esc(inc.title)+'</h3>'+
      updatesHtml+
    '</div>';
  }).join('');
}

var cachedData=null;
var hasError=false;

function updateNavDot(overall){
  var dots=document.querySelectorAll('[data-status-nav-dot]');
  dots.forEach(function(d){
    d.className='status-nav-dot status-nav-dot-'+overall;
  });
}

async function load(){
  try{
    var res=await fetch(WORKER_URL);
    if(!res.ok)throw new Error('HTTP '+res.status);
    cachedData=await res.json();
    hasError=false;
  }catch(e){
    hasError=true;
  }
  var overall=overallStatus(cachedData);
  updateNavDot(hasError?'unknown':overall);
  renderBanner(cachedData,hasError);
  renderGames(cachedData);
  renderPlatform(cachedData);
  renderIncidents(cachedData&&cachedData.incidents?cachedData.incidents:[]);
}

// Initial loading state
renderBanner(null,false);
renderGames(null);
renderPlatform(null);
load();
setInterval(load,60000);
})();`;
}
