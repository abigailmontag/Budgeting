const STORAGE_KEY = "budgetProV2";
let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {months:{}, currentMonth:null};

function save(){localStorage.setItem(STORAGE_KEY, JSON.stringify(state));}
function createMonth(key){
  const prev = state.months[state.currentMonth];
  const month = {income: prev ? prev.income : 0, categories:{}, transfers:[], closed:false, pool:0};
  if(prev){
    for(let name in prev.categories){
      const c = prev.categories[name];
      const delta = c.allocated - c.spent;
      month.categories[name] = {base:c.base, rollover:delta, allocated:c.base+delta, spent:0};
    }
  }
  state.months[key] = month; state.currentMonth = key; save();
  renderMonthSelector(); render();
}

function available(month){
  const total = Object.values(month.categories).reduce((sum,c)=>sum+c.allocated,0);
  return month.income - total + (month.pool||0);
}

function addCategory(name, base){
  const month = state.months[state.currentMonth];
  if(available(month) < base) return alert("Exceeds income");
  month.categories[name] = {base, rollover:0, allocated:base, spent:0};
  save(); render();
}

function transferFunds(from,to,amt){
  const month = state.months[state.currentMonth];
  if(month.categories[from].allocated < amt) return alert("Insufficient funds");
  month.categories[from].allocated -= amt; month.categories[to].allocated += amt;
  month.transfers.push({from,to,amount:amt,date:Date.now()});
  save(); render();
}

function updateSpent(name,val){
  state.months[state.currentMonth].categories[name].spent = Number(val);
  save(); render();
}

function renderMonthSelector(){
  const sel=document.getElementById("monthSelect");
  sel.innerHTML="";
  Object.keys(state.months).sort().forEach(m=>{const opt=document.createElement("option"); opt.value=m; opt.textContent=m; if(m===state.currentMonth) opt.selected=true; sel.appendChild(opt);});
}
document.getElementById("monthSelect").onchange=e=>{state.currentMonth=e.target.value; render();};

function render(){
  const month = state.months[state.currentMonth];
  document.getElementById("incomeInput").value = month.income;
  document.getElementById("availableDisplay").innerText = "$"+available(month);

  const container = document.getElementById("categoriesContainer"); container.innerHTML="";
  const transferFrom = document.getElementById("transferFrom"); const transferTo = document.getElementById("transferTo"); transferFrom.innerHTML=""; transferTo.innerHTML="";
  Object.entries(month.categories).forEach(([name,c])=>{
    const card = document.createElement("div"); card.className="category-card";
    card.innerHTML = `<strong>${name}</strong>Allocated: $${c.allocated} Spent: <input type="number" value="${c.spent}" onchange="updateSpent('${name}',this.value)" /> Remaining: $${c.allocated-c.spent}`;
    container.appendChild(card);
    const opt1=document.createElement("option"); opt1.value=name; opt1.textContent=name; transferFrom.appendChild(opt1.cloneNode(true)); transferTo.appendChild(opt1);
    enableSwipe(card,name);
  });

  renderCharts();
  populateTrendCategories();
}

function renderCharts(){
  const monthKeys = Object.keys(state.months);
  const surplusData = monthKeys.map(m=>available(state.months[m]));
  new Chart(document.getElementById("surplusChart"),{type:"line",data:{labels:monthKeys,datasets:[{label:"Monthly Surplus",data:surplusData}]}});
  const catSel = document.getElementById("trendCategorySelect"); const cat = catSel.value || Object.keys(state.months[state.currentMonth].categories)[0];
  renderCategoryTrend(cat);
}

function populateTrendCategories(){
  const sel = document.getElementById("trendCategorySelect");
  const cats = Object.keys(state.months[state.currentMonth].categories);
  sel.innerHTML=""; cats.forEach(c=>{const opt=document.createElement("option"); opt.value=c; opt.textContent=c; sel.appendChild(opt);});
  sel.onchange = ()=>{renderCategoryTrend(sel.value)};
}

let categoryChart;
function renderCategoryTrend(catName){
  const months = Object.keys(state.months);
  const allocated = months.map(m=>state.months[m].categories[catName]?.allocated||0);
  const spent = months.map(m=>state.months[m].categories[catName]?.spent||0);
  if(categoryChart) categoryChart.destroy();
  categoryChart = new Chart(document.getElementById("categoryTrendChart"),{type:"line",data:{labels:months,datasets:[{label:"Allocated",data:allocated},{label:"Spent",data:spent}]}})
}

function enableSwipe(card,catName){
  let startX=0;
  card.addEventListener("touchstart",e=>{startX=e.touches[0].clientX;});
  card.addEventListener("touchend",e=>{
    let deltaX = e.changedTouches[0].clientX - startX;
    if(deltaX>80){quickAddSpending(catName);} else if(deltaX<-80){openTransferModal(catName);}
  });
}

function quickAddSpending(cat){const val=Number(prompt(`Add spending to ${cat}`)); if(val){const m=state.months[state.currentMonth]; m.categories[cat].spent+=val; save(); render();}}
function openTransferModal(catFrom){const catTo = prompt("Move to category:"); const amt=Number(prompt("Amount:")); if(catTo && amt) transferFunds(catFrom,catTo,amt);}

document.getElementById("newMonthBtn").onclick = ()=>{
  const key=prompt("Month (YYYY-MM)"); if(key) createMonth(key);
}
document.getElementById("addCategoryBtn").onclick = ()=>{
  const name=prompt("Category name"); const base=Number(prompt("Base budget")); if(name && base) addCategory(name,base);
}
document.getElementById("transferBtn").onclick = ()=>{
  const from = document.getElementById("transferFrom").value;
  const to = document.getElementById("transferTo").value;
  const amt = Number(document.getElementById("transferAmount").value);
  transferFunds(from,to,amt);
}

function exportCSV(){
  let rows=[["Month","Category","Allocated","Spent","Rollover"]];
  for(let m in state.months){
    for(let c in state.months[m].categories){
      const cat = state.months[m].categories[c];
      rows.push([m,c,cat.allocated,cat.spent,cat.rollover||0]);
    }
  }
  const blob = new Blob([rows.map(r=>r.join(",")).join("\n")],{type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="budget.csv"; a.click();
}

document.getElementById("themeToggle").onclick = ()=>{
  document.body.classList.toggle("dark");
}

// ----------------- Close Month Modal -----------------
const modal = document.getElementById("closeMonthModal");
function closeModal(){modal.style.display="none";}
document.getElementById("closeMonthBtn").onclick = ()=>{
  showCloseMonthModal();
}

function showCloseMonthModal(){
  const month = state.months[state.currentMonth];
  if(month.closed){alert("Month already closed"); return;}
  const container = document.getElementById("rolloverList");
  container.innerHTML="";
  for(let cat in month.categories){
    const c = month.categories[cat]; const delta=c.allocated-c.spent;
    const div=document.createElement("div");
    div.innerHTML = `<strong>${cat}</strong> Surplus/Deficit: $${delta} <select id="action_${cat}">
      <option value="keep">Keep</option>
      <option value="pool">Pool</option>
      <option value="move">Move</option>
    </select>
    ${delta<0 ? "<em>Deficit will carry forward</em>":""}`;
    container.appendChild(div);
  }
  modal.style.display="block";
}

document.getElementById("confirmCloseMonth").onclick = ()=>{
  const month = state.months[state.currentMonth]; const resolved={}; let pooled=0;
  for(let cat in month.categories){
    const select = document.getElementById(`action_${cat}`);
    const action = select.value;
    const delta = month.categories[cat].allocated - month.categories[cat].spent;
    if(action==="pool"){pooled+=delta; resolved[cat]=0;}
    else{resolved[cat]=delta;}
  }
  month.pool = pooled; month.closed=true;
  const now = new Date(); const nextMonthKey = new Date(now.getFullYear(), now.getMonth()+1,1).toISOString().slice(0,7);
  createMonth(nextMonthKey); for(let c in state.months[nextMonthKey].categories){state.months[nextMonthKey].categories[c].rollover = resolved[c]||0;}
  save(); closeModal(); render();
}

// ----------------- Initialization -----------------
if(!state.currentMonth){ const now = new Date(); createMonth(now.toISOString().slice(0,7)); }
render(); renderMonthSelector();
