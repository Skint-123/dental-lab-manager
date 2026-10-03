const $=id=>document.getElementById(id);
const money=n=>Number(n||0).toLocaleString("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2});
const sum=n=>Number(n||0).toLocaleString("ru-RU",{maximumFractionDigits:0});
const today=()=>new Date().toISOString().slice(0,10);
let cfg=JSON.parse(localStorage.getItem("dlm_config")||"{}");
let state=JSON.parse(localStorage.getItem("dlm_state")||JSON.stringify({
  settings:{rate:12000,labName:"Моя зуботехническая лаборатория"},
  prices:[],clients:[],orders:[]
}));
let sb=null,currentUser=null,editingOrderItems=[];

function saveLocal(){localStorage.setItem("dlm_state",JSON.stringify(state));}
function toast(s){$("toast").textContent=s;$("toast").style.display="block";setTimeout(()=>$("toast").style.display="none",2500)}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function uid(){return crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random()}

function render(){
  $("defaultRate").value=state.settings.rate;
  $("labName").value=state.settings.labName;
  $("orderRate").value=state.settings.rate;
  renderPrices();renderClients();renderOrders();renderDashboard();
}
function showApp(){
  $("setupView").classList.add("hidden");
  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("logoutBtn").classList.toggle("hidden",!sb);
  render();
}
function showAuth(){
  $("setupView").classList.add("hidden");$("authView").classList.remove("hidden");$("appView").classList.add("hidden");
}
function init(){
  $("orderDate").value=today();
  if(cfg.url&&cfg.key){connectSupabase();} else showApp();
}
async function connectSupabase(){
  try{
    sb=window.supabase.createClient(cfg.url,cfg.key);
    const {data}=await sb.auth.getSession(); currentUser=data.session?.user||null;
    if(currentUser){await loadCloud();showApp();startRealtime()}
    else showAuth();
    $("syncStatus").textContent=currentUser?"☁️ Синхронизация включена":"☁️ Облако подключено";
  }catch(e){console.error(e);toast("Не удалось подключить облако");showApp()}
}
async function signIn(){
  if(!sb)return;
  const {error}=await sb.auth.signInWithPassword({email:$("email").value,password:$("password").value});
  if(error) return toast(error.message);
  const {data}=await sb.auth.getSession();currentUser=data.session.user;await loadCloud();showApp();startRealtime();
}
async function signUp(){
  if(!sb)return;
  const {error}=await sb.auth.signUp({email:$("email").value,password:$("password").value});
  if(error)toast(error.message);else toast("Аккаунт создан. Проверь почту, если подтверждение включено.");
}
async function loadCloud(){
  if(!sb||!currentUser)return;
  const [p,c,o,s]=await Promise.all([
    sb.from("prices").select("*").order("name"),
    sb.from("clients").select("*").order("name"),
    sb.from("orders").select("*").order("created_at",{ascending:false}),
    sb.from("settings").select("*").maybeSingle()
  ]);
  if(!p.error)state.prices=p.data||[];
  if(!c.error)state.clients=c.data||[];
  if(!o.error)state.orders=(o.data||[]).map(x=>({...x,items:x.items||[]}));
  if(s.data)state.settings={rate:s.data.rate||12000,labName:s.data.lab_name||"Моя лаборатория"};
  saveLocal();
}
function startRealtime(){
  if(!sb)return;
  sb.channel("dlm-sync").on("postgres_changes",{event:"*",schema:"public"},async()=>{await loadCloud();render()}).subscribe();
}
async function cloudInsert(table,row){
  if(!sb||!currentUser)return;
  const r={...row,user_id:currentUser.id};delete r.id;
  const {error}=await sb.from(table).insert(r);if(error)throw error;
}
async function cloudUpsert(table,row){
  if(!sb||!currentUser)return;
  const r={...row,user_id:currentUser.id};const {error}=await sb.from(table).upsert(r);if(error)throw error;
}
async function savePrice(){
  const name=prompt("Название работы:");if(!name)return;
  const price=Number(prompt("Цена в USD:","0"));if(!Number.isFinite(price))return;
  const item={id:uid(),name,price};
  state.prices.push(item);saveLocal();
  if(sb&&currentUser)await cloudInsert("prices",item).catch(e=>toast(e.message));
  renderPrices();
}
function renderPrices(){
  $("pricesTable").innerHTML=`<div class="tableWrap"><table class="dataTable"><tr><th>Работа</th><th>USD</th><th></th></tr>`+
    state.prices.map(p=>`<tr><td>${escapeHtml(p.name)}</td><td>$${money(p.price)}</td><td><button onclick="deletePrice('${p.id}')">Удалить</button></td></tr>`).join("")+
    `</table></div>`;
}
async function deletePrice(id){
  state.prices=state.prices.filter(x=>x.id!==id);saveLocal();
  if(sb&&currentUser)await sb.from("prices").delete().eq("id",id);
  renderPrices();
}
async function saveClient(){
  const name=prompt("Имя врача/клиента:");if(!name)return;
  const phone=prompt("Телефон (необязательно):","")||"";
  const c={id:uid(),name,phone};state.clients.push(c);saveLocal();
  if(sb&&currentUser)await cloudInsert("clients",c).catch(e=>toast(e.message));
  renderClients();
}
function renderClients(){
  $("clientsTable").innerHTML=`<div class="tableWrap"><table class="dataTable"><tr><th>Имя</th><th>Телефон</th></tr>`+
    state.clients.map(c=>`<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.phone||"")}</td></tr>`).join("")+
    `</table></div>`;
}
function addItemRow(item={name:"",qty:1,price:0}){
  editingOrderItems.push({...item,id:uid()});renderOrderItems();
}
function renderOrderItems(){
  const box=$("orderItems");
  box.innerHTML=editingOrderItems.map((it,i)=>`
    <div class="itemrow">
      <select class="itemName" data-i="${i}"><option value="">Выбери работу</option>${state.prices.map(p=>`<option value="${escapeHtml(p.name)}" ${p.name===it.name?"selected":""}>${escapeHtml(p.name)} — $${money(p.price)}</option>`).join("")}</select>
      <input class="itemQty" data-i="${i}" type="number" min="0" step="1" value="${it.qty}">
      <input class="itemPrice" data-i="${i}" type="number" step="0.01" value="${it.price}">
      <button onclick="removeItem(${i})">×</button>
    </div>`).join("");
  box.querySelectorAll(".itemName").forEach(el=>el.onchange=()=>{let i=+el.dataset.i,p=state.prices.find(x=>x.name===el.value);editingOrderItems[i].name=el.value;editingOrderItems[i].price=p?.price||0;renderOrderItems();recalc()});
  box.querySelectorAll(".itemQty,.itemPrice").forEach(el=>el.oninput=()=>{let i=+el.dataset.i;editingOrderItems[i][el.classList.contains("itemQty")?"qty":"price"]=Number(el.value);recalc()});
  recalc();
}
function removeItem(i){editingOrderItems.splice(i,1);renderOrderItems()}
function recalc(){
  const usd=editingOrderItems.reduce((a,x)=>a+(Number(x.qty)||0)*(Number(x.price)||0),0);
  const rate=Number($("orderRate").value)||state.settings.rate;
  $("orderTotalUsd").textContent="$"+money(usd);$("orderTotalUzs").textContent=sum(usd*rate)+" сум";
  return {usd,uzs:usd*rate,rate};
}
function normalize(s){return s.toLowerCase().replace(/ё/g,"е").replace(/цирконом/g,"циркон").replace(/коронками/g,"коронка")}
function parseSmart(){
  const text=normalize($("smartInput").value);
  editingOrderItems=[];
  state.prices.forEach(p=>{
    const n=normalize(p.name);
    const escaped=n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const re=new RegExp("(\\d+(?:[.,]\\d+)?)\\s*(?:шт\\.?|ед\\.?|x|х)?\\s*"+escaped,"i");
    const re2=new RegExp(escaped+"\\s*(?:x|х|[-:]?)\\s*(\\d+(?:[.,]\\d+)?)","i");
    let m=text.match(re)||text.match(re2);
    if(m){const q=Number((m[1]||m[2]).replace(",","."));editingOrderItems.push({id:uid(),name:p.name,qty:q,price:Number(p.price)})}
  });
  renderOrderItems();
  if(!editingOrderItems.length)toast("Не нашёл позиции. Добавь их в прайс и попробуй: «5 лсп металл, 3 циркона».");
}
function orderMessage(order){
  const lines=order.items.map(x=>`${x.name} — ${x.qty} × $${money(x.price)} = $${money(x.qty*x.price)}`);
  return `🦷 ${state.settings.labName}\\nЗаказ: ${order.client||"—"}\\n\\n${lines.join("\\n")}\\n\\n💵 Итого: $${money(order.total_usd)}\\n🇺🇿 Итого: ${sum(order.total_uzs)} сум\\nКурс: ${order.rate} сум/$`;
}
async function saveOrder(){
  if(!editingOrderItems.length)return toast("Добавь хотя бы одну работу");
  const t=recalc();
  const order={id:uid(),client:$("orderClient").value,date:$("orderDate").value,items:editingOrderItems.map(({id,...x})=>x),total_usd:t.usd,total_uzs:t.uzs,rate:t.rate,status:"Не оплачено",created_at:new Date().toISOString()};
  state.orders.unshift(order);saveLocal();
  if(sb&&currentUser)await cloudInsert("orders",order).catch(e=>toast(e.message));
  toast("Заказ сохранён");render();newOrder();
}
function newOrder(){editingOrderItems=[];$("smartInput").value="";$("orderClient").value="";$("orderDate").value=today();renderOrderItems()}
function renderOrders(){
  const q=($("orderSearch")?.value||"").toLowerCase();
  const arr=state.orders.filter(o=>JSON.stringify(o).toLowerCase().includes(q));
  $("ordersTable").innerHTML=`<div class="tableWrap"><table class="dataTable"><tr><th>Дата</th><th>Клиент</th><th>Сумма</th><th>Статус</th><th></th></tr>`+
    arr.map(o=>`<tr><td>${escapeHtml(o.date)}</td><td>${escapeHtml(o.client||"—")}</td><td>$${money(o.total_usd)}<br>${sum(o.total_uzs)} сум</td><td class="${o.status==="Оплачено"?"statusPaid":"statusDebt"}">${o.status}</td><td><button onclick="togglePaid('${o.id}')">${o.status==="Оплачено"?"Вернуть долг":"Оплачено"}</button> <button onclick="copyOrder('${o.id}')">📋</button></td></tr>`).join("")+
    `</table></div>`;
}
async function togglePaid(id){
  const o=state.orders.find(x=>x.id===id);if(!o)return;o.status=o.status==="Оплачено"?"Не оплачено":"Оплачено";saveLocal();
  if(sb&&currentUser)await sb.from("orders").update({status:o.status}).eq("id",id);
  render();
}
async function copyOrder(id){const o=state.orders.find(x=>x.id===id);if(!o)return;navigator.clipboard?.writeText(orderMessage(o));toast("Сообщение скопировано")}
function renderDashboard(){
  const usd=state.orders.reduce((a,o)=>a+Number(o.total_usd||0),0),uzs=state.orders.reduce((a,o)=>a+Number(o.total_uzs||0),0);
  const debt=state.orders.filter(o=>o.status!=="Оплачено").reduce((a,o)=>a+Number(o.total_uzs||0),0);
  $("statOrders").textContent=state.orders.length;$("statUsd").textContent="$"+money(usd);$("statUzs").textContent=sum(uzs)+" сум";$("statDebt").textContent=sum(debt)+" сум";
  $("recentOrders").innerHTML=state.orders.slice(0,8).map(o=>`<div class="sectionHead"><span>${escapeHtml(o.date)} — ${escapeHtml(o.client||"—")}</span><b>$${money(o.total_usd)}</b></div>`).join("")||"<p class='hint'>Заказов пока нет.</p>";
}
function saveSettings(){
  state.settings.rate=Number($("defaultRate").value)||12000;state.settings.labName=$("labName").value||"Моя лаборатория";saveLocal();
  if(sb&&currentUser)cloudUpsert("settings",{id:currentUser.id,rate:state.settings.rate,lab_name:state.settings.labName});
  $("orderRate").value=state.settings.rate;toast("Настройки сохранены");
}
$("saveConfig").onclick=()=>{cfg={url:$("supabaseUrl").value.trim(),key:$("supabaseKey").value.trim()};localStorage.setItem("dlm_config",JSON.stringify(cfg));connectSupabase()};
$("signInBtn").onclick=signIn;$("signUpBtn").onclick=signUp;$("logoutBtn").onclick=async()=>{if(sb)await sb.auth.signOut();location.reload()};
$("addPriceBtn").onclick=savePrice;$("addClientBtn").onclick=saveClient;$("parseBtn").onclick=parseSmart;$("saveOrderBtn").onclick=saveOrder;$("newOrderBtn").onclick=newOrder;$("copyMessageBtn").onclick=()=>{const t=recalc();const o={client:$("orderClient").value,items:editingOrderItems,total_usd:t.usd,total_uzs:t.uzs,rate:t.rate};navigator.clipboard?.writeText(orderMessage(o));toast("Сообщение скопировано")};
$("orderRate").oninput=recalc;$("orderSearch").oninput=renderOrders;$("saveSettings").onclick=saveSettings;
$("voiceBtn").onclick=()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return toast("Голосовой ввод не поддерживается этим браузером");const r=new SR();r.lang="ru-RU";r.onresult=e=>{$("smartInput").value=e.results[0][0].transcript;parseSmart()};r.start()};
document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tabs button").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");$(b.dataset.tab).classList.add("active")});
$("exportJsonBtn").onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="dental-lab-backup.json";a.click()};
$("importJson").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{state=JSON.parse(r.result);saveLocal();render();toast("Импортировано")}catch{toast("Неверный JSON")}};r.readAsText(f)};
init();
