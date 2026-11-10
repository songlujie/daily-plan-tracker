const STORAGE_KEY="daily-plan-tracker-v1";
const BACKUP_KEY="daily-plan-tracker-backup-v1";
const DATA_RESET_VERSION="2026-10-31-reset-1";
const SUPABASE_URL="https://neinapcxvyfdgonhldrr.supabase.co";
const SUPABASE_KEY="sb_publishable_3B026YU86aeQIcSW83zeVg_3MIlhe-e";
const SYNC_CODE_KEY="daily-plan-tracker-sync-code-v1";
const UPLOAD_PASSWORD_KEY="daily-plan-tracker-upload-password-v1";
const planGrid=document.querySelector("#planGrid");
const historyList=document.querySelector("#historyList");
const planSummary=document.querySelector("#planSummary");
const planDialog=document.querySelector("#planDialog");
const recordDialog=document.querySelector("#recordDialog");
let filter="all",toastTimer,cloudPushTimer,cloudBusy=false,syncCode=localStorage.getItem(SYNC_CODE_KEY)||"",uploadPassword=localStorage.getItem(UPLOAD_PASSWORD_KEY)||"";
const seedPlans=[
  ["人工智能 2.0","足球",100,"011 负 · 012 胜"],
  ["五彩石","足球",100,"006 让平让负 · 007 双平"],
  ["女皇 · 海尔兄弟","足球",100,"005 让负 · 010 负 · 002 胜 · 006 让负"],
  ["破门 · 喜春收","足球",100,"003 胜 · 005 胜 / 010 负 · 016 胜"],
  ["归云南","足球",100,"006 胜 · 009 让负 · 002 胜 · 005 让负"],
  ["伟哥 2.0","足球",100,"003 胜 · 004 胜"],
  ["巴萨 5黑","足球",100,"005 胜/平 · 006 负"],
  ["自选","足球",100,"003 胜 + 005 让负"],
  ["水花 9黑 · 老张篮球 3.0","篮球",100,"302 让负 -4.5 · 307 小 233.5；304 大 171.5 · 306 让负 +2.5"],
  ["进球组合","进球数",100,"河南总进球 003 · 皇冠进球 008"]
].map((p,i)=>({id:`seed-${i+1}`,name:p[0],sport:p[1],baseStake:p[2],selection:p[3]}));
function readSavedState(){for(const key of[STORAGE_KEY,BACKUP_KEY]){try{const raw=localStorage.getItem(key);if(raw)return JSON.parse(raw)}catch{continue}}return null}
function loadState(){const saved=readSavedState();if(!saved)return{plans:seedPlans,records:[],dataResetVersion:DATA_RESET_VERSION};const migrated=Array.isArray(saved.records)?saved.records:Object.entries(saved.days||{}).flatMap(([date,records])=>(records||[]).map(record=>({...record,recordDate:record.recordDate||date})));migrated.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));const savedPlans=Array.isArray(saved.plans)?saved.plans:seedPlans;const plans=savedPlans.map(plan=>plan.name==="进球组合"&&plan.sport==="足球"?{...plan,sport:"进球数"}:plan);const shouldReset=saved.dataResetVersion!==DATA_RESET_VERSION;return{plans,records:shouldReset?[]:migrated,lastSavedAt:saved.lastSavedAt,dataResetVersion:DATA_RESET_VERSION}}
let state=loadState();
let selectedPlanId=state.plans[0]?.id||null;
function updateSaveStatus(message="数据已自动保存",status="saved"){const el=document.querySelector("#saveStatus");if(!el)return;el.classList.toggle("saving",status==="saving");el.classList.toggle("error",status==="error");el.lastChild.textContent=message}
function persistLocal(){const payload=JSON.stringify(state);localStorage.setItem(STORAGE_KEY,payload);localStorage.setItem(BACKUP_KEY,payload)}
function saveState(){try{updateSaveStatus("正在保存…","saving");state.lastSavedAt=new Date().toISOString();persistLocal();const time=new Date(state.lastSavedAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"});updateSaveStatus(syncCode?`本地已保存 ${time} · 等待云同步`:`本地已保存 ${time}`);scheduleCloudPush()}catch{updateSaveStatus("本地保存失败","error")}}
function setCloudStatus(message,type="idle"){const status=document.querySelector("#cloudStatus"),button=document.querySelector("#cloudSyncBtn");if(status){status.textContent=message;status.dataset.status=type}if(button){button.classList.toggle("connected",!!syncCode&&type!=="error");button.textContent=syncCode?(type==="syncing"?"☁ 同步中…":type==="error"?"☁ 同步异常":"☁ 已连接"):"☁ 云同步"}}
async function cloudRequest(payload){const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/tracker_sync`,{method:"POST",headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});if(!response.ok){const detail=await response.text();throw new Error(detail||`HTTP ${response.status}`)}return response.json()}
function cloudErrorMessage(error){const detail=String(error?.message||error);if(/521|Web server is down/i.test(detail))return"云端项目正在启动，请稍后重试";if(/Failed to fetch|NetworkError|Load failed/i.test(detail))return"无法连接云端，请检查网络或项目状态";if(/PGRST202|tracker_sync|schema cache/i.test(detail))return"云端同步功能尚未初始化";return"云同步失败，请稍后重试"}
async function pushCloud(password=uploadPassword){if(!syncCode||cloudBusy||!navigator.onLine)return false;cloudBusy=true;setCloudStatus("正在验证密码并上传…","syncing");try{await cloudRequest({p_code:syncCode,p_payload:state,p_password:password});const time=new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"});setCloudStatus(`云端已同步 ${time}`,"saved");updateSaveStatus(`本地和云端已保存 ${time}`);return true}catch(error){console.error("Cloud push failed",error);const passwordError=String(error.message).includes("invalid upload password");setCloudStatus(passwordError?"上传密码错误，数据未上传":"云同步失败，请稍后重试","error");updateSaveStatus(passwordError?"本地已保存 · 等待正确上传密码":"本地已保存 · 云端同步失败","error");return false}finally{cloudBusy=false}}
function scheduleCloudPush(){if(!syncCode)return;clearTimeout(cloudPushTimer);cloudPushTimer=setTimeout(pushCloud,650)}
function validCloudState(value){return value&&Array.isArray(value.plans)&&Array.isArray(value.records)}
async function syncFromCloud(forceRemote=false){if(!syncCode||cloudBusy||!navigator.onLine)return;cloudBusy=true;setCloudStatus("正在读取云端数据…","syncing");try{const remote=await cloudRequest({p_code:syncCode});if(!remote?.exists){cloudBusy=false;await pushCloud();showToast("已创建云端数据");return}const remoteState=remote.payload,remoteTime=new Date(remote.updated_at||0).getTime(),localTime=new Date(state.lastSavedAt||0).getTime();if(validCloudState(remoteState)&&(forceRemote||remoteTime>localTime)){state={...remoteState,dataResetVersion:DATA_RESET_VERSION};persistLocal();render();showToast("已下载云端最新数据")}else if(localTime>remoteTime){cloudBusy=false;await pushCloud();return}const time=new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"});setCloudStatus(`云端已同步 ${time}`,"saved");updateSaveStatus(`本地和云端已同步 ${time}`)}catch(error){console.error("Cloud sync failed",error);setCloudStatus(cloudErrorMessage(error),"error");updateSaveStatus("本地已保存 · 云端同步失败","error")}finally{cloudBusy=false}}
function openSyncDialog(){const input=document.querySelector("#syncCodeInput");input.value=syncCode;document.querySelector("#uploadPasswordInput").value=uploadPassword;document.querySelector("#disconnectSync").classList.toggle("hidden",!syncCode);setCloudStatus(syncCode?"已连接，可手动重新同步":"尚未连接云端",syncCode?"saved":"idle");document.querySelector("#syncDialog").showModal()}
const allRecords=()=>state.records||[];
const recordsFor=id=>allRecords().filter(r=>r.planId===id);
const latestContentRecord=id=>[...recordsFor(id)].reverse().find(r=>r.selection?.trim())||null;
const currentSelection=plan=>plan.selection||latestContentRecord(plan.id)?.selection||"";
function missesSinceWin(records){let misses=0;for(let i=records.length-1;i>=0;i--){if(records[i].result==="win")break;misses++}return misses}
function planMetrics(plan){const records=recordsFor(plan.id),misses=missesSinceWin(records),lastRecord=records.at(-1);const stake=misses&&lastRecord?.result==="loss"?(Number(lastRecord.stake)||plan.baseStake)*2:plan.baseStake;return{records,level:misses+1,stake}}
const money=v=>`¥${Number(v).toLocaleString("zh-CN")}`;
function recordProfit(record){
  const hasSavedProfit=record.profit!==null&&record.profit!==undefined&&record.profit!==""&&Number.isFinite(Number(record.profit));
  if(hasSavedProfit)return Number(record.profit);
  const stake=Number(record.stake)||0,odds=Number(record.odds)||2;
  return record.result==="win"?stake*(odds-1):-stake;
}
const signedMoney=v=>`${v>0?"+":v<0?"-":""}¥${Math.abs(Number(v)).toLocaleString("zh-CN",{maximumFractionDigits:2})}`;
const profitClass=v=>v>0?"profit-positive":v<0?"profit-negative":"";
const sportIcon=s=>s==="篮球"?"🏀":s==="进球数"?"🥅":s==="半全场"?"⇅":s==="足球"?"⚽":"📌";
const escapeHtml=(v="")=>String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]);
function renderPlanNameOptions(){const names=[...new Set(state.plans.map(p=>p.name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-CN"));document.querySelector("#planNameOptions").innerHTML=names.map(name=>`<option value="${escapeHtml(name)}"></option>`).join("")}
function render(){renderPlanNameOptions();renderStats();renderSummary();renderPlans();renderHistory()}
function renderPlansLegacy(){
  const plans=state.plans.filter(p=>filter==="all"||p.sport===filter);
  if(!plans.length){planGrid.innerHTML='<div class="empty-state"><b>这个分类还没有方案</b>点击右上角“新增方案”开始记录。</div>';return}
  planGrid.innerHTML=plans.map(plan=>{const {records,level,stake}=planMetrics(plan);const recent=records.slice(-8),net=records.reduce((sum,r)=>sum+recordProfit(r),0),latestSelection=currentSelection(plan);return `<article class="plan-card" data-plan-id="${plan.id}"><div class="plan-top"><div class="plan-title"><div class="sport-icon">${sportIcon(plan.sport)}</div><div><h3>${escapeHtml(plan.name)}</h3><span class="tag">${escapeHtml(plan.sport)} · 独立循环</span></div></div><button class="more-btn" title="方案操作" aria-label="方案操作" data-menu="${plan.id}">···</button><div class="card-menu" data-menu-panel="${plan.id}"><button class="menu-action" data-edit="${plan.id}">✎ 编辑方案</button><button class="menu-action delete" data-delete="${plan.id}">⌫ 删除方案</button></div></div><div class="selection">${escapeHtml(latestSelection||"暂未填写方案")}</div><div class="level-row"><div class="level-cell"><span>基础金额</span><strong>${money(plan.baseStake)}</strong></div><div class="level-cell highlight"><span>当前执行</span><strong>${money(stake)}</strong></div><div class="level-cell"><span>当前档位</span><strong>第 ${level} 档</strong></div><div class="level-cell"><span>累计纯利</span><strong class="${profitClass(net)}">${signedMoney(net)}</strong></div></div><div class="streak-dots">${recent.length?recent.map(r=>`<i class="streak-dot ${r.result}" title="${r.result==="win"?"命中":"未中"}"></i>`).join(""):'<span class="streak-empty">还没有结果</span>'}</div><div class="card-actions"><button class="result-btn win" data-result="win" data-plan="${plan.id}">✓ 命中 · 重置</button><button class="result-btn loss" data-result="loss" data-plan="${plan.id}">× 未中 · 翻倍</button></div></article>`}).join("");
}
function renderStatsLegacy(){
  const records=allRecords(),wins=records.filter(r=>r.result==="win").length,losses=records.length-wins,totalNet=records.reduce((sum,r)=>sum+recordProfit(r),0);
  const highest=state.plans.map(planMetrics).reduce((m,x)=>x.level>m.level?x:m,{level:1,stake:0});
  document.querySelector("#recordCount").textContent=`${records.length} 笔`;document.querySelector("#recordHint").textContent=records.length?`覆盖 ${new Set(records.map(r=>r.planId)).size} 个方案`:"持续在原记录上更新";
  const totalProfit=document.querySelector("#totalProfit");totalProfit.textContent=signedMoney(totalNet);totalProfit.className=profitClass(totalNet);document.querySelector("#totalProfitHint").textContent=`全部 ${records.length} 笔记录`;
  document.querySelector("#winCount").textContent=wins;document.querySelector("#lossCount").textContent=losses;
  document.querySelector("#winRate").textContent=`命中率 ${records.length?Math.round(wins/records.length*100):0}%`;
  document.querySelector("#maxLevel").textContent=`${highest.level}档`;document.querySelector("#maxStake").textContent=highest.stake?`当前 ${money(highest.stake)}`:"基础金额";
}
function renderHistory(){
  const records=[...allRecords()].reverse();if(!records.length){historyList.innerHTML='<div class="empty-history">还没有操作记录</div>';return}
  historyList.innerHTML=records.map(r=>{const plan=state.plans.find(p=>p.id===r.planId),profit=recordProfit(r);return `<div class="history-item"><span class="history-time">${new Date(r.createdAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</span><div class="history-main"><strong>${escapeHtml(plan?.name||"已删除方案")} · 本金 ${money(r.stake)} · 赔率 ${(Number(r.odds)||2).toFixed(2)}</strong><p>${escapeHtml(r.selection||r.note||`第 ${r.level} 档记录`)} · <b class="${profitClass(profit)}">纯利 ${signedMoney(profit)}</b></p></div><span class="outcome-pill ${r.result}">${r.result==="win"?"✓ 命中":"× 未中"}</span></div>`}).join("");
}
function showToast(msg){const t=document.querySelector("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2200)}
function openRecord(id,result){
  const plan=state.plans.find(p=>p.id===id),m=planMetrics(plan),form=document.querySelector("#recordForm");form.reset();form.planId.value=id;form.result.value=result;form.selection.value=currentSelection(plan);form.odds.value="2.00";document.querySelector("#recordTitle").textContent=plan.name;const box=document.querySelector("#recordOutcome");box.className=`record-outcome ${result}`;box.textContent=result==="win"?`✓ 本次本金 ${money(m.stake)}，请填写实际赔率，系统会计算纯利并重置档位。`:`× 本次亏损 ${money(m.stake)}，下一次自动变为 ${money(m.stake*2)}。`;recordDialog.showModal();
}
function closeCardMenus(){document.querySelectorAll(".card-menu.open").forEach(menu=>menu.classList.remove("open"));document.querySelectorAll(".more-btn.active").forEach(button=>button.classList.remove("active"))}
function openPlanDialog(plan=null){const form=document.querySelector("#planForm");form.reset();form.planId.value=plan?.id||"";form.name.value=plan?.name||"";form.sport.value=plan?.sport||"足球";form.baseStake.value=plan?.baseStake||100;form.selection.value=plan?currentSelection(plan):"";document.querySelector("#planDialogTitle").textContent=plan?"编辑当前方案":"新增方案";document.querySelector("#planSubmitText").textContent=plan?"保存修改":"保存方案";planDialog.showModal()}
function openConfirm(action,targetId,title,message){const form=document.querySelector("#confirmForm");form.action.value=action;form.targetId.value=targetId||"";document.querySelector("#confirmTitle").textContent=title;document.querySelector("#confirmMessage").textContent=message;document.querySelector(".danger-btn").textContent=action==="clear-records"?"确认清空":"确认删除";document.querySelector("#confirmDialog").showModal()}
document.querySelector("#addPlanBtn").addEventListener("click",()=>openPlanDialog());
document.querySelector("#cloudSyncBtn").addEventListener("click",openSyncDialog);
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>b.closest("dialog").close()));
document.querySelectorAll(".filter").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".filter").forEach(x=>x.classList.remove("active"));b.classList.add("active");filter=b.dataset.filter;renderPlans()}));
planGrid.addEventListener("click",e=>{e.stopPropagation();const select=e.target.closest("[data-select]");if(select){selectedPlanId=select.dataset.select;renderPlans();return}const result=e.target.closest("[data-result]");if(result){openRecord(result.dataset.plan,result.dataset.result);return}const edit=e.target.closest("[data-edit]");if(edit){const plan=state.plans.find(p=>p.id===edit.dataset.edit);openPlanDialog(plan);return}const del=e.target.closest("[data-delete]");if(del){const plan=state.plans.find(p=>p.id===del.dataset.delete);openConfirm("delete-plan",plan.id,"删除这个方案？",`“${plan.name}”将从方案清单移除，已有历史记录仍会保留。`)}});
document.addEventListener("click",closeCardMenus);
document.querySelector("#planForm").addEventListener("submit",e=>{e.preventDefault();const d=new FormData(e.currentTarget),planId=d.get("planId"),values={name:d.get("name").trim(),sport:d.get("sport"),baseStake:Number(d.get("baseStake")),selection:d.get("selection").trim()};if(planId){const plan=state.plans.find(p=>p.id===planId);Object.assign(plan,values);selectedPlanId=planId}else{const newPlan={id:crypto.randomUUID(),...values};state.plans.push(newPlan);selectedPlanId=newPlan.id;filter="all";document.querySelectorAll(".filter").forEach(x=>x.classList.toggle("active",x.dataset.filter==="all"))}saveState();e.currentTarget.reset();planDialog.close();render();showToast(planId?"当前方案已更新，历史记录未改动":"新方案已加入清单")});
document.querySelector("#recordForm").addEventListener("submit",e=>{e.preventDefault();const d=new FormData(e.currentTarget),plan=state.plans.find(p=>p.id===d.get("planId")),m=planMetrics(plan),stake=Number(d.get("stake")),odds=Number(d.get("odds")),result=d.get("result"),selection=d.get("selection").trim(),profit=result==="win"?stake*(odds-1):-stake,record={id:crypto.randomUUID(),planId:plan.id,result,selection,note:d.get("note").trim(),stake,odds,profit,level:m.level,createdAt:new Date().toISOString()};if(selection)plan.selection=selection;state.records=[...allRecords(),record];saveState();recordDialog.close();render();showToast(result==="win"?`已命中，本次纯利 ${signedMoney(profit)}，下一次重置`:`已记录纯利 ${signedMoney(profit)}，下一次建议 ${money(stake*2)}`)});
document.querySelector("#clearDayBtn").addEventListener("click",()=>{if(!allRecords().length)return showToast("还没有记录");openConfirm("clear-records","","清空全部记录？","所有命中、未中、利润和档位历史都会被清空，此操作无法撤销。")});
document.querySelector("#confirmForm").addEventListener("submit",e=>{e.preventDefault();const d=new FormData(e.currentTarget),action=d.get("action"),targetId=d.get("targetId");if(action==="delete-plan"){state.plans=state.plans.filter(p=>p.id!==targetId);if(selectedPlanId===targetId)selectedPlanId=state.plans[0]?.id||null;showToast("方案已删除，历史记录已保留")}if(action==="clear-records"){state.records=[];showToast("全部记录已清空")}saveState();document.querySelector("#confirmDialog").close();render()});
function renderStats(){
  const records=allRecords(),wins=records.filter(r=>r.result==="win").length,losses=records.length-wins,profits=records.map(recordProfit);
  const totalNet=profits.reduce((sum,v)=>sum+v,0),totalStake=records.reduce((sum,r)=>sum+(Number(r.stake)||0),0),grossProfit=profits.filter(v=>v>0).reduce((sum,v)=>sum+v,0),grossLoss=Math.abs(profits.filter(v=>v<0).reduce((sum,v)=>sum+v,0)),exposure=state.plans.reduce((sum,plan)=>sum+planMetrics(plan).stake,0);
  const highest=state.plans.map(planMetrics).reduce((m,x)=>x.level>m.level?x:m,{level:1,stake:0});
  const doubled=state.plans.filter(plan=>planMetrics(plan).level>1).length;
  document.querySelector("#recordCount").textContent=`${records.length} 笔记录`;document.querySelector("#recordHint").textContent=`${state.plans.length} 个方案`;
  const totalProfit=document.querySelector("#totalProfit");totalProfit.textContent=signedMoney(totalNet);totalProfit.className=profitClass(totalNet);
  document.querySelector("#currentExposureValue").textContent=money(exposure);document.querySelector("#doublingCount").textContent=`${doubled} 个方案正在翻倍`;document.querySelector("#totalStake").textContent=money(totalStake);
  document.querySelector("#grossProfit").textContent=signedMoney(grossProfit);document.querySelector("#winCount").textContent=`${wins}胜`;
  document.querySelector("#grossLoss").textContent=money(grossLoss);document.querySelector("#lossCount").textContent=`${losses}负`;
  document.querySelector("#winRate").textContent=`${records.length?Math.round(wins/records.length*100):0}%`;document.querySelector("#maxLevel").textContent=`最高第 ${highest.level} 档`;
}
function renderSummary(){
  const rows=state.plans.map(plan=>{const {records,level,stake}=planMetrics(plan),wins=records.filter(r=>r.result==="win").length,invested=records.reduce((sum,r)=>sum+(Number(r.stake)||0),0),net=records.reduce((sum,r)=>sum+recordProfit(r),0);return{plan,records,wins,invested,net,level,stake}}).sort((a,b)=>b.net-a.net);
  const doubled=rows.filter(row=>row.level>1).length,best=rows.find(row=>row.records.length);document.querySelector("#summaryHint").textContent=`${doubled} 个方案正在翻倍${best?` · 当前最佳：${best.plan.name}`:""}`;
  planSummary.innerHTML=`<div class="summary-row summary-head"><span>方案</span><span>战绩</span><span>命中率</span><span>累计投入</span><span>累计纯利</span><span>下一步</span></div>${rows.map(({plan,records,wins,invested,net,level,stake})=>`<div class="summary-row"><span class="summary-name"><i>${sportIcon(plan.sport)}</i><b>${escapeHtml(plan.name)}</b><small>${escapeHtml(plan.sport)}</small></span><span>${wins}胜 ${records.length-wins}负</span><span>${records.length?Math.round(wins/records.length*100):0}%</span><span>${money(invested)}</span><span class="summary-profit ${profitClass(net)}">${signedMoney(net)}</span><span class="summary-next"><b>第${level}档</b><small>${money(stake)}</small></span></div>`).join("")}`;
}
function renderPlansOld(){
  const plans=state.plans.filter(p=>filter==="all"||p.sport===filter);
  if(!plans.length){planGrid.innerHTML='<div class="empty-state"><b>这个分类还没有方案</b>点击右上角“新增方案”开始记录。</div>';return}
  planGrid.innerHTML=plans.map(plan=>{const {records,level,stake}=planMetrics(plan),recent=records.slice(-8),net=records.reduce((sum,r)=>sum+recordProfit(r),0),latestSelection=currentSelection(plan),wins=records.filter(r=>r.result==="win").length,lastWin=records.map(r=>r.result).lastIndexOf("win"),cycleLoss=records.slice(lastWin+1).filter(r=>r.result==="loss").reduce((sum,r)=>sum+(Number(r.stake)||0),0);return `<article class="execution-card" data-plan-id="${plan.id}"><div class="execution-main"><div class="execution-name"><div class="sport-icon">${sportIcon(plan.sport)}</div><div><h3>${escapeHtml(plan.name)}</h3><span>${escapeHtml(plan.sport)} · ${wins}胜${records.length-wins}负</span></div></div><div class="execution-content"><span>当前方案内容</span><strong>${escapeHtml(latestSelection||"暂未填写方案内容")}</strong><button class="inline-edit" data-edit="${plan.id}">修改内容</button></div><div class="execution-stake ${level>1?"warning":""}"><span>下一笔 · 第 ${level} 档</span><strong>${money(stake)}</strong><small>${level>1?`已连续未中 ${level-1} 次 · 本轮亏损 ${money(cycleLoss)}`:"命中后保持基础档"}</small></div></div><div class="execution-footer"><div class="execution-stats"><span>累计纯利 <b class="${profitClass(net)}">${signedMoney(net)}</b></span><span>基础金额 <b>${money(plan.baseStake)}</b></span><span class="recent-label">近况</span><div class="streak-dots">${recent.length?recent.map(r=>`<i class="streak-dot ${r.result}"></i>`).join(""):'<span class="streak-empty">暂无</span>'}</div><button class="delete-inline" data-delete="${plan.id}">删除方案</button></div><div class="execution-actions"><button class="result-btn win" data-result="win" data-plan="${plan.id}">✓ 命中</button><button class="result-btn loss" data-result="loss" data-plan="${plan.id}">× 未中</button></div></div></article>`}).join("");
}
function renderPlansCards(){
  const plans=state.plans.filter(p=>filter==="all"||p.sport===filter);
  if(!plans.length){planGrid.innerHTML='<div class="empty-state"><b>这个分类还没有方案</b>点击右上角“新增方案”开始记录。</div>';return}
  planGrid.innerHTML=plans.map(plan=>{const {records,level,stake}=planMetrics(plan),recent=records.slice(-6),net=records.reduce((sum,r)=>sum+recordProfit(r),0),latestSelection=currentSelection(plan),wins=records.filter(r=>r.result==="win").length,lastWin=records.map(r=>r.result).lastIndexOf("win"),cycleLoss=records.slice(lastWin+1).filter(r=>r.result==="loss").reduce((sum,r)=>sum+(Number(r.stake)||0),0);return `<article class="execution-card ${level>1?"is-doubling":""}" data-plan-id="${plan.id}"><div class="card-head"><div class="execution-name"><div class="sport-icon">${sportIcon(plan.sport)}</div><div><h3>${escapeHtml(plan.name)}</h3><span>${escapeHtml(plan.sport)} · ${records.length?`${wins}胜 ${records.length-wins}负`:"还没有记录"}</span></div></div><div class="level-badge ${level>1?"warning":""}">第 ${level} 档</div></div><div class="card-workflow"><div class="workflow-content"><span class="workflow-label"><i>1</i> 本次方案</span><strong>${escapeHtml(latestSelection||"还没填写方案内容")}</strong><button class="inline-edit" data-edit="${plan.id}">编辑方案内容</button></div><div class="workflow-stake"><span class="workflow-label"><i>2</i> 本次金额</span><strong>${money(stake)}</strong><small>${level>1?`连续未中 ${level-1} 次，本轮已亏 ${money(cycleLoss)}`:`基础金额 ${money(plan.baseStake)}`}</small></div></div><div class="workflow-result"><span class="workflow-label"><i>3</i> 记录本次结果</span><div class="execution-actions"><button class="result-btn win" data-result="win" data-plan="${plan.id}"><b>✓</b><span>命中</span><small>计算利润并重置</small></button><button class="result-btn loss" data-result="loss" data-plan="${plan.id}"><b>×</b><span>未中</span><small>记录亏损并翻倍</small></button></div></div><div class="card-meta"><span>总利润 <b class="${profitClass(net)}">${signedMoney(net)}</b></span><span class="recent-label">最近</span><div class="streak-dots">${recent.length?recent.map(r=>`<i class="streak-dot ${r.result}" title="${r.result==="win"?"命中":"未中"}"></i>`).join(""):'<span class="streak-empty">暂无</span>'}</div><button class="delete-inline" data-delete="${plan.id}">删除</button></div></article>`}).join("");
}
function renderPlans(){
  const plans=state.plans.filter(plan=>filter==="all"||plan.sport===filter);
  if(!plans.length){planGrid.innerHTML='<div class="empty-state"><b>这个分类还没有方案</b>点击“新增方案”开始记录。</div>';return}
  if(!plans.some(plan=>plan.id===selectedPlanId))selectedPlanId=plans[0].id;
  const selected=plans.find(plan=>plan.id===selectedPlanId)||plans[0];
  const {records,level,stake}=planMetrics(selected);
  const recent=records.slice(-8),net=records.reduce((sum,record)=>sum+recordProfit(record),0),wins=records.filter(record=>record.result==="win").length;
  const lastWin=records.map(record=>record.result).lastIndexOf("win");
  const cycleLoss=records.slice(lastWin+1).filter(record=>record.result==="loss").reduce((sum,record)=>sum+(Number(record.stake)||0),0);
  const latestSelection=currentSelection(selected);
  const picker=plans.map(plan=>{const metrics=planMetrics(plan);return `<button class="plan-choice ${plan.id===selected.id?"active":""} ${metrics.level>1?"warning":""}" type="button" data-select="${plan.id}"><span class="plan-choice-name">${sportIcon(plan.sport)} ${escapeHtml(plan.name)}</span><span class="plan-choice-meta"><span>${money(metrics.stake)}</span><b>第${metrics.level}档</b></span></button>`}).join("");
  planGrid.innerHTML=`<div class="plan-picker">${picker}</div>
    <article class="active-plan">
      <header class="active-plan-head">
        <div class="active-plan-title"><div class="sport-icon">${sportIcon(selected.sport)}</div><div><h3>${escapeHtml(selected.name)}</h3><p>${escapeHtml(selected.sport)} · ${records.length?`${wins}胜 ${records.length-wins}负`:"还没有记录"}</p></div></div>
        <div class="head-actions"><span class="level-badge ${level>1?"warning":""}">第 ${level} 档</span><button class="more-btn" type="button" title="编辑方案" aria-label="编辑方案" data-edit="${selected.id}">✎</button></div>
      </header>
      <div class="active-plan-body">
        <section class="selection-panel"><span class="panel-label">本次方案内容</span><p class="selection-text">${escapeHtml(latestSelection||"还没填写方案内容")}</p><button class="inline-edit" type="button" data-edit="${selected.id}">编辑内容</button></section>
        <section class="stake-panel ${level>1?"warning":""}"><span class="panel-label">本次金额</span><strong>${money(stake)}</strong><p>${level>1?`连续未中 ${level-1} 次，本轮已亏 ${money(cycleLoss)}`:`基础金额 ${money(selected.baseStake)}，命中后继续第 1 档`}</p></section>
      </div>
      <section class="result-panel"><button class="result-btn win" type="button" data-result="win" data-plan="${selected.id}">✓ 命中<small>计算利润，重置第 1 档</small></button><button class="result-btn loss" type="button" data-result="loss" data-plan="${selected.id}">× 未中<small>记录亏损，下一次翻倍</small></button></section>
      <footer class="active-plan-meta"><span>总利润 <b class="${profitClass(net)}">${signedMoney(net)}</b></span><span>基础金额 <b>${money(selected.baseStake)}</b></span><span class="recent-label">最近</span><div class="streak-dots">${recent.length?recent.map(record=>`<i class="streak-dot ${record.result}" title="${record.result==="win"?"命中":"未中"}"></i>`).join(""):'<span class="streak-empty">暂无</span>'}</div><button class="delete-inline" type="button" data-delete="${selected.id}">删除方案</button></footer>
    </article>`;
}
function updateProfitPreview(){const form=document.querySelector("#recordForm"),plan=state.plans.find(p=>p.id===form.planId.value);if(!plan)return;const result=form.result.value,stake=Number(form.stake.value)||0,odds=Number(form.odds.value)||2,profit=result==="win"?stake*(odds-1):-stake;document.querySelector("#profitPreview").value=signedMoney(profit);document.querySelector("#recordNextHint").textContent=result==="win"?`确认后下一笔 ${money(plan.baseStake)}`:`按本次金额计算，下一笔建议 ${money(stake*2)}`}
function openRecord(id,result){const plan=state.plans.find(p=>p.id===id),m=planMetrics(plan),form=document.querySelector("#recordForm");form.reset();form.planId.value=id;form.result.value=result;form.selection.value=currentSelection(plan);form.stake.value=m.stake;form.odds.value="2.00";document.querySelector("#recordTitle").textContent=result==="win"?`确认命中 · ${plan.name}`:`确认未中 · ${plan.name}`;const box=document.querySelector("#recordOutcome");box.className=`record-outcome ${result}`;box.textContent=result==="win"?"可修改本次金额和实际赔率，确认后重置到第 1 档。":"可修改本次金额，确认后记录亏损并进入下一档。";document.querySelector("#oddsFields").classList.toggle("hidden",result!=="win");document.querySelector("#recordSubmit").textContent=result==="win"?"确认命中":"确认未中";updateProfitPreview();recordDialog.showModal()}
document.querySelector("#oddsInput").addEventListener("input",updateProfitPreview);
document.querySelectorAll(".workspace-tab").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll(".workspace-tab").forEach(x=>x.classList.toggle("active",x===button));document.querySelectorAll(".view-panel").forEach(panel=>panel.classList.toggle("active",panel.dataset.panel===button.dataset.view))}));
render();persistLocal();
document.querySelector("#recordStake").addEventListener("input",updateProfitPreview);
document.querySelector("#generateSyncCode").addEventListener("click",()=>{document.querySelector("#syncCodeInput").value=crypto.randomUUID();showToast("已生成同步码，请保存好")});
document.querySelector("#copySyncCode").addEventListener("click",async()=>{const code=document.querySelector("#syncCodeInput").value.trim();if(!code)return showToast("请先生成或填写同步码");try{await navigator.clipboard.writeText(code);showToast("同步码已复制")}catch{showToast("复制失败，请手动复制")}});
document.querySelector("#uploadLocalSync").addEventListener("click",async()=>{const code=document.querySelector("#syncCodeInput").value.trim(),password=document.querySelector("#uploadPasswordInput").value.trim();if(code.length<20)return showToast("请先填写完整同步码");if(!password)return showToast("请输入上传密码");syncCode=code;localStorage.setItem(SYNC_CODE_KEY,syncCode);document.querySelector("#disconnectSync").classList.remove("hidden");const success=await pushCloud(password);if(success){uploadPassword=password;localStorage.setItem(UPLOAD_PASSWORD_KEY,uploadPassword);showToast("密码正确，本机数据已上传")}});
document.querySelector("#disconnectSync").addEventListener("click",()=>{syncCode="";localStorage.removeItem(SYNC_CODE_KEY);setCloudStatus("已断开，当前仍会保存在本机","idle");document.querySelector("#disconnectSync").classList.add("hidden");showToast("已断开云同步")});
document.querySelector("#syncForm").addEventListener("submit",async e=>{e.preventDefault();const code=document.querySelector("#syncCodeInput").value.trim();if(code.length<20)return showToast("同步码太短，请点击生成");syncCode=code;localStorage.setItem(SYNC_CODE_KEY,syncCode);document.querySelector("#disconnectSync").classList.remove("hidden");await syncFromCloud(true)});
window.addEventListener("online",()=>syncFromCloud());
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")syncFromCloud()});
setInterval(()=>syncFromCloud(),30000);
setCloudStatus(syncCode?"准备同步…":"尚未连接云端",syncCode?"syncing":"idle");if(syncCode)syncFromCloud();
