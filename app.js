// ── DATA ──────────────────────────────────────────────────────────────────────

let data = JSON.parse(localStorage.getItem('budgetData')) || {
  transactions: [],
  incomes: [],
  categoryGoals: {},
  lastMonth: new Date().toISOString().slice(0, 7),
  history: {}
};

const currentMonth = new Date().toISOString().slice(0, 7);

// If month changed, notify user to close month — do NOT auto-reset silently
if (data.lastMonth !== currentMonth) {
  setTimeout(() => {
    if (confirm('A new month has started! Would you like to close the previous month and resolve rollovers now?')) {
      openCloseMonthModal();
    }
  }, 300);
}

// Track which category the transaction modal is targeting
let _txCategory = null;

// ── SAVE ─────────────────────────────────────────────────────────────────────

function saveData() {
  localStorage.setItem('budgetData', JSON.stringify(data));
}

// Debounced update so rapid changes don't hammer the DOM
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

// ── INCOME ───────────────────────────────────────────────────────────────────

document.getElementById('addIncomeBtn').addEventListener('click', addIncome);

function addIncome() {
  const amt  = parseFloat(document.getElementById('incomeAmount').value);
  const note = document.getElementById('incomeNote').value.trim();
  const date = document.getElementById('incomeDate').value || new Date().toISOString().slice(0, 10);

  if (!note)       return showError('Please enter a description.');
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
    const li = document.createElement('li');

    const span = document.createElement('span');
    span.className = 'income-text';
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

  // If category already exists, add to its goal rather than replace
  data.categoryGoals[name] = (data.categoryGoals[name] || 0) + goal;

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

function renderCategories() {
  const container = document.getElementById('categoriesContainer');
  container.innerHTML = '';

  const cats = Object.keys(data.categoryGoals);

  if (cats.length === 0) {
    container.innerHTML = '<p class="empty-state">No categories yet — add one above.</p>';
    return;
  }

  cats.forEach(cat => {
    const goal  = data.categoryGoals[cat];
    const spent = calcSpent(cat);
    const pct   = Math.min((spent / goal) * 100, 100);
    const overBudget = spent > goal;

    const card = document.createElement('div');
    card.className = 'category-card';

    // Header row with delete button
    const header = document.createElement('div');
    header.className = 'category-card-header';

    const h3 = document.createElement('h3');
    h3.textContent = cat;

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-cat-btn';
    delBtn.textContent = 'Delete';
    delBtn.setAttribute('aria-label', `Delete category ${cat}`);
    delBtn.addEventListener('click', () => deleteCategory(cat));

    header.appendChild(h3);
    header.appendChild(delBtn);

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
    progressLabel.textContent = `$${spent.toFixed(2)} spent of $${goal.toFixed(2)}${overBudget ? ' ⚠️ Over budget!' : ''}`;

    progressWrap.appendChild(bar);
    progressWrap.appendChild(progressLabel);

    // Tiles
    const tilesContainer = document.createElement('div');
    tilesContainer.className = 'tiles-container';

    // Carry-forward / available tile
    const leftover = goal - spent;
    if (leftover > 0) {
      const carryTile = document.createElement('div');
      carryTile.className = 'tile carry-tile';
      carryTile.textContent = `💰 $${leftover.toFixed(2)}\navailable`;
      tilesContainer.appendChild(carryTile);
    }

    // "+" add tile
    const addTile = document.createElement('div');
    addTile.className = 'tile add-tile';
    addTile.textContent = '+';
    addTile.setAttribute('role', 'button');
    addTile.setAttribute('aria-label', `Add expense to ${cat}`);
    addTile.addEventListener('click', () => openTransactionModal(cat));
    tilesContainer.appendChild(addTile);

    // Expense tiles
    data.transactions
      .filter(t => t.category === cat)
      .forEach((t, idx) => {
        const tile = document.createElement('div');
        tile.className = 'tile' + (t.type === 'income' ? ' income-tile' : '');

        const delTile = document.createElement('button');
        delTile.className = 'tile-delete';
        delTile.textContent = '✕';
        delTile.setAttribute('aria-label', `Delete transaction ${t.note}`);
        delTile.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteTransaction(cat, t);
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

function deleteTransaction(cat, tx) {
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

  if (!note)       return showError('Please enter a description.');
  if (!amt || amt <= 0) return showError('Please enter a valid amount greater than $0.');
  if (!_txCategory) return;

  data.transactions.push({
    amount: amt,
    note,
    type: 'expense',
    category: _txCategory,
    date
  });

  closeModal('addTransactionModal');
  update();
});

// ── TRANSFERS ────────────────────────────────────────────────────────────────

document.getElementById('transferBtn').addEventListener('click', () => {
  const from = document.getElementById('transferFrom').value;
  const to   = document.getElementById('transferTo').value;
  const amt  = parseFloat(document.getElementById('transferAmount').value);

  if (!from || !to)    return showError('Please select both categories.');
  if (from === to)     return showError('Source and destination must be different categories.');
  if (!amt || amt <= 0) return showError('Please enter a valid transfer amount.');

  const available = data.categoryGoals[from] - calcSpent(from);
  if (amt > available) return showError(`Only $${available.toFixed(2)} is available in "${from}".`);

  const today = new Date().toISOString().slice(0, 10);
  data.transactions.push({ amount: amt, note: `Transfer to ${to}`,   type: 'expense', category: from, date: today });
  data.transactions.push({ amount: amt, note: `Transfer from ${from}`, type: 'income',  category: to,   date: today });

  document.getElementById('transferAmount').value = '';
  update();
});

function updateCategoryDropdowns() {
  const cats = Object.keys(data.categoryGoals);
  ['transferFrom', 'transferTo'].forEach(id => {
    const sel = document.getElementById(id);
    const prev = sel.value;
    sel.innerHTML = '';
    cats.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      sel.appendChild(opt);
    });
    // Restore previous selection if still valid
    if (cats.includes(prev)) sel.value = prev;
  });
}

// ── CLOSE MONTH ───────────────────────────────────────────────────────────────

document.getElementById('closeMonthBtn').addEventListener('click', () => {
  // Remind user to back up before closing the month
  if (!confirm("Before closing the month, it's a good idea to download a backup.\n\nPress OK to continue to Close Month, or Cancel to back up first.")) {
    return;
  }
  openCloseMonthModal();
});

function openCloseMonthModal() {
  const list = document.getElementById('rolloverList');
  list.innerHTML = '';

  const cats = Object.keys(data.categoryGoals);
  let hasLeftovers = false;

  cats.forEach(cat => {
    const spent    = calcSpent(cat);
    const leftover = data.categoryGoals[cat] - spent;
    if (leftover <= 0) return;

    hasLeftovers = true;

    // Build "move to specific category" options (all cats except this one)
    const otherCats = cats.filter(c => c !== cat);
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

  // Snapshot original goals before any mutation to prevent carry-forward compounding
  const originalGoals = { ...data.categoryGoals };

  // Pool all income rollovers into a single entry
  let incomeRollover = 0;
  const today = new Date().toISOString().slice(0, 10);

  actionSelects.forEach(sel => {
    const cat      = sel.dataset.cat;
    const choice   = sel.value;
    const spent    = calcSpent(cat);
    const leftover = originalGoals[cat] - spent;
    if (leftover <= 0) return;

    if (choice === 'carry') {
      data.categoryGoals[cat] += leftover;

    } else if (choice === 'income') {
      incomeRollover += leftover;

    } else if (choice.startsWith('moveto:')) {
      const targetCat = choice.replace('moveto:', '');
      if (data.categoryGoals[targetCat] !== undefined) {
        data.categoryGoals[targetCat] += leftover;
      }
    }
    // 'none' — discard, do nothing
  });

  // Archive this month before resetting
  const archiveMonth = data.lastMonth;
  data.history[archiveMonth] = {
    transactions: [...data.transactions],
    incomes:      [...data.incomes]
  };

  // Reset for new month
  data.transactions = [];
  data.incomes      = [];
  data.lastMonth    = currentMonth;

  // Add income rollover as first entry of the new month, if any
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

  document.getElementById('balance').textContent = `Balance: $${balance.toFixed(2)}`;
  document.getElementById('availableDisplay').textContent = `$${(totalIncome - totalExp).toFixed(2)}`;
}

// ── CHARTS ───────────────────────────────────────────────────────────────────

let surplusChart;

function renderCharts() {
  if (typeof Chart === 'undefined') return; // Chart.js not loaded yet
  const ctx = document.getElementById('surplusChart').getContext('2d');
  const cats = Object.keys(data.categoryGoals);

  const labels   = cats.length > 0 ? cats : ['No categories'];
  const budgets  = cats.map(c => data.categoryGoals[c]);
  const spent    = cats.map(c => calcSpent(c));

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
        legend: {
          labels: { color: '#fff', font: { size: 12 } }
        }
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
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

function exportCSV() {
  const rows = [['Type', 'Category', 'Amount', 'Note', 'Date']];

  data.transactions.forEach(t => {
    rows.push([t.type, t.category, t.amount.toFixed(2), t.note, t.date]);
  });

  data.incomes.forEach(i => {
    rows.push(['income', '', i.amount.toFixed(2), i.note, i.date]);
  });

  const csv     = rows.map(r => r.map(csvEscape).join(',')).join('\n');
  const blob    = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url     = URL.createObjectURL(blob);
  const link    = document.createElement('a');
  link.href     = url;
  link.download = `budget_${data.lastMonth}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


// ── JSON BACKUP & RESTORE ─────────────────────────────────────────────────────

document.getElementById('backupBtn').addEventListener('click', downloadBackup);
document.getElementById('restoreBtn').addEventListener('click', () => {
  document.getElementById('restoreFileInput').click();
});
document.getElementById('restoreFileInput').addEventListener('change', handleRestoreFile);

function downloadBackup() {
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: data
  };
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = `budget-backup-${data.lastMonth}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showRestoreStatus('Backup downloaded!', 'success');
}

function handleRestoreFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const backup = JSON.parse(event.target.result);

      // Validate it looks like our backup format
      if (!backup.data || !backup.data.transactions || !backup.data.incomes || !backup.data.categoryGoals) {
        return showRestoreStatus('Invalid backup file — please use a file exported from this app.', 'error');
      }

      if (!confirm(`Restore backup from ${backup.exportedAt ? new Date(backup.exportedAt).toLocaleDateString() : 'unknown date'}? This will replace all current data.`)) {
        // Reset file input so same file can be chosen again
        e.target.value = '';
        return;
      }

      data = backup.data;
      saveData();
      update();
      showRestoreStatus('Backup restored successfully!', 'success');
    } catch (err) {
      showRestoreStatus("Could not read file — make sure it's a valid backup.", 'error');
    }
    // Reset so same file can be re-selected if needed
    e.target.value = '';
  };
  reader.readAsText(file);
}

function showRestoreStatus(msg, type) {
  const el = document.getElementById('restoreStatus');
  el.textContent = msg;
  el.className = 'restore-status restore-status--' + type;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ── UTILITIES ─────────────────────────────────────────────────────────────────

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

// Close modals on backdrop click
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal(modal.id);
  });
});

// Close modals with Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal').forEach(m => {
      if (m.style.display !== 'none') closeModal(m.id);
    });
  }
});

function formatDate(dateStr) {
  if (!dateStr) return '';
  // Parse as UTC to avoid timezone offset shifting day by 1
  const [y, m, d] = dateStr.split('-');
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('default', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function showError(msg) {
  alert(msg); // Can be upgraded to a toast notification later
}

// ── INIT ──────────────────────────────────────────────────────────────────────

update();
