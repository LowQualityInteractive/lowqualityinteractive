export interface StatusGameMeta {
  id: string;
  name: string;
  slug: string;
  gameStatus: string;
  hasData: boolean;
}

export interface StatusMessages {
  platformLabel: string;
  platformNote: string;
  gamesMonitored: string;
  playingNow: string;
  noDataYet: string;
  checking: string;
  unavailable: string;
  unavailableSub: string;
  allOperational: string;
  someIssues: string;
  majorOutage: string;
  unknown: string;
  updatedAgo: string;
  justNow: string;
  minAgo: string;
  hrAgo: string;
  statusLabels: { operational: string; degraded: string; down: string; unknown: string; preview: string };
  timeline: { ariaLabel: string; up: string; down: string };
  incidentStatus: { investigating: string; monitoring: string; resolved: string };
  incidentTemplates: {
    titleDegraded: string;
    titleOutage: string;
    detectedDegraded: string;
    detectedOutage: string;
    recovered: string;
    ongoing: string;
    trackedUnderRoblox: string;
  };
  noIncidents: string;
}

export function getStatusScript(workerUrl: string, games: StatusGameMeta[], msgs: StatusMessages): string {
  const W = JSON.stringify(workerUrl);
  const G = JSON.stringify(games);
  const M = JSON.stringify(msgs);

  return `(function(){
'use strict';
var WORKER_URL=${W};
var GAMES=${G};
var MSGS=${M};

function el(id){return document.getElementById(id);}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function fmt(n){return n!==null&&n!==undefined?(Math.round(n*10)/10)+'%':'N/A';}
function interp(tpl,vals){return String(tpl).replace(/\\{(\\w+)\\}/g,function(_,k){return vals[k]!==undefined?String(vals[k]):''});}
function timeAgo(ts){
  var s=Math.round((Date.now()-ts)/1000);
  if(s<60)return MSGS.justNow;
  if(s<3600)return interp(MSGS.minAgo,{n:Math.round(s/60)});
  return interp(MSGS.hrAgo,{n:Math.round(s/3600)});
}

var STATUS_LABEL=MSGS.statusLabels;
function label(s){return STATUS_LABEL[s]||s;}

function overallStatus(data){
  if(!data||!data.latest)return 'unknown';
  var ss=[data.latest.roblox.status].concat(data.latest.games.map(function(g){return g.status;}));
  if(ss.every(function(s){return s==='operational';}))return 'operational';
  if(ss.some(function(s){return s==='down';}))return 'down';
  return 'degraded';
}

function renderTimeline(ticks,checkedAt){
  if(!ticks||!ticks.length)return '';
  var slice=ticks.slice(-60);
  var base=checkedAt||Date.now();
  var total=slice.length;
  return '<div class="status-timeline" aria-label="'+esc(interp(MSGS.timeline.ariaLabel,{n:total}))+'" role="img">'+
    slice.map(function(v,i){
      var ago=Math.round((total-1-i)*60);
      var ts=base-(ago*1000);
      return '<span class="status-tick'+(v===0?' status-tick-down':'')+'" aria-hidden="true" data-tick-up="'+(v!==0?'1':'0')+'" data-tick-ts="'+ts+'"></span>';
    }).join('')+
  '</div><p class="status-timeline-legend"><span class="status-tick" aria-hidden="true"></span> '+esc(MSGS.timeline.up)+' &nbsp; <span class="status-tick status-tick-down" aria-hidden="true"></span> '+esc(MSGS.timeline.down)+'</p>';
}

var _tooltip=null;
function getTooltip(){
  if(!_tooltip){
    _tooltip=document.createElement('div');
    _tooltip.className='status-tick-tooltip';
    document.body.appendChild(_tooltip);
  }
  return _tooltip;
}
function setupTickTooltips(){
  document.addEventListener('mouseover',function(e){
    var tick=e.target&&e.target.closest&&e.target.closest('.status-tick[data-tick-ts]');
    if(!tick)return;
    var up=tick.getAttribute('data-tick-up')==='1';
    var ts=parseInt(tick.getAttribute('data-tick-ts'),10);
    var d=new Date(ts);
    var timeStr=d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    var dateStr=d.toLocaleDateString([],{month:'short',day:'numeric'});
    var t=getTooltip();
    t.innerHTML='<div class="status-tick-tooltip-status '+(up?'status-tick-tooltip-status-up':'status-tick-tooltip-status-down')+'">'+esc(up?MSGS.timeline.up:MSGS.timeline.down)+'</div>'+
      '<div class="status-tick-tooltip-time">'+dateStr+', '+timeStr+'</div>';
    t.classList.add('visible');
  });
  document.addEventListener('mousemove',function(e){
    if(!_tooltip||!_tooltip.classList.contains('visible'))return;
    _tooltip.style.left=(e.clientX+12)+'px';
    _tooltip.style.top=(e.clientY-36)+'px';
  });
  document.addEventListener('mouseout',function(e){
    var tick=e.target&&e.target.closest&&e.target.closest('.status-tick[data-tick-ts]');
    if(!tick)return;
    if(_tooltip)_tooltip.classList.remove('visible');
  });
}

function renderBanner(data,error){
  var banner=el('status-banner');
  var text=el('status-banner-text');
  var sub=el('status-banner-sub');
  var time=el('status-checked-at');
  if(!banner)return;

  if(error){
    banner.className='status-banner status-banner-unknown';
    if(text)text.textContent=MSGS.unavailable;
    if(sub)sub.textContent=MSGS.unavailableSub;
    if(time)time.textContent='';
    return;
  }
  if(!data||!data.latest){
    banner.className='status-banner status-banner-loading';
    if(text)text.textContent=MSGS.checking;
    if(sub)sub.textContent='';
    if(time)time.textContent='';
    return;
  }
  var overall=overallStatus(data);
  banner.className='status-banner status-banner-'+overall;
  var overallText={operational:MSGS.allOperational,degraded:MSGS.someIssues,down:MSGS.majorOutage}[overall]||MSGS.unknown;
  if(text)text.textContent=overallText;
  if(sub)sub.textContent=interp(MSGS.gamesMonitored,{n:data.latest.games.length});
  if(time)time.textContent=interp(MSGS.updatedAgo,{ago:timeAgo(data.latest.checkedAt)});
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
      uptimeHtml='<p class="status-game-nodata">'+esc(MSGS.noDataYet)+'</p>';
    }
    var checkedAt=data&&data.latest?data.latest.checkedAt:null;
    return '<div class="status-game-card">'+
      '<div class="status-game-header">'+
        '<div class="status-game-info">'+
          '<span class="status-dot status-dot-'+esc(s)+'" aria-hidden="true"></span>'+
          '<a class="status-game-name" href="/'+esc(meta.slug)+'/about">'+esc(meta.name)+'</a>'+
        '</div>'+
        '<span class="status-badge status-badge-'+esc(s)+'" role="status">'+label(s)+'</span>'+
      '</div>'+
      (playing!==null?'<p class="status-game-players">'+esc(interp(MSGS.playingNow,{n:playing.toLocaleString()}))+'</p>':'')+
      (meta.hasData&&tl?renderTimeline(tl,checkedAt):'')+
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
        '<span class="status-game-name">'+esc(MSGS.platformLabel)+'</span>'+
      '</div>'+
      '<span class="status-badge status-badge-'+s+'" role="status">'+label(s)+'</span>'+
    '</div>'+
    (roblox?'<p class="status-platform-note">'+esc(interp(MSGS.platformNote,{ms:roblox.responseMs}))+'</p>':'')+
    (tl?renderTimeline(tl,data&&data.latest?data.latest.checkedAt:null):'')+
    (u24!==null||u7d!==null?(
      '<div class="status-uptime-row">'+
      (u24!==null?'<span class="status-uptime-item"><span class="status-uptime-label">24h</span><span class="status-uptime-val">'+fmt(u24)+'</span></span>':'')+
      (u7d!==null?'<span class="status-uptime-item"><span class="status-uptime-label">7d</span><span class="status-uptime-val">'+fmt(u7d)+'</span></span>':'')+
      '</div>'
    ):'');
}

var SEVEN_DAYS=7*24*60*60*1000;

function migrateText(s){
  return String(s)
    .replace(/\\bRoblox Platform\\b/g,'Roblox')
    .replace(/ — /g,': ')
    .replace(/\\. Monitoring the situation\\./g,'.')
    .replace(/normal operation\\./g,'normal operations.');
}

// Pattern-match the worker's English output and swap in localized templates.
// Returns the localized string, or the original if no pattern matches.
function localizeIncidentText(s){
  var T=MSGS.incidentTemplates;
  if(!T)return s;
  var str=String(s);
  // Titles: "{service}: outage" / "{service}: degraded performance"
  var m=str.match(/^(.+): outage$/);
  if(m)return interp(T.titleOutage,{service:m[1]});
  m=str.match(/^(.+): degraded performance$/);
  if(m)return interp(T.titleDegraded,{service:m[1]});
  // Update messages
  m=str.match(/^Detected outage for (.+)\\.$/);
  if(m)return interp(T.detectedOutage,{service:m[1]});
  m=str.match(/^Detected degraded performance for (.+)\\.$/);
  if(m)return interp(T.detectedDegraded,{service:m[1]});
  m=str.match(/^(.+) has returned to normal operations?\\.$/);
  if(m)return interp(T.recovered,{service:m[1]});
  m=str.match(/^Issue with (.+) is ongoing\\. Continuing to monitor\\.$/);
  if(m)return interp(T.ongoing,{service:m[1]});
  m=str.match(/^(.+): issue tracked under Roblox platform incident\\.$/);
  if(m)return interp(T.trackedUnderRoblox,{service:m[1]});
  return str;
}

var GAME_LABEL_BY_ID={};
for(var _i=0;_i<GAMES.length;_i++){GAME_LABEL_BY_ID[GAMES[_i].id]=GAMES[_i].name;}

function isRobloxIncident(inc){
  if(inc.affectedServices&&inc.affectedServices.indexOf('roblox')!==-1)return true;
  return /^Roblox\\b/i.test(inc.title||'');
}
function isGameIncident(inc){
  if(inc.affectedServices&&inc.affectedServices.length){
    for(var k in GAME_LABEL_BY_ID){if(inc.affectedServices.indexOf(k)!==-1)return k;}
  }
  var title=String(inc.title||'');
  for(var id in GAME_LABEL_BY_ID){
    var name=GAME_LABEL_BY_ID[id];
    if(title.toLowerCase().indexOf(name.toLowerCase())===0)return id;
  }
  return null;
}

// Group legacy data: any game incident opened within 5 minutes of a Roblox incident
// should be folded in as a sub-service of that Roblox incident.
function groupIncidents(incidents){
  var FIVE_MIN=5*60*1000;
  var out=[];
  var roblox=[];
  incidents.forEach(function(inc){
    if(isRobloxIncident(inc)){
      inc=Object.assign({},inc,{affectedServices:(inc.affectedServices||['roblox']).slice()});
      if(inc.affectedServices.indexOf('roblox')===-1)inc.affectedServices.unshift('roblox');
      roblox.push(inc);
      out.push(inc);
    }
  });
  incidents.forEach(function(inc){
    if(isRobloxIncident(inc))return;
    var gid=isGameIncident(inc);
    if(gid){
      var incTime=new Date(inc.date).getTime();
      var host=null;
      for(var j=0;j<roblox.length;j++){
        var dt=Math.abs(new Date(roblox[j].date).getTime()-incTime);
        if(dt<=FIVE_MIN){host=roblox[j];break;}
      }
      if(host){
        if(host.affectedServices.indexOf(gid)===-1)host.affectedServices.push(gid);
        return;
      }
    }
    out.push(inc);
  });
  return out;
}

function renderIncidents(incidents){
  var container=el('status-incidents');
  if(!container)return;
  var cutoff=Date.now()-SEVEN_DAYS;
  var recent=incidents?incidents.filter(function(inc){return new Date(inc.date).getTime()>=cutoff;}):[];
  recent=recent.map(function(inc){
    return Object.assign({},inc,{
      title:localizeIncidentText(migrateText(inc.title)),
      updates:(inc.updates||[]).map(function(u){
        return Object.assign({},u,{message:localizeIncidentText(migrateText(u.message))});
      }),
    });
  });
  recent=groupIncidents(recent);
  if(!recent.length){
    container.innerHTML='<p class="status-no-incidents" data-translatable>'+esc(MSGS.noIncidents)+'</p>';
    return;
  }
  container.innerHTML=recent.slice(0,20).map(function(inc){
    var date=new Date(inc.date).toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'});
    var statusLabel=MSGS.incidentStatus[inc.status]||inc.status;
    var subservices=(inc.affectedServices||[]).filter(function(s){return s!=='roblox'&&GAME_LABEL_BY_ID[s];});
    var affectedHtml='';
    if(subservices.length){
      var subDotClass=inc.status==='resolved'?'status-dot-operational':(inc.status==='investigating'?'status-dot-down':'status-dot-degraded');
      affectedHtml='<ul class="status-incident-affected">'+
        subservices.map(function(sid){
          return '<li><span class="status-dot '+subDotClass+'" aria-hidden="true"></span><span>'+esc(GAME_LABEL_BY_ID[sid])+'</span></li>';
        }).join('')+
      '</ul>';
    }
    var updatesHtml='';
    if(inc.updates&&inc.updates.length){
      updatesHtml='<div class="status-incident-updates">'+
        inc.updates.map(function(u){
          var t=new Date(u.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
          return '<div class="status-incident-update"><span class="status-incident-update-time">'+esc(t)+'</span><p data-translatable>'+esc(u.message)+'</p></div>';
        }).join('')+
      '</div>';
    }
    return '<div class="status-incident-card">'+
      '<div class="status-incident-header">'+
        '<span class="status-incident-badge status-incident-badge-'+esc(inc.status)+'">'+esc(statusLabel)+'</span>'+
        '<span class="status-incident-date">'+esc(date)+'</span>'+
      '</div>'+
      '<h3 class="status-incident-title" data-translatable>'+esc(inc.title)+'</h3>'+
      affectedHtml+
      updatesHtml+
    '</div>';
  }).join('');
}

var cachedData=null;
var hasError=!WORKER_URL;

function updateNavDot(overall){
  var dots=document.querySelectorAll('[data-status-nav-dot]');
  dots.forEach(function(d){
    d.className='status-nav-dot status-nav-dot-'+overall;
  });
}

async function load(){
  if(!WORKER_URL){
    renderBanner(null,true);
    renderGames(null);
    renderPlatform(null);
    renderIncidents([]);
    return;
  }
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
  if(window.__lqiTranslate&&window.__lqiTranslate.translateScope){
    var incRoot=el('status-incidents');
    if(incRoot)window.__lqiTranslate.translateScope(incRoot);
  }
}

// Initial loading state
renderBanner(null,false);
renderGames(null);
renderPlatform(null);
setupTickTooltips();
if(WORKER_URL){load();setInterval(load,60000);}
else{renderBanner(null,true);renderGames(null);renderPlatform(null);renderIncidents([]);}
})();`;
}
