'use strict';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
const state = { batches: [], movements: [], settings: { alertDays: 7 }, summary: null, search: '', category: '', status: '', movementSearch: '', movementType: '', currentPage: 'overview' };
let lastObservedDate = todayISO();
const pageTitles = { overview: 'Overview', inventory: 'Inventory', issue: 'Issue stock', movements: 'Stock movements', reports: 'Reports', settings: 'Settings & backup' };
const itemGlyphs = { Dairy: '◒', Grains: '◈', Pulses: '❋', Vegetables: '✿', Fruits: '◉', Essentials: '◇', Frozen: '❄' };

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function addDays(date, days) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
function n(value, decimals = 3) { const valueNum = Number(value) || 0; return new Intl.NumberFormat('en-IN', { maximumFractionDigits: decimals }).format(valueNum); }
function money(value) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value) || 0); }
function dateLabel(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '—';
  return new Intl.DateTimeFormat('en-IN', options).format(new Date(`${value}T00:00:00`));
}
function compactDate(value) { return dateLabel(value, { day: 'numeric', month: 'short' }); }
function expiryCountdownLabel(date) { const days = dayDiff(date); if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`; if (days === 0) return 'Expiry date is today'; return `Expires in ${days} day${days === 1 ? '' : 's'}`; }
function dayDiff(date) { return Math.round((new Date(`${date}T00:00:00Z`).getTime() - new Date(`${todayISO()}T00:00:00Z`).getTime()) / 86400000); }
function statusOf(batch) {
  if (batch.archived) return 'archived';
  if (Number(batch.quantity) <= 0) return 'out-of-stock';
  if (batch.expiryDate < todayISO()) return 'expired';
  if (batch.expiryDate <= addDays(todayISO(), Number(state.settings.alertDays) || 7)) return 'expiring';
  return 'available';
}
function statusLabel(status) { return ({ expired: 'Expired', expiring: 'Expiring soon', available: 'Available', 'out-of-stock': 'Out of stock', archived: 'Archived' })[status] || status; }
function batchIcon(batch) { return (Object.hasOwn(itemGlyphs, batch.category) ? itemGlyphs[batch.category] : '') || (batch.category === 'Dairy' ? '◒' : '◈'); }
function batchSearchText(batch) { return [batch.itemName, batch.batchCode, batch.supplier, batch.category, batch.notes].join(' ').toLowerCase(); }

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const detail = Array.isArray(payload.details) ? ` ${payload.details.join(' ')}` : payload.details?.errors ? ` ${payload.details.errors.join(' ')}` : '';
    throw new Error((payload.error || `Request failed (${response.status}).`) + detail);
  }
  return payload;
}
function post(path, data) { return api(path, { method: 'POST', body: JSON.stringify(data) }); }
function showToast(title, message = '', type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : type === 'warning' ? 'warning' : ''}`;
  toast.innerHTML = `<div><strong>${esc(title)}</strong>${message ? `<span>${esc(message)}</span>` : ''}</div>`;
  $('#toastRegion').append(toast);
  setTimeout(() => toast.remove(), 5200);
}
function showPage(page) {
  if (!pageTitles[page]) return;
  state.currentPage = page;
  $$('.page-view').forEach((view) => view.classList.toggle('active', view.id === `page-${page}`));
  $$('.nav-link[data-page]').forEach((link) => link.classList.toggle('active', link.dataset.page === page));
  $('#currentPageTitle').textContent = pageTitles[page];
  $('#sidebar').classList.remove('open');
  if (page === 'inventory') renderInventory();
  if (page === 'issue') renderIssueOptions();
  if (page === 'movements') renderMovements();
  if (page === 'reports') renderReports();
  if (page === 'settings') renderSettings();
}
async function refresh({ quiet = false } = {}) {
  try {
    const data = await api('/api/state');
    state.batches = data.batches || [];
    state.movements = data.movements || [];
    state.settings = data.settings || { alertDays: 7 };
    state.summary = data.summary;
    renderAll();
    $('#serverHealthText').textContent = 'Local server connected · data file available';
    return true;
  } catch (error) {
    let serverReachable = false;
    try { await api('/api/health'); serverReachable = true; } catch {}
    $('#serverHealthText').textContent = serverReachable
      ? 'Server connected · inventory data needs recovery'
      : 'Cannot connect to local server';
    if (!quiet) showToast('Could not load inventory', error.message, 'error');
    return false;
  }
}
function activeBatches() { return state.batches.filter((b) => !b.archived); }
function sumQuantity(list) { return list.reduce((total, b) => total + (Number(b.quantity) || 0), 0); }
function renderAll() {
  $('#todayLabel').textContent = dateLabel(todayISO(), { day: 'numeric', month: 'short', year: 'numeric' });
  $('#navBatchCount').textContent = activeBatches().length;
  renderDashboard();
  renderInventory();
  renderIssueOptions();
  renderMovements();
  renderReports();
  renderSettings();
}
function metricCard(label, value, foot, icon, tone) {
  return `<article class="metric-card"><div class="metric-top"><span class="metric-label">${esc(label)}</span><span class="metric-icon ${tone}">${icon}</span></div><div class="metric-value">${esc(value)}</div><div class="metric-foot">${foot}</div></article>`;
}
function renderDashboard() {
  const batches = activeBatches();
  const expired = batches.filter((b) => statusOf(b) === 'expired');
  const expiring = batches.filter((b) => statusOf(b) === 'expiring');
  const eligible = batches.filter((b) => statusOf(b) !== 'expired');
  const availableUnits = sumQuantity(eligible);
  $('#metricGrid').innerHTML = [
    metricCard('Active batches', n(batches.length, 0), `<span>${n(new Set(batches.map((b) => b.itemName.toLowerCase())).size, 0)} distinct items</span>`, '▤', 'green'),
    metricCard('Available units', n(availableUnits), `<span>Excludes expired stock</span>`, '◈', 'blue'),
    metricCard('Expiring soon', n(expiring.length, 0), `<span class="warning">${n(sumQuantity(expiring))} units at risk</span>`, '◷', 'amber'),
    metricCard('Expired stock', n(sumQuantity(expired)), `<span class="warning">${n(expired.length, 0)} batches to review</span>`, '!', 'red'),
  ].join('');

  const attention = batches.filter((b) => ['expired', 'expiring'].includes(statusOf(b))).sort((a, b) => {
    const statusPriority = (x) => statusOf(x) === 'expired' ? 0 : 1;
    return statusPriority(a) - statusPriority(b) || a.expiryDate.localeCompare(b.expiryDate);
  });
  $('#alertsList').innerHTML = attention.length ? attention.slice(0, 5).map((b) => {
    const status = statusOf(b);
    return `<div class="alert-row"><span class="alert-symbol ${status}">${status === 'expired' ? '!' : '◷'}</span><div><div class="alert-name">${esc(b.itemName)}</div><div class="alert-meta">Batch ${esc(b.batchCode)} · ${status === 'expired' ? `${Math.abs(dayDiff(b.expiryDate))} day(s) past expiry` : `Expires in ${Math.max(0, dayDiff(b.expiryDate))} day(s)`}</div></div><div class="alert-right"><div class="alert-qty">${n(b.quantity)} ${esc(b.unit)}</div><div class="alert-date">${compactDate(b.expiryDate)}</div></div></div>`;
  }).join('') : `<div class="empty-state"><span class="empty-state-icon">✓</span><strong>All clear for now</strong><p>No batches are expired or within the ${n(state.settings.alertDays, 0)}-day alert window.</p></div>`;

  const expiringRows = batches.filter((b) => Number(b.quantity) > 0).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)).slice(0, 5);
  $('#expiringTable').innerHTML = expiringRows.length ? expiringRows.map((b) => {
    const status = statusOf(b);
    return `<tr><td><div class="item-cell"><span class="item-avatar ${esc((b.category || '').toLowerCase())}">${esc(batchIcon(b))}</span><span class="item-copy"><strong>${esc(b.itemName)}</strong><small>${esc(b.batchCode)}</small></span></div></td><td><span class="qty-cell">${n(b.quantity)} <small>${esc(b.unit)}</small></span></td><td>${dateLabel(b.expiryDate)}<div class="alert-meta">${esc(expiryCountdownLabel(b.expiryDate))}</div></td><td>${esc(b.supplier || '—')}</td><td><span class="status-pill ${status}">${statusLabel(status)}</span></td></tr>`;
  }).join('') : `<tr><td colspan="5" class="empty-cell">No stock yet. Add a batch to see expiry tracking here.</td></tr>`;

  const categoryMap = Object.create(null);
  batches.forEach((b) => { const name = b.category || 'Uncategorized'; categoryMap[name] = (categoryMap[name] || 0) + (Number(b.quantity) || 0); });
  $('#categoryChart').innerHTML = categoryChartMarkup(categoryMap);
}
function categoryChartMarkup(map) {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const max = Math.max(1, ...entries.map(([, value]) => value));
  if (!entries.length) return `<div class="empty-state small-empty"><strong>No categories yet</strong><p>Add stock to see the category breakdown.</p></div>`;
  return entries.map(([name, value]) => `<div class="category-line"><span class="category-name" title="${esc(name)}">${esc(name)}</span><span class="category-track"><span class="category-fill" style="width:${Math.max(2, value / max * 100)}%"></span></span><span class="category-total">${n(value)}</span></div>`).join('');
}
function renderInventory() {
  const batches = activeBatches();
  const categories = [...new Set(batches.map((b) => b.category || 'Uncategorized'))].sort((a, b) => a.localeCompare(b));
  const categorySelect = $('#categoryFilter');
  const selectedCategory = state.category;
  if ([...categorySelect.options].length !== categories.length + 1 || categories.some((name, index) => categorySelect.options[index + 1]?.value !== name)) {
    categorySelect.innerHTML = `<option value="">All categories</option>${categories.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join('')}`;
  }
  categorySelect.value = categories.includes(selectedCategory) ? selectedCategory : '';
  state.category = categorySelect.value;
  $('#statusFilter').value = state.status;
  const filtered = batches.filter((b) => {
    if (state.search && !batchSearchText(b).includes(state.search.toLowerCase())) return false;
    if (state.category && (b.category || 'Uncategorized') !== state.category) return false;
    if (state.status && statusOf(b) !== state.status) return false;
    return true;
  }).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.itemName.localeCompare(b.itemName));
  const inventoryTable = $('#inventoryTable');
  if (!filtered.length) inventoryTable.innerHTML = `<tr><td colspan="7" class="empty-cell">${batches.length ? 'No batches match your filters.' : 'No stock recorded yet. Click “Add batch” to enter your first real inventory item.'}</td></tr>`;
  else inventoryTable.innerHTML = filtered.map((b) => {
    const status = statusOf(b);
    const actions = [`<button class="row-action" data-action="edit" data-id="${esc(b.id)}">Edit</button>`, `<button class="row-action" data-action="adjust" data-id="${esc(b.id)}">Adjust</button>`];
    if (status === 'expired' && Number(b.quantity) > 0) actions.push(`<button class="row-action danger" data-action="writeoff" data-id="${esc(b.id)}">Write-off</button>`);
    if (Number(b.quantity) <= 0) actions.push(`<button class="row-action" data-action="archive" data-id="${esc(b.id)}">Archive</button>`);
    return `<tr><td><div class="item-cell"><span class="item-avatar ${esc((b.category || '').toLowerCase())}">${esc(batchIcon(b))}</span><span class="item-copy"><strong>${esc(b.itemName)}</strong><small>${esc(b.batchCode)} · ${esc(b.category || 'Uncategorized')}</small></span></div></td><td><span class="qty-cell">${n(b.quantity)} <small>${esc(b.unit)}</small></span></td><td>${dateLabel(b.receivedDate)}</td><td><span>${dateLabel(b.expiryDate)}</span><div class="alert-meta">${esc(expiryCountdownLabel(b.expiryDate))}</div></td><td>${esc(b.supplier || '—')}</td><td><span class="status-pill ${status}">${statusLabel(status)}</span></td><td><div class="row-actions">${actions.join('')}</div></td></tr>`;
  }).join('');
  $('#inventoryCount').textContent = `${filtered.length} batch${filtered.length === 1 ? '' : 'es'} shown`;
  const expiring = batches.filter((b) => statusOf(b) === 'expiring');
  const expired = batches.filter((b) => statusOf(b) === 'expired');
  $('#inventorySummaryStrip').innerHTML = `<div class="summary-chip"><span>Active batches</span><strong>${n(batches.length, 0)}</strong></div><div class="summary-chip"><span>Units on hand</span><strong>${n(sumQuantity(batches))}</strong></div><div class="summary-chip"><span>Expiring soon</span><strong>${n(expiring.length, 0)}</strong></div><div class="summary-chip"><span>Expired batches</span><strong>${n(expired.length, 0)}</strong></div>`;
}
function groupEligibleItems() {
  const map = new Map();
  activeBatches().filter((b) => Number(b.quantity) > 0 && b.receivedDate <= todayISO() && b.expiryDate >= todayISO()).forEach((b) => {
    const key = `${b.itemName.trim().toLowerCase()}\u001f${b.unit.trim().toLowerCase()}`;
    if (!map.has(key)) map.set(key, { itemName: b.itemName, unit: b.unit, available: 0 });
    map.get(key).available += Number(b.quantity) || 0;
  });
  return [...map.values()].sort((a, b) => a.itemName.localeCompare(b.itemName) || a.unit.localeCompare(b.unit));
}
function renderIssueOptions() {
  const select = $('#issueItem');
  if (!select) return;
  const oldValue = select.value;
  const groups = groupEligibleItems();
  select.innerHTML = groups.length ? `<option value="">Choose an item…</option>${groups.map((g) => `<option value="${encodeURIComponent(JSON.stringify({ itemName: g.itemName, unit: g.unit }))}">${esc(g.itemName)} · ${esc(g.unit)} — ${n(g.available)} available</option>`).join('')}` : `<option value="">No eligible stock available</option>`;
  if (groups.some((g) => encodeURIComponent(JSON.stringify({ itemName: g.itemName, unit: g.unit })) === oldValue)) select.value = oldValue;
  else if (groups.length === 1) select.selectedIndex = 1;
  updateIssueAvailability();
}
function selectedIssueItem() {
  const raw = $('#issueItem').value;
  if (!raw) return null;
  try { return JSON.parse(decodeURIComponent(raw)); } catch { return null; }
}
function updateIssueAvailability() {
  const selected = selectedIssueItem();
  const hint = $('#issueAvailableHint');
  if (!selected) { hint.textContent = 'Select an item to see available quantity.'; return; }
  const batches = activeBatches().filter((b) => b.itemName.toLowerCase() === selected.itemName.toLowerCase() && b.unit.toLowerCase() === selected.unit.toLowerCase() && Number(b.quantity) > 0 && b.receivedDate <= todayISO() && b.expiryDate >= todayISO());
  hint.textContent = `${n(sumQuantity(batches))} ${selected.unit} currently available across ${batches.length} eligible batch${batches.length === 1 ? '' : 'es'}.`;
}
function renderMovements() {
  const all = state.movements || [];
  const totals = { RECEIVE: 0, ADJUSTMENT_ADD: 0, ISSUE: 0 };
  all.forEach((m) => { if (Object.hasOwn(totals, m.type)) totals[m.type] += Number(m.quantity) || 0; });
  $('#movementSummary').innerHTML = `<div class="movement-chip"><span>Total movement records</span><strong>${n(all.length, 0)}</strong></div><div class="movement-chip"><span>Stock received / added</span><strong>${n(totals.RECEIVE + totals.ADJUSTMENT_ADD)}</strong></div><div class="movement-chip"><span>Stock issued</span><strong>${n(totals.ISSUE)}</strong></div>`;
  const q = state.movementSearch.toLowerCase();
  const filtered = all.filter((m) => (!state.movementType || m.type === state.movementType) && (!q || [m.itemName, m.batchCode, m.type, m.reference, m.notes, m.policy].join(' ').toLowerCase().includes(q)));
  $('#movementTypeFilter').value = state.movementType;
  $('#movementCount').textContent = `${filtered.length} movement${filtered.length === 1 ? '' : 's'}`;
  const table = $('#movementsTable');
  if (!filtered.length) { table.innerHTML = `<tr><td colspan="6" class="empty-cell">No movement records found. Stock receipts and issues will appear here automatically.</td></tr>`; return; }
  table.innerHTML = filtered.slice(0, 300).map((m) => `<tr><td>${dateLabel(m.date)}</td><td><span class="movement-type ${esc(m.type)}">${esc(m.type.replaceAll('_', ' '))}</span></td><td><div class="item-copy"><strong>${esc(m.itemName || '—')}</strong><small>${esc(m.batchCode || '—')}</small></div></td><td><span class="movement-qty">${m.type === 'ISSUE' || m.type === 'ADJUSTMENT_REMOVE' || m.type === 'EXPIRED_WRITE_OFF' ? '−' : '+'}${n(m.quantity)} ${esc(m.unit)}</span></td><td>${esc(m.policy || '—')}</td><td><div class="item-copy"><strong>${esc(m.reference || '—')}</strong><small>${esc(m.notes || '—')}</small></div></td></tr>`).join('');
}
function renderReports() {
  const batches = activeBatches();
  const expired = batches.filter((b) => statusOf(b) === 'expired');
  const expiring = batches.filter((b) => statusOf(b) === 'expiring');
  const value = batches.reduce((sum, b) => sum + Number(b.quantity || 0) * Number(b.costPerUnit || 0), 0);
  $('#reportKpis').innerHTML = `<div class="report-kpi"><span>Items / batches</span><strong>${n(batches.length, 0)}</strong><small>${n(new Set(batches.map((b) => b.itemName.toLowerCase())).size, 0)} distinct item names</small></div><div class="report-kpi"><span>Physical stock on hand</span><strong>${n(sumQuantity(batches))}</strong><small>Across all active batches</small></div><div class="report-kpi"><span>Estimated stock value</span><strong>${esc(money(value))}</strong><small>Based on cost per unit entered</small></div><div class="report-kpi"><span>Movement records</span><strong>${n(state.movements.length, 0)}</strong><small>Receipts, issues and adjustments</small></div>`;
  const categoryMap = Object.create(null);
  batches.forEach((b) => { const name = b.category || 'Uncategorized'; categoryMap[name] = (categoryMap[name] || 0) + Number(b.quantity || 0); });
  $('#reportCategoryChart').innerHTML = categoryChartMarkup(categoryMap);
  const expRows = [
    { label: 'Expired', value: sumQuantity(expired), color: 'red' },
    { label: 'Expiring soon', value: sumQuantity(expiring), color: 'amber' },
    { label: 'Other stock', value: sumQuantity(batches.filter((b) => !['expired', 'expiring'].includes(statusOf(b)))), color: 'green' },
  ];
  const max = Math.max(1, ...expRows.map((r) => r.value));
  $('#expiryExposure').innerHTML = expRows.map((r) => `<div class="exposure-row"><span>${r.label}</span><span class="exposure-track"><span class="exposure-fill ${r.color}" style="width:${Math.max(r.value ? 2 : 0, r.value / max * 100)}%"></span></span><strong>${n(r.value)}</strong></div>`).join('') + `<p class="field-hint">The expiry alert window is currently ${n(state.settings.alertDays, 0)} days, inclusive of the expiry date.</p>`;
}
function renderSettings() { $('#alertDays').value = state.settings.alertDays ?? 7; }
function updateExpiryPreview() {
  const form = $('#batchForm');
  const received = form.elements.receivedDate.value;
  const expiry = form.elements.expiryDate.value;
  const panel = $('#expiryPreview');
  const strong = $('strong', panel);
  const span = $('span', panel);
  panel.classList.remove('warning', 'danger');
  if (!received || !expiry) {
    strong.textContent = 'Expiry preview';
    span.textContent = 'Enter the received and expiry dates to see how many days remain.';
    return;
  }
  if (expiry < received) {
    panel.classList.add('danger');
    strong.textContent = 'Check the dates';
    span.textContent = 'The expiry date is before the received date. Correct the dates before saving.';
    return;
  }
  if (received > todayISO()) {
    panel.classList.add('danger');
    strong.textContent = 'Check the received date';
    span.textContent = 'A stock batch already on hand cannot have a future received date.';
    return;
  }
  const remaining = dayDiff(expiry);
  if (remaining < 0) {
    panel.classList.add('danger');
    strong.textContent = expiryCountdownLabel(expiry);
    span.textContent = 'This batch can be recorded for tracking, but it will be excluded from automatic FEFO/FIFO issue. Review and write it off according to your local procedure.';
  } else if (remaining <= Number(state.settings.alertDays || 7)) {
    panel.classList.add('warning');
    strong.textContent = remaining === 0 ? 'Expiry date is today' : `Expires in ${remaining} day${remaining === 1 ? '' : 's'}`;
    span.textContent = `This batch will be flagged in the ${Number(state.settings.alertDays || 7)}-day expiry alert window and excluded from issue after its expiry date.`;
  } else {
    strong.textContent = `Expires in ${remaining} days`;
    span.textContent = `No expiry alert yet. Alerts begin ${Number(state.settings.alertDays || 7)} days before expiry; the current date rule keeps the batch eligible through its expiry date.`;
  }
}
function openBatchDialog(id = '') {
  const form = $('#batchForm');
  form.reset();
  form.elements.id.value = id;
  $('#batchFormError').textContent = '';
  const isEdit = Boolean(id);
  $('#batchDialogTitle').textContent = isEdit ? 'Edit batch details' : 'Add a new batch';
  $('#saveBatchButton').textContent = isEdit ? 'Save changes' : 'Save batch';
  const quantityLabel = form.elements.quantity.closest('.field-label');
  quantityLabel.hidden = isEdit;
  form.elements.quantity.disabled = isEdit;
  form.elements.receivedDate.value = todayISO();
  if (isEdit) {
    const batch = state.batches.find((b) => b.id === id);
    if (!batch) return showToast('Batch not found', 'Refresh the page and try again.', 'error');
    for (const field of ['batchCode', 'itemName', 'category', 'unit', 'receivedDate', 'expiryDate', 'supplier', 'costPerUnit', 'notes']) form.elements[field].value = batch[field] ?? '';
    form.elements.quantity.value = batch.quantity;
  } else {
    form.elements.expiryDate.value = '';
    form.elements.unit.value = 'kg';
    form.elements.costPerUnit.value = '0';
  }
  updateExpiryPreview();
  $('#batchDialog').showModal();
}
function openAdjustDialog(id, action = 'receive') {
  const batch = state.batches.find((b) => b.id === id && !b.archived);
  if (!batch) return showToast('Batch not found', 'Refresh the page and try again.', 'error');
  const form = $('#adjustForm');
  form.reset();
  form.elements.batchId.value = id;
  form.elements.quantity.value = '';
  form.elements.action.value = action;
  $('#adjustBatchDescription').textContent = `${batch.itemName} · ${batch.batchCode} · ${n(batch.quantity)} ${batch.unit} remaining.`;
  $('#adjustFormError').textContent = '';
  updateAdjustAction();
  $('#adjustDialog').showModal();
}
function updateAdjustAction() {
  const action = $('#adjustForm').elements.action.value;
  const submit = $('#adjustForm').querySelector('[type="submit"]');
  submit.textContent = action === 'receive' ? 'Add stock' : action === 'writeoff' ? 'Write off expired stock' : 'Remove stock';
  $('#adjustFormError').textContent = action === 'writeoff' ? 'Write-off is allowed only when the batch expiry date is before today.' : '';
}
function closeDialog(id) { const dialog = document.getElementById(id); if (dialog?.open) dialog.close(); }

// Navigation and delegated row actions.
document.addEventListener('click', async (event) => {
  const pageButton = event.target.closest('[data-page]');
  if (pageButton) { event.preventDefault(); showPage(pageButton.dataset.page); return; }
  const openButton = event.target.closest('[data-open-batch]');
  if (openButton || event.target.closest('#topAddBatch')) { openBatchDialog(); return; }
  const closeButton = event.target.closest('[data-close-dialog]');
  if (closeButton) { closeDialog(closeButton.dataset.closeDialog); return; }
  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
    const { action, id } = actionButton.dataset;
    if (action === 'edit') openBatchDialog(id);
    else if (action === 'adjust') openAdjustDialog(id);
    else if (action === 'writeoff') openAdjustDialog(id, 'writeoff');
    else if (action === 'archive' && confirm('Archive this zero-quantity batch? Its movement history will be retained.')) {
      try { await post(`/api/batches/${encodeURIComponent(id)}/archive`, {}); await refresh({ quiet: true }); showToast('Batch archived', 'Its movement records are still available.'); }
      catch (error) { showToast('Could not archive batch', error.message, 'error'); }
    }
    return;
  }
  if (event.target.closest('#quickExport')) { window.location.href = '/api/export/inventory.csv'; return; }
  if (event.target.closest('#clearFilters')) { state.search = ''; state.category = ''; state.status = ''; $('#inventorySearch').value = ''; renderInventory(); return; }
});

$('#mobileMenu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#inventorySearch').addEventListener('input', (e) => { state.search = e.target.value; renderInventory(); });
$('#categoryFilter').addEventListener('change', (e) => { state.category = e.target.value; renderInventory(); });
$('#statusFilter').addEventListener('change', (e) => { state.status = e.target.value; renderInventory(); });
$('#movementSearch').addEventListener('input', (e) => { state.movementSearch = e.target.value; renderMovements(); });
$('#movementTypeFilter').addEventListener('change', (e) => { state.movementType = e.target.value; renderMovements(); });
$('#issueItem').addEventListener('change', updateIssueAvailability);
$('#batchForm').elements.receivedDate.addEventListener('change', updateExpiryPreview);
$('#batchForm').elements.expiryDate.addEventListener('change', updateExpiryPreview);
$$('input[name="policy"]').forEach((input) => input.addEventListener('change', () => $$('.policy-option').forEach((label) => label.classList.toggle('selected', $('input', label).checked))));
$$('input[name="action"]', $('#adjustForm')).forEach((input) => input.addEventListener('change', updateAdjustAction));

$('#batchForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.elements.id.value;
  const payload = {};
  for (const field of ['batchCode', 'itemName', 'category', 'unit', 'receivedDate', 'expiryDate', 'supplier', 'costPerUnit', 'notes']) payload[field] = form.elements[field].value.trim();
  if (!id) payload.quantity = form.elements.quantity.value;
  else payload.costPerUnit = form.elements.costPerUnit.value || 0;
  try {
    if (id) await api(`/api/batches/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
    else await post('/api/batches', payload);
    closeDialog('batchDialog');
    await refresh({ quiet: true });
    showToast(id ? 'Batch details updated' : 'New batch recorded', `${expiryCountdownLabel(payload.expiryDate)}. ${id ? 'Stock quantity is unchanged; use Adjust to change stock.' : 'The initial receipt has been added to movement history.'}`);
  } catch (error) { $('#batchFormError').textContent = error.message; }
});

$('#adjustForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = { batchId: form.elements.batchId.value, action: form.elements.action.value, quantity: form.elements.quantity.value, notes: form.elements.notes.value.trim() };
  try {
    await post('/api/adjust', payload);
    closeDialog('adjustDialog');
    await refresh({ quiet: true });
    const label = payload.action === 'receive' ? 'Stock received' : payload.action === 'writeoff' ? 'Expired stock written off' : 'Stock adjusted';
    showToast(label, 'The batch quantity and movement log have been updated.');
  } catch (error) { $('#adjustFormError').textContent = error.message; }
});

$('#issueForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const selected = selectedIssueItem();
  if (!selected) return showToast('Choose an item', 'There is no eligible stock for the selected item.', 'warning');
  const form = event.currentTarget;
  const formData = new FormData(form);
  const payload = { ...selected, quantity: formData.get('quantity'), issueDate: formData.get('issueDate') || todayISO(), policy: formData.get('policy') || 'FEFO', reference: formData.get('reference') || '', notes: formData.get('notes') || '' };
  try {
    const result = await post('/api/issue', payload);
    renderAllocationResult(result, selected.unit);
    await refresh({ quiet: true });
    $('#issueQuantity').value = '';
    showToast('Stock issue recorded', `${n(result.fulfilled)} ${selected.unit} issued using ${result.policy}.`);
  } catch (error) { showToast('Issue not completed', error.message, 'error'); }
});
function renderAllocationResult(result, unit = 'units') {
  const hasShortfall = result.shortfall > 0;
  $('#issueResultPanel').innerHTML = `<div class="allocation-heading"><h3>Allocation result</h3><span class="status-pill ${hasShortfall ? 'expiring' : 'available'}">${hasShortfall ? 'Partial issue' : 'Completed'}</span></div><p class="result-success">${n(result.fulfilled)} of ${n(result.requested)} ${esc(unit)} recorded using ${esc(result.policy)}.</p>${result.allocations.map((a) => `<div class="allocation-row"><div><strong>${esc(a.itemName)}</strong><small>Batch ${esc(a.batchCode)} · Expiry ${dateLabel(a.expiryDate)}</small></div><span class="allocation-qty">${n(a.quantity)} ${esc(a.unit)}</span></div>`).join('')}<div class="allocation-summary"><div><span>Requested</span><strong>${n(result.requested)} ${esc(unit)}</strong></div><div><span>Issued</span><strong>${n(result.fulfilled)} ${esc(unit)}</strong></div><div><span>Shortfall</span><strong>${n(result.shortfall)} ${esc(unit)}</strong></div></div>${hasShortfall ? `<div class="shortfall-note">${n(result.shortfall)} requested ${esc(unit)} were not available in unexpired stock. The available quantity was issued and the shortfall is shown above.</div>` : ''}`;
}

$('#settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try { await post('/api/settings', { alertDays: Number($('#alertDays').value) }); await refresh({ quiet: true }); showToast('Preferences saved', `Expiry alerts are set to ${$('#alertDays').value} day(s).`); }
  catch (error) { showToast('Settings not saved', error.message, 'error'); }
});

$('#loadDemo').addEventListener('click', async () => {
  if (activeBatches().length) { showToast('Demo data requires an empty inventory', 'Your existing batches were not changed. Use demo data in a fresh workspace.', 'warning'); return; }
  try { const result = await post('/api/demo', {}); await refresh({ quiet: true }); showPage('overview'); showToast('Demo stock loaded', `${result.imported} sample batches added. These are fictional examples, not real stock.`); }
  catch (error) { showToast('Could not load demo data', error.message, 'error'); }
});
$('#csvImport').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) { showToast('CSV too large', 'Choose a CSV file smaller than 8 MB.', 'error'); event.target.value = ''; return; }
  try {
    const text = await file.text();
    const lines = parseCsvLocal(text);
    if (lines.length < 2) throw new Error('CSV must include a header row and at least one batch row.');
    const headers = lines[0].map((h) => h.trim());
    const rows = lines.slice(1).map((cells) => {
      const item = {};
      headers.forEach((header, index) => { item[header] = cells[index] ?? ''; });
      return normalizeCsvRow(item);
    });
    const result = await post('/api/import', { rows });
    await refresh({ quiet: true });
    const details = result.errors.slice(0, 3).map((e) => `Row ${e.row}: ${e.errors.join(' ')}`).join(' · ');
    showToast(`CSV import complete: ${result.imported} added`, `${result.skipped} row(s) skipped.${details ? ` ${details}` : ''}`, result.skipped ? 'warning' : 'success');
    if (result.errors.length > 3) showToast('More import issues', `${result.errors.length - 3} additional skipped row(s). Check and correct the CSV, then import again.`, 'warning');
    showPage('inventory');
  } catch (error) { showToast('CSV import failed', error.message, 'error'); }
  finally { event.target.value = ''; }
});
function parseCsvLocal(input) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  input = String(input).replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.length === 0) quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (quoted) throw new Error('CSV contains an unclosed quotation mark.');
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}
function normalizeCsvRow(source) {
  const aliases = { batchcode: 'batchCode', 'batch id': 'batchCode', batch_id: 'batchCode', batch: 'batchCode', itemname: 'itemName', 'item name': 'itemName', item: 'itemName', product: 'itemName', category: 'category', quantity: 'quantity', qty: 'quantity', unit: 'unit', receiveddate: 'receivedDate', 'received date': 'receivedDate', received_date: 'receivedDate', expirydate: 'expiryDate', 'expiry date': 'expiryDate', expiry_date: 'expiryDate', supplier: 'supplier', costperunit: 'costPerUnit', 'cost per unit': 'costPerUnit', cost_per_unit: 'costPerUnit', notes: 'notes' };
  const result = {};
  Object.entries(source).forEach(([key, value]) => { const compact = key.trim().toLowerCase().replace(/\s+/g, ' '); const compactNoSpaces = compact.replace(/ /g, ''); const target = (Object.hasOwn(aliases, compact) ? aliases[compact] : undefined) || (Object.hasOwn(aliases, compactNoSpaces) ? aliases[compactNoSpaces] : undefined); if (target) result[target] = value; });
  return result;
}

$('#downloadTemplate').addEventListener('click', () => {
  const exampleReceived = todayISO();
  const exampleExpiry = addDays(exampleReceived, 180);
  const csv = `batchCode,itemName,category,quantity,unit,receivedDate,expiryDate,supplier,costPerUnit,notes\nRICE-EXAMPLE,Basmati Rice,Grains,25,kg,${exampleReceived},${exampleExpiry},Example Supplier,72,Replace this sample with your stock\n`;
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'freshtrack-import-template.csv'; a.click(); URL.revokeObjectURL(url);
});
$('#downloadPreviousBackup').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/backup/previous');
    if (!response.ok) {
      let payload = {};
      try { payload = await response.json(); } catch {}
      throw new Error(payload.error || `Request failed (${response.status}).`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `freshtrack-previous-snapshot-${todayISO()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Previous snapshot downloaded', 'Use Restore from backup if you need to restore the previous saved inventory.');
  } catch (error) { showToast('No previous snapshot downloaded', error.message, 'warning'); }
});
$('#restoreButton').addEventListener('click', async () => {
  const file = $('#restoreFile').files?.[0];
  if (!file) return showToast('Choose a backup file', 'Select a FreshTrack JSON backup first.', 'warning');
  if (file.size > 10 * 1024 * 1024) return showToast('Backup too large', 'Choose a backup smaller than 10 MB.', 'error');
  if (!confirm('Restore will replace your current inventory, movement history and alert settings. Download a backup first. Continue?')) return;
  try {
    const json = JSON.parse(await file.text());
    const result = await post('/api/restore', json);
    await refresh({ quiet: true });
    $('#restoreFile').value = '';
    showToast('Backup restored', `${result.restored.batches} batch records and ${result.restored.movements} movements loaded.`);
  } catch (error) { showToast('Restore failed', error.message, 'error'); }
});
$('#printReport').addEventListener('click', () => { showPage('reports'); window.print(); });

// Dialog backdrop/escape support and keyboard-safe closure.
$$('dialog').forEach((dialog) => {
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { const form = dialog.querySelector('form'); if (form) form.querySelectorAll('.dialog-message').forEach((msg) => { msg.textContent = ''; }); });
});

(async function init() {
  $('#issueDate').value = todayISO();
  lastObservedDate = todayISO();
  const ok = await refresh();
  if (!ok) {
    $('#metricGrid').innerHTML = `<div class="panel" style="padding:20px;grid-column:1/-1"><strong>Inventory data could not be loaded.</strong><p class="subheading">Check that FreshTrack is running. If the server is reachable but the inventory file is damaged, use Settings &amp; backup to restore the previous automatic snapshot or a downloaded FreshTrack JSON backup.</p></div>`;
  }
})();

// Recalculate expiry labels after the computer's local date changes, even if the tab stays open overnight.
setInterval(async () => {
  const observed = todayISO();
  if (observed === lastObservedDate) return;
  $('#issueDate').value = observed;
  const updated = await refresh({ quiet: true });
  if (updated) {
    lastObservedDate = observed;
    showToast('Expiry status refreshed', `Inventory alerts now reflect ${dateLabel(observed)}.`);
  }
}, 60_000);