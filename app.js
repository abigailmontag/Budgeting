// ── DATA ──────────────────────────────────────────────────────────────────────

let data = JSON.parse(localStorage.getItem('budgetData')) || {
  transactions: [],
  incomes: [],
  categoryGoals: {},   // { catName: { base, rollover } }
  lastMonth: new Date().toISOString().slice(0, 7),
  history: {}
};

// ── MIGRATE OLD DATA FORMAT ───────────────────────────────────────────────────
// Old format stored categoryGoals as { catName: number }
// New format: { catName: { base: number, rollover: number } }
function migrateData(d) {
  const goals = d.categoryGoals || {};
  for (const cat in goals) {
    if (typeof goals[cat] === 'number') {
      goals[cat] = { base: goals[cat], rollover: 0 };
    }
  }
  return d;
}
data = migrateData(data);

const currentMonth = new Date().toISOString().slice(0, 7);

if (data.lastMonth !== currentMonth) {
  setTimeout(() => {
    if (confirm('A new month has started! Would you like to close the previous month and resolve rollovers now?')) {
      openCloseMonthModal();
    }
  }, 300);
}

let _txCategory = null;
let _editCatOriginalName = null;

// ── SAVE ─────────────────────────────────────────────────────────────────────

function saveData() {
  localStorage.setItem('budgetData', JSON.stringify(data));
}

let _updateTimer;
function update() {
  clearTimeout(_updateTimer);
  _updateTimer = setTimeout(_doUpdate, 40);
}

function _doUpdate() {
  renderIncome();
  renderCategories();
  updateBalance();
  updateCategoryDropdowns();
  renderCharts();
  saveData();
}

// ── HELPERS: goal accessors ───────────────────────────────────────────────────

function getBase(cat)     { return (data.categoryGoals[cat] || {}).base     || 0; }
function getRollover(cat) { return (data.categoryGoals[cat] || {}).rollover || 0; }
function getTotal(cat)    { return getBase(cat) + getRollover(cat); }

// ── INCOME ───────────────────────────────────────────────────────────────────

document.getElementById('addIncomeBtn').addEventListener('click', addIncome);

function addIncome() {
  const amt  = parseFloat(document.getElementById('incomeAmount').value);
  const note = document.getElementById('incomeNote').value.trim();
  const date = document.getElementById('incomeDate').value || new Date().toISOString().slice(0, 10);

  if (!note)            return showError('Please enter a description.');
  if (!amt || amt <= 0) return showError('Please enter a valid amount greater than $0.');

  data.incomes.push({ amount: amt, note, date });

  document.getElementById('incomeAmount').value = '';
  document.getElementById('incomeNote').value   = '';
  document.getElementById('incomeDate').value   = '';

  update();
}

function deleteIncome(index) {
  data.incomes.splice(index, 1);
  update();
}

function renderIncome() {
  const ul = document.getElementById('incomeList');
  ul.innerHTML = '';

  if (data.incomes.length === 0) {
    ul.innerHTML = '<li class="empty-state">No income added yet</li>';
    return;
  }

  data.incomes.forEach((inc, i) => {
    const li   = document.createElement('li');
    const span = document.createElement('span');
    span.className   = 'income-text';
    span.textContent = `${inc.note}: $${inc.amount.toFixed(2)} · ${formatDate(inc.date)}`;

    const del = document.createElement('button');
    del.className = 'delete-btn';
    del.textContent = '✕';
    del.setAttribute('aria-label', `Delete ${inc.note}`);
    del.addEventListener('click', () => deleteIncome(i));

    li.appendChild(span);
    li.appendChild(del);
    ul.appendChild(li);
  });
}

// ── CATEGORIES ───────────────────────────────────────────────────────────────

document.getElementById('addCategoryBtn').addEventListener('click', addCategory);

function addCategory() {
  const name = document.getElementById('newCategory').value.trim();
  const goal = parseFloat(document.getElementById('newGoal').value);

  if (!name)              return showError('Please enter a category name.');
  if (!goal || goal <= 0) return showError('Please enter a valid budget goal greater than $0.');

  if (data.categoryGoals[name]) {
    // Category exists — add to base
    data.categoryGoals[name].base += goal;
  } else {
    data.categoryGoals[name] = { base: goal, rollover: 0 };
  }

  document.getElementById('newCategory').value = '';
  document.getElementById('newGoal').value     = '';

  update();
}

function deleteCategory(name) {
  if (!confirm(`Delete category "${name}"? All its transactions will also be removed.`)) return;
  delete data.categoryGoals[name];
  data.transactions = data.transactions.filter(t => t.category !== name);
  update();
}

// ── EDIT CATEGORY MODAL ───────────────────────────────────────────────────────

function openEditCatModal(name) {
  _editCatOriginalName = name;
  document.getElementById('editCatName').value   = name;
  document.getElementById('editCatBase').value   = getBase(name).toFixed(2);
  document.getElementById('editCatRollover').value = getRollover(name).toFixed(2);
  document.getElementById('editCategoryModal').style.display = 'flex';
  setTimeout(() => document.getElementById('editCatName').focus(), 100);
}

document.getElementById('editCatConfirmBtn').addEventListener('click', () => {
  const newName    = document.getElementById('editCatName').value.trim();
  const newBase    = parseFloat(document.getElementById('editCatBase').value);
  const newRollover = parseFloat(document.getElementById('editCatRollover').value) || 0;

  if (!newName)               return showError('Please enter a category name.');
  if (!newBase || newBase <= 0) return showError('Please enter a valid monthly budget greater than $0.');
  if (newRollover < 0)         return showError('Rollover cannot be negative.');

  const old = _editCatOriginalName;

  // If name changed, rename everywhere
  if (newName !== old) {
    if (data.categoryGoals[newName]) return showError(`A category named "${newName}" already exists.`);
    data.categoryGoals[newName] = data.categoryGoals[old];
    delete data.categoryGoals[old];
    data.transactions.forEach(t => { if (t.category === old) t.category = newName; });
  }

  data.categoryGoals[newName].base     = newBase;
  data.categoryGoals[newName].rollover = newRollover;

  closeModal('editCategoryModal');
  update();
});

function renderCategories() {
  const container = document.getElementById('categoriesContainer');
  container.innerHTML = '';

  const cats = Object.keys(data.categoryGoals);

  if (cats.length === 0) {
    container.innerHTML = '<p class="empty-state">No categories yet — add one above.</p>';
    return;
  }

  cats.forEach(cat => {
    const total      = getTotal(cat);
    const base       = getBase(cat);
    const rollover   = getRollover(cat);
    const spent      = calcSpent(cat);
    const pct        = Math.min((spent / total) * 100, 100);
    const overBudget = spent > total;

    const card = document.createElement('div');
    card.className = 'category-card';

    // Header
    const header = document.createElement('div');
    header.className = 'category-card-header';

    const h3 = document.createElement('h3');
    h3.textContent = cat;

    const actions = document.createElement('div');
    actions.className = 'category-card-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-cat-btn';
    editBtn.textContent = 'Edit';
    editBtn.setAttribute('aria-label', `Edit category ${cat}`);
    editBtn.addEventListener('click', () => openEditCatModal(cat));

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-cat-btn';
    delBtn.textContent = 'Delete';
    delBtn.setAttribute('aria-label', `Delete category ${cat}`);
    delBtn.addEventListener('click', () => deleteCategory(cat));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    header.appendChild(h3);
    header.appendChild(actions);

    // Progress bar
    const progressWrap = document.createElement('div');
    progressWrap.className = 'progress-wrap';

    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    const fill = document.createElement('div');
    fill.className = 'progress-fill' + (overBudget ? ' over-budget' : '');
    fill.style.width = pct + '%';
    bar.appendChild(fill);

    const progressLabel = document.createElement('div');
    progressLabel.className = 'progress-label';
    let labelText = `$${spent.toFixed(2)} spent of $${total.toFixed(2)}`;
    if (rollover > 0) labelText += ` ($${base.toFixed(2)} base + $${rollover.toFixed(2)} rollover)`;
    if (overBudget)   labelText += ' ⚠️ Over budget!';
    progressLabel.textContent = labelText;

    progressWrap.appendChild(bar);
    progressWrap.appendChild(progressLabel);

    // Tiles
    const tilesContainer = document.createElement('div');
    tilesContainer.className = 'tiles-container';

    const leftover = total - spent;
    if (leftover > 0) {
      const carryTile = document.createElement('div');
      carryTile.className = 'tile carry-tile';
      carryTile.textContent = `💰 $${leftover.toFixed(2)}\navailable`;
      tilesContainer.appendChild(carryTile);
    }

    const addTile = document.createElement('div');
    addTile.className = 'tile add-tile';
    addTile.textContent = '+';
    addTile.setAttribute('role', 'button');
    addTile.setAttribute('aria-label', `Add expense to ${cat}`);
    addTile.addEventListener('click', () => openTransactionModal(cat));
    tilesContainer.appendChild(addTile);

    data.transactions
      .filter(t => t.category === cat)
      .forEach(t => {
        const tile = document.createElement('div');
        tile.className = 'tile' + (t.type === 'income' ? ' income-tile' : '');

        const delTile = document.createElement('button');
        delTile.className = 'tile-delete';
        delTile.textContent = '✕';
        delTile.setAttribute('aria-label', `Delete transaction ${t.note}`);
        delTile.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteTransaction(t);
        });

        tile.textContent = `${t.note}\n$${t.amount.toFixed(2)}\n${formatDate(t.date)}`;
        tile.appendChild(delTile);
        tilesContainer.appendChild(tile);
      });

    card.appendChild(header);
    card.appendChild(progressWrap);
    card.appendChild(tilesContainer);
    container.appendChild(card);
  });
}

function deleteTransaction(tx) {
  const idx = data.transactions.indexOf(tx);
  if (idx !== -1) data.transactions.splice(idx, 1);
  update();
}

// ── TRANSACTION MODAL ────────────────────────────────────────────────────────

function openTransactionModal(cat) {
  _txCategory = cat;
  document.getElementById('txModalCatLabel').textContent = `Category: ${cat}`;
  document.getElementById('txNote').value   = '';
  document.getElementById('txAmount').value = '';
  document.getElementById('txDate').value   = new Date().toISOString().slice(0, 10);
  document.getElementById('addTransactionModal').style.display = 'flex';
  setTimeout(() => document.getElementById('txNote').focus(), 100);
}

document.getElementById('txConfirmBtn').addEventListener('click', () => {
  const note = document.getElementById('txNote').value.trim();
  const amt  = parseFloat(document.getElementById('txAmount').value);
  const date = document.getElementById('txDate').value || new Date().toISOString().slice(0, 10);

  if (!note)            return showError('Please enter a description.');
  if (!amt || amt <= 0) return showError('Please enter a valid amount greater than $0.');
  if (!_txCategory)     return;

  data.transactions.push({ amount: amt, note, type: 'expense', category: _txCategory, date });

  closeModal('addTransactionModal');
  update();
});

// ── TRANSFERS ────────────────────────────────────────────────────────────────

document.getElementById('transferBtn').addEventListener('click', () => {
  const from = document.getElementById('transferFrom').value;
  const to   = document.getElementById('transferTo').value;
  const amt  = parseFloat(document.getElementById('transferAmount').value);

  if (!from || !to)     return showError('Please select both categories.');
  if (from === to)      return showError('Source and destination must be different categories.');
  if (!amt || amt <= 0) return showError('Please enter a valid transfer amount.');

  const available = getTotal(from) - calcSpent(from);
  if (amt > available)  return showError(`Only $${available.toFixed(2)} is available in "${from}".`);

  const today = new Date().toISOString().slice(0, 10);
  data.transactions.push({ amount: amt, note: `Transfer to ${to}`,     type: 'expense', category: from, date: today });
  data.transactions.push({ amount: amt, note: `Transfer from ${from}`, type: 'income',  category: to,   date: today });

  document.getElementById('transferAmount').value = '';
  update();
});

function updateCategoryDropdowns() {
  const cats = Object.keys(data.categoryGoals);
  ['transferFrom', 'transferTo'].forEach(id => {
    const sel  = document.getElementById(id);
    const prev = sel.value;
    sel.innerHTML = '';
    cats.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      sel.appendChild(opt);
    });
    if (cats.includes(prev)) sel.value = prev;
  });
}

// ── CLOSE MONTH ───────────────────────────────────────────────────────────────

document.getElementById('closeMonthBtn').addEventListener('click', () => {
  if (!confirm("Before closing the month, it's a good idea to download a backup.\n\nPress OK to continue to Close Month, or Cancel to back up first.")) return;
  openCloseMonthModal();
});

function openCloseMonthModal() {
  const list = document.getElementById('rolloverList');
  list.innerHTML = '';

  const cats = Object.keys(data.categoryGoals);
  let hasLeftovers = false;

  cats.forEach(cat => {
    const spent    = calcSpent(cat);
    const leftover = getTotal(cat) - spent;
    if (leftover <= 0) return;

    hasLeftovers = true;

    const otherCats     = cats.filter(c => c !== cat);
    const moveToOptions = otherCats
      .map(c => `<option value="moveto:${c}">↗️ Move to: ${c}</option>`)
      .join('');

    const div = document.createElement('div');
    div.className = 'rollover-item';
    div.innerHTML = `
      <div class="rollover-cat-name">${cat}</div>
      <div class="rollover-amount">$${leftover.toFixed(2)} leftover</div>
      <select class="rollover-action" data-cat="${cat}">
        <option value="carry">↩️ Carry forward to ${cat}</option>
        <option value="income">💵 Add to next month's income</option>
        ${moveToOptions}
        <option value="none">🗑️ Discard</option>
      </select>
    `;
    list.appendChild(div);
  });

  if (!hasLeftovers) {
    list.innerHTML = '<p class="rollover-empty">No leftover budgets — all categories are fully spent.</p>';
  }

  document.getElementById('closeMonthModal').style.display = 'flex';
}

document.getElementById('confirmCloseMonth').addEventListener('click', () => {
  const actionSelects = document.querySelectorAll('#rolloverList .rollover-action');
  const today         = new Date().toISOString().slice(0, 10);
  let   incomeRollover = 0;

  // Collect leftover amounts before resetting anything
  const rollovers = {};
  actionSelects.forEach(sel => {
    const cat     = sel.dataset.cat;
    const spent   = calcSpent(cat);
    const leftover = getTotal(cat) - spent;
    if (leftover > 0) rollovers[cat] = { choice: sel.value, leftover };
  });

  // Archive this month
  const archiveMonth = data.lastMonth;
  data.history[archiveMonth] = {
    transactions: [...data.transactions],
    incomes:      [...data.incomes]
  };

  // Reset transactions and incomes for new month
  data.transactions = [];
  data.incomes      = [];
  data.lastMonth    = currentMonth;

  // Reset every category: keep base, reset rollover to 0 first
  for (const cat in data.categoryGoals) {
    data.categoryGoals[cat].rollover = 0;
  }

  // Apply rollover choices — always add base back (it's the monthly budget)
  // Rollover only carries the leftover amount, not the full goal
  for (const cat in rollovers) {
    const { choice, leftover } = rollovers[cat];

    if (choice === 'carry') {
      // Add leftover to this category's rollover
      if (data.categoryGoals[cat]) {
        data.categoryGoals[cat].rollover += leftover;
      }
    } else if (choice === 'income') {
      incomeRollover += leftover;
    } else if (choice.startsWith('moveto:')) {
      const targetCat = choice.replace('moveto:', '');
      if (data.categoryGoals[targetCat]) {
        data.categoryGoals[targetCat].rollover += leftover;
      }
    }
    // 'none' — discard
  }

  // Add income rollover as a single entry if any
  if (incomeRollover > 0) {
    data.incomes.push({
      amount: parseFloat(incomeRollover.toFixed(2)),
      note:   `Rollover from ${archiveMonth}`,
      date:   today
    });
  }

  closeModal('closeMonthModal');
  update();
});

// ── BALANCE & CALCULATIONS ────────────────────────────────────────────────────

function calcSpent(cat) {
  return data.transactions
    .filter(t => t.category === cat && t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);
}

function calcTotalExpenses() {
  return data.transactions
    .filter(t => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);
}

function updateBalance() {
  const totalIncome = data.incomes.reduce((s, i) => s + i.amount, 0);
  const totalExp    = calcTotalExpenses();
  const balance     = totalIncome - totalExp;

  document.getElementById('balance').textContent        = `Balance: $${balance.toFixed(2)}`;
  document.getElementById('availableDisplay').textContent = `$${(totalIncome - totalExp).toFixed(2)}`;
}

// ── CHARTS ───────────────────────────────────────────────────────────────────

let surplusChart;

function renderCharts() {
  if (typeof Chart === 'undefined') return;
  const ctx  = document.getElementById('surplusChart').getContext('2d');
  const cats = Object.keys(data.categoryGoals);

  const labels  = cats.length > 0 ? cats : ['No categories'];
  const budgets = cats.map(c => getTotal(c));
  const spent   = cats.map(c => calcSpent(c));

  if (surplusChart) surplusChart.destroy();

  surplusChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Budget',
          data: budgets,
          backgroundColor: 'rgba(139, 92, 246, 0.5)',
          borderColor: 'rgba(139, 92, 246, 0.9)',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Spent',
          data: spent,
          backgroundColor: 'rgba(244, 114, 182, 0.6)',
          borderColor: 'rgba(244, 114, 182, 0.9)',
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#fff', font: { size: 12 } } }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } },
          grid:  { color: 'rgba(255,255,255,0.1)' }
        },
        x: {
          ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } },
          grid:  { color: 'rgba(255,255,255,0.08)' }
        }
      }
    }
  });
}

// ── CSV EXPORT ────────────────────────────────────────────────────────────────

document.getElementById('exportBtn').addEventListener('click', exportCSV);

function csvEscape(val) {
  const str = String(val ?? '');
  return (str.includes(',') || str.includes('"') || str.includes('\n'))
    ? `"${str.replace(/"/g, '""')}"` : str;
}

function exportCSV() {
  const rows = [['Type', 'Category', 'Amount', 'Note', 'Date']];
  data.transactions.forEach(t => rows.push([t.type, t.category, t.amount.toFixed(2), t.note, t.date]));
  data.incomes.forEach(i      => rows.push(['income', '', i.amount.toFixed(2), i.note, i.date]));

  const csv  = rows.map(r => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `budget_${data.lastMonth}.csv`;
  document.body.appendChild(link); link.click();
  document.body.removeChild(link); URL.revokeObjectURL(url);
}

// ── JSON BACKUP & RESTORE ─────────────────────────────────────────────────────

document.getElementById('backupBtn').addEventListener('click', downloadBackup);
document.getElementById('restoreBtn').addEventListener('click', () => document.getElementById('restoreFileInput').click());
document.getElementById('restoreFileInput').addEventListener('change', handleRestoreFile);

function downloadBackup() {
  const backup = { version: 2, exportedAt: new Date().toISOString(), data };
  const json   = JSON.stringify(backup, null, 2);
  const blob   = new Blob([json], { type: 'application/json' });
  const url    = URL.createObjectURL(blob);
  const link   = document.createElement('a');
  link.href = url; link.download = `budget-backup-${data.lastMonth}.json`;
  document.body.appendChild(link); link.click();
  document.body.removeChild(link); URL.revokeObjectURL(url);
  showRestoreStatus('Backup downloaded!', 'success');
}

function handleRestoreFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const backup = JSON.parse(event.target.result);

      if (!backup.data || !backup.data.transactions || !backup.data.incomes || !backup.data.categoryGoals) {
        return showRestoreStatus('Invalid backup file — please use a file exported from this app.', 'error');
      }

      if (!confirm(`Restore backup from ${backup.exportedAt ? new Date(backup.exportedAt).toLocaleDateString() : 'unknown date'}? This will replace all current data.`)) {
        e.target.value = '';
        return;
      }

      // Migrate old backup format (v1 had goals as plain numbers)
      data = migrateData(backup.data);
      saveData();
      update();
      showRestoreStatus('Backup restored successfully!', 'success');
    } catch (err) {
      showRestoreStatus("Could not read file — make sure it's a valid backup.", 'error');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
}

function showRestoreStatus(msg, type) {
  const el = document.getElementById('restoreStatus');
  el.textContent = msg;
  el.className   = 'restore-status restore-status--' + type;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ── UTILITIES ─────────────────────────────────────────────────────────────────

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(modal.id); });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal').forEach(m => { if (m.style.display !== 'none') closeModal(m.id); });
  }
});

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('default', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function showError(msg) { alert(msg); }

// ── INIT ──────────────────────────────────────────────────────────────────────

update();
