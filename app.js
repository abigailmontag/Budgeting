// -------------------- INITIAL DATA --------------------
let data = JSON.parse(localStorage.getItem('budgetData')) || {
  transactions: [],
  incomes: [],
  categoryGoals: {},
  lastMonth: new Date().toISOString().slice(0,7),
  history: {}
};

const today = new Date();
const currentMonth = today.toISOString().slice(0,7);

// Auto reset month if needed
if(data.lastMonth !== currentMonth){
  data.history[data.lastMonth] = data.transactions;
  data.transactions = [];
  data.lastMonth = currentMonth;
  saveData();
}

// -------------------- SAVE & UPDATE --------------------
function saveData(){
  localStorage.setItem('budgetData', JSON.stringify(data));
  updateCategoryDropdown();
  updateTransferDropdowns();
}

function update(){
  renderIncome();
  renderCategories(data.transactions);
  renderCharts();
  updateBalance();
  saveData();
}

// -------------------- CATEGORY MANAGEMENT --------------------
function addCategory(){
  const cat = document.getElementById('newCategory').value.trim();
  const goal = parseFloat(document.getElementById('newGoal').value);
  if(!cat || !goal || goal <=0) return alert('Enter category name and valid goal');
  
  // Add or update category goal
  data.categoryGoals[cat] = data.categoryGoals[cat] ? data.categoryGoals[cat]+goal : goal;
  
  document.getElementById('newCategory').value='';
  document.getElementById('newGoal').value='';
  saveData();
  update();
}

// -------------------- CATEGORY DROPDOWN --------------------
function updateCategoryDropdown(){
  const selectFrom=document.getElementById('transferFrom');
  const selectTo=document.getElementById('transferTo');
  [selectFrom, selectTo].forEach(sel=>{
    sel.innerHTML = '';
    Object.keys(data.categoryGoals).forEach(cat=>{
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      sel.appendChild(option);
    });
  });
}

function updateTransferDropdowns(){ updateCategoryDropdown(); }

// -------------------- TRANSFERS --------------------
document.getElementById('transferBtn').onclick = ()=>{
  const from = document.getElementById('transferFrom').value;
  const to = document.getElementById('transferTo').value;
  const amt = parseFloat(document.getElementById('transferAmount').value);
  if(!from || !to || from===to || isNaN(amt) || amt<=0) return alert('Invalid transfer');
  
  const spentFrom = data.transactions.filter(t=>t.category===from && t.type==='expense')
                     .reduce((s,t)=>s+t.amount,0);
  const goalFrom = data.categoryGoals[from];
  if(amt>goalFrom-spentFrom) return alert('Not enough available in source category');

  const todayStr = new Date().toISOString().slice(0,10);
  data.transactions.push({amount:amt,note:`Transfer to ${to}`,type:'expense',category:from,date:todayStr});
  data.transactions.push({amount:amt,note:`Transfer from ${from}`,type:'income',category:to,date:todayStr});
  document.getElementById('transferAmount').value='';
  update();
};

// -------------------- INCOME --------------------
function addIncome(){
  const amt = parseFloat(document.getElementById('incomeAmount').value);
  const note = document.getElementById('incomeNote').value.trim();
  const date = document.getElementById('incomeDate').value || new Date().toISOString().slice(0,10);
  if(!amt || !note) return alert('Enter amount and description');
  data.incomes.push({amount:amt,note:note,date:date});
  document.getElementById('incomeAmount').value='';
  document.getElementById('incomeNote').value='';
  document.getElementById('incomeDate').value='';
  update();
}

function renderIncome(){
  const ul = document.getElementById('incomeList');
  ul.innerHTML='';
  let totalIncome=0;
  data.incomes.forEach((inc,i)=>{
    const li = document.createElement('li');
    li.textContent=`${inc.note}: $${inc.amount} • ${inc.date}`;
    ul.appendChild(li);
    totalIncome+=inc.amount;
  });
  document.getElementById('availableDisplay').textContent='$'+(totalIncome-calcTotalExpenses()).toFixed(2);
}

// -------------------- CALCULATIONS --------------------
function calcTotalExpenses(){
  return data.transactions.filter(t=>t.type==='expense')
             .reduce((s,t)=>s+t.amount,0);
}

function updateBalance(){
  const totalIncome = data.incomes.reduce((s,i)=>s+i.amount,0);
  const totalExp = calcTotalExpenses();
  document.getElementById('balance').textContent='Balance: $'+(totalIncome-totalExp).toFixed(2);
}

// -------------------- RENDER CATEGORIES & TILES --------------------
function renderCategories(transactions){
  const container = document.getElementById('categoriesContainer');
  container.innerHTML = '';

  for(const cat of Object.keys(data.categoryGoals)){
    const card = document.createElement('div'); 
    card.className='category-card';

    const h4 = document.createElement('h4'); 
    h4.textContent = cat;
    card.appendChild(h4);

    // Progress bar
    const spent = transactions
        .filter(t=>t.category===cat && t.type==='expense')
        .reduce((s,t)=>s+t.amount,0);
    const goal = data.categoryGoals[cat];
    const pct = Math.min((spent/goal)*100,100);
    const progress = document.createElement('div'); 
    progress.className='progress-bar';
    progress.innerHTML = `<div class="progress-fill" style="width:${pct}%"></div>
                          <span>Spent: $${spent.toFixed(2)}/$${goal.toFixed(2)}</span>`;
    card.appendChild(progress);

    // Tiles container
    const tiles = document.createElement('div'); 
    tiles.className='tiles-container';
    tiles.id=`tiles-${cat}`;

    // Carry-forward tile
    const leftover = goal - spent;
    if(leftover > 0){
      const carryTile = document.createElement('div'); 
      carryTile.className='tile carry-tile';
      carryTile.textContent = `💰 $${leftover.toFixed(2)} available`;
      tiles.appendChild(carryTile);
    }

    // "+" tile
    const addTile = document.createElement('div'); 
    addTile.className='tile add-tile'; 
    addTile.textContent='+';
    addTile.onclick = ()=>promptAddTransaction(cat);
    tiles.appendChild(addTile);

    // Existing transactions
    transactions
        .filter(t=>t.category===cat)
        .forEach(t=>{
          const tile = document.createElement('div'); 
          tile.className='tile';
          const date = new Date(t.date);
          const dateStr = `${date.toLocaleString('default',{month:'short'})} ${date.getDate()}`;
          tile.textContent = `${t.note} $${t.amount} • ${dateStr}`;
          tiles.appendChild(tile);
        });

    card.appendChild(tiles);
    container.appendChild(card);
  }
}

// -------------------- PROMPT ADD TRANSACTION --------------------
function promptAddTransaction(category){
  const note = prompt(`Transaction description for ${category}`);
  const amt = parseFloat(prompt(`Amount for ${category}`));
  if(!note || !amt || amt<=0) return;
  const date = new Date().toISOString().slice(0,10);
  data.transactions.push({amount:amt,note:note,type:'expense',category:category,date:date});
  update();
}

// -------------------- CLOSE MONTH --------------------
document.getElementById('closeMonthBtn').onclick = openCloseMonthModal;

function openCloseMonthModal() {
  const modal = document.getElementById('closeMonthModal');
  const list = document.getElementById('rolloverList');
  list.innerHTML = '';
  const filtered = data.transactions;

  for(const cat in data.categoryGoals){
    const spent = filtered.filter(t=>t.category===cat && t.type==='expense')
                         .reduce((s,t)=>s+t.amount,0);
    const goal = data.categoryGoals[cat];
    const leftover = goal - spent;
    if(leftover<=0) continue;

    const div = document.createElement('div');
    div.style.marginBottom='12px';
    div.innerHTML = `
      <label>${cat}: $${leftover.toFixed(2)} leftover</label>
      <select data-cat="${cat}">
        <option value="carry">Carry forward to same category</option>
        <option value="redistribute">Redistribute</option>
        <option value="none">Ignore</option>
      </select>
    `;
    list.appendChild(div);
  }

  modal.style.display='flex';
}

function closeModal() {
  document.getElementById('closeMonthModal').style.display='none';
}

document.getElementById('confirmCloseMonth').onclick = () => {
  const selects = document.querySelectorAll('#rolloverList select');
  selects.forEach(sel=>{
    const cat = sel.dataset.cat;
    const choice = sel.value;
    const filtered = data.transactions;
    const spent = filtered.filter(t=>t.category===cat && t.type==='expense')
                         .reduce((s,t)=>s+t.amount,0);
    const leftover = data.categoryGoals[cat] - spent;
    if(leftover <= 0) return;
    
    if(choice==='carry'){
      data.categoryGoals[cat] += leftover;
    }
    else if(choice==='redistribute'){
      const otherCats = Object.keys(data.categoryGoals).filter(c=>c!==cat);
      const perCat = leftover / otherCats.length;
      otherCats.forEach(c=>data.categoryGoals[c] += perCat);
    }
  });

  const lastMonth = data.lastMonth;
  data.history[lastMonth] = data.transactions;
  data.transactions = [];
  data.lastMonth = new Date().toISOString().slice(0,7);
  saveData();
  closeModal();
  update();
};

// -------------------- CSV EXPORT --------------------
function exportCSV(){
  const rows = [['Type','Category','Amount','Note','Date']];
  data.transactions.forEach(t=>{
    rows.push([t.type,t.category,t.amount,t.note,t.date]);
  });
  data.incomes.forEach(i=>{
    rows.push(['income',i.note,i.amount,'',i.date]);
  });
  let csvContent = "data:text/csv;charset=utf-8," 
      + rows.map(e=>e.join(",")).join("\n");
  const encoded = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encoded);
  link.setAttribute('download', "budget_export.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// -------------------- CHARTS --------------------
let surplusChart;

function renderCharts(){
  const ctx = document.getElementById('surplusChart').getContext('2d');
  const totalIncome = data.incomes.reduce((s,i)=>s+i.amount,0);
  const totalExp = calcTotalExpenses();
  const available = totalIncome - totalExp;

  if(surplusChart) surplusChart.destroy();
  surplusChart = new Chart(ctx,{
    type:'bar',
    data:{
      labels:['Available'],
      datasets:[{label:'$',data:[available],backgroundColor:'#f472b6'}]
    },
    options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}
  });
}

// -------------------- INITIAL RENDER --------------------
update();
