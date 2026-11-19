// ============================================================
// GO BARISHAL ADMIN CRM — SUPABASE & STARADMIN ENGINE
// ============================================================
const SUPABASE_URL = 'https://bgtauxcgptxddbtbaxmx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IZXzzBSjZzbFrqxnhhus9g_9myHECV8';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const sb = db;

let allDrivers = [];
let allProfilesMap = {};
let activeTab = 'dashboard';
let barChartObj = null;
let doughnutChartObj = null;
let lineChartObj = null;
let fleetMap = null;
let fleetLayer = null;
let mapTimer = null;

// Toast Notification
function showToast(msg) {
  const box = document.getElementById('toast-container');
  const item = document.createElement('div');
  item.className = 'toast';
  item.textContent = msg;
  box.appendChild(item);
  setTimeout(() => item.remove(), 3500);
}
function showTableLoader(tbodyId, colSpan, label = 'ডাটা লোড হচ্ছে...') {
  const el = document.getElementById(tbodyId);
  if (!el) return;
  el.innerHTML = `
    <tr>
      <td colspan="${colSpan}">
        <div class="table-loader-box">
          <div class="sa-spinner"></div>
          <span>${label}</span>
        </div>
      </td>
    </tr>
  `;
}
// ============================================================
// 1. AUTHENTICATION & ADMIN ROLE GUARD
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const dateChip = document.getElementById('today-date-chip');
  if (dateChip) dateChip.textContent = new Date().toLocaleDateString('en-GB');
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    await verifyAdminSession(session.user.id);
  }
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  // ১. পরপর ৩ বার ভুল পাসওয়ার্ড দিলে ৫ মিনিট লগইন লক
  const lockUntil = Number(localStorage.getItem('gb_login_lock_until') || 0);
  if (Date.now() < lockUntil) {
    const minsLeft = Math.ceil((lockUntil - Date.now()) / 60000);
    errBox.textContent = `নিরাপত্তাজনিত কারণে লগইন লক করা হয়েছে। ${minsLeft} মিনিট পর আবার চেষ্টা করুন।`;
    errBox.classList.remove('hidden');
    return;
  }

  // ২. লুকানো বট-ট্র্যাপ চেক
  const trap = document.getElementById('bot-trap');
  if (trap && trap.value !== '') return;

  // ৩. Cloudflare Turnstile CAPTCHA টোকেন চেক
  const captchaToken = document.querySelector('[name="cf-turnstile-response"]')?.value;
  if (!captchaToken) {
    errBox.textContent = 'অনুগ্রহ করে নিচের নিরাপত্তা যাচাই (CAPTCHA) সম্পন্ন করুন।';
    errBox.classList.remove('hidden');
    return;
  }

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  errBox.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'যাচাই করা হচ্ছে...';

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken }
  });

  if (window.turnstile) turnstile.reset();
  btn.disabled = false;
  btn.textContent = 'সাইন ইন করুন';

  if (error) {
    const attempts = Number(localStorage.getItem('gb_failed_attempts') || 0) + 1;
    localStorage.setItem('gb_failed_attempts', attempts);

    if (attempts >= 3) {
      localStorage.setItem('gb_login_lock_until', Date.now() + 5 * 60 * 1000);
      localStorage.setItem('gb_failed_attempts', '0');
      errBox.textContent = 'পরপর ৩ বার ভুল পাসওয়ার্ড দেওয়ায় ৫ মিনিটের জন্য লগইন বন্ধ করা হয়েছে!';
    } else {
      errBox.textContent = `লগইন ব্যর্থ (${attempts}/3): ${error.message}`;
    }
    errBox.classList.remove('hidden');
    return;
  }

  localStorage.removeItem('gb_failed_attempts');
  localStorage.removeItem('gb_login_lock_until');
  await verifyAdminSession(data.user.id);
});

async function verifyAdminSession(userId) {
  const errBox = document.getElementById('login-error');
  const { data: profile, error } = await db
    .from('profiles')
    .select('role, full_name')
    .eq('id', userId)
    .single();

  if (error || !profile || profile.role !== 'admin') {
    await db.auth.signOut();
    errBox.textContent = 'Access Denied: Admin privileges required';
    errBox.classList.remove('hidden');
    return;
  }

  document.getElementById('admin-name-display').textContent = profile.full_name || 'Admin';
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');

  initSidebarEvents();
  await cacheProfiles();
  await loadDashboard();
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await db.auth.signOut();
  location.reload();
});

// ============================================================
// 2. NAVIGATION & TAB ROUTING
// ============================================================
function initSidebarEvents() {
  const sidebar = document.getElementById('sidebar');
  document.getElementById('menu-toggle').addEventListener('click', () => sidebar.classList.toggle('open'));
  document.getElementById('sidebar-close').addEventListener('click', () => sidebar.classList.remove('open'));

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabName) {
  activeTab = tabName;
  document.getElementById('sidebar').classList.remove('open');

  document.querySelectorAll('.nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-view').forEach((v) => v.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');

  refreshCurrentTab();
}

function refreshCurrentTab() {
  if (activeTab === 'promotions') loadPromotionsAndAds();
  if (activeTab === 'dashboard') loadDashboard();
  if (activeTab === 'map') initOrRefreshMap();
  if (activeTab === 'drivers') loadDrivers();
  if (activeTab === 'payments') loadPayments();
  if (activeTab === 'rides') loadRides();
  if (activeTab === 'passengers') loadPassengersAndReports();
  if (activeTab === 'settings') loadSettings();
}

async function cacheProfiles() {
  const { data } = await db.from('profiles').select('id, full_name, phone, role, status');
  allProfilesMap = {};
  (data || []).forEach((p) => { allProfilesMap[p.id] = p; });
}

// ============================================================
// 3. DASHBOARD OVERVIEW & STARADMIN CHARTS
// ============================================================
async function loadDashboard() {
  await cacheProfiles();
  const [ridesRes, driversRes, paymentsRes] = await Promise.all([
    db.from('rides').select('*').order('created_at', { ascending: false }),
    db.from('drivers').select('*'),
    db.from('payments').select('amount, status')
  ]);

  const rides = ridesRes.data || [];
  const drivers = driversRes.data || [];
  const payments = paymentsRes.data || [];

  const completedRides = rides.filter((r) => r.status === 'completed');
  const onlineDrivers = drivers.filter((d) => d.is_online);

  const bikeTotal = drivers.filter((d) => d.vehicle_type === 'bike').length;
  const cngTotal = drivers.filter((d) => d.vehicle_type === 'cng').length;
  const carTotal = drivers.filter((d) => d.vehicle_type === 'car').length;

  const bikeOnline = onlineDrivers.filter((d) => d.vehicle_type === 'bike').length;
  const cngOnline = onlineDrivers.filter((d) => d.vehicle_type === 'cng').length;
  const carOnline = onlineDrivers.filter((d) => d.vehicle_type === 'car').length;

  const pendingPayCount = payments.filter((p) => p.status === 'pending').length;
  const passRevenue = payments
    .filter((p) => p.status === 'approved')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalGmv = completedRides.reduce((sum, r) => sum + Number(r.final_fare || r.offered_fare || 0), 0);

  document.getElementById('kpi-total-rides').textContent = rides.length;
  document.getElementById('kpi-completed-rides').textContent = completedRides.length;
  document.getElementById('kpi-online-drivers').textContent = onlineDrivers.length;
  document.getElementById('kpi-driver-breakdown').textContent = `Bike: ${bikeOnline} | CNG: ${cngOnline} | Car: ${carOnline}`;
  document.getElementById('kpi-pending-payments').textContent = pendingPayCount;
  document.getElementById('kpi-revenue').textContent = `৳${passRevenue.toLocaleString()}`;
  document.getElementById('kpi-gmv').textContent = `৳${totalGmv.toLocaleString()}`;

  const badge = document.getElementById('pending-badge');
  const bellDot = document.getElementById('bell-dot');
  if (pendingPayCount > 0) {
    badge.textContent = pendingPayCount;
    badge.classList.remove('hidden');
    bellDot.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
    bellDot.classList.add('hidden');
  }

  renderStarAdminCharts(completedRides, bikeTotal, cngTotal, carTotal);
  renderTopPerformers(drivers);
}

function renderStarAdminCharts(completedRides, bikeCnt, cngCnt, carCnt) {
  const labels = [];
  const counts = [];
  const gmvData = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const isoDay = d.toISOString().split('T')[0];
    labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));

    const dayTrips = completedRides.filter((r) => r.created_at && r.created_at.startsWith(isoDay));
    counts.push(dayTrips.length);
    gmvData.push(dayTrips.reduce((s, r) => s + Number(r.final_fare || r.offered_fare || 0), 0));
  }

  const barCtx = document.getElementById('ridesBarChart').getContext('2d');
  if (barChartObj) barChartObj.destroy();
  barChartObj = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Completed Rides',
        data: counts,
        backgroundColor: '#1F3BB3',
        borderRadius: 6,
        barThickness: 24
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, border: { display: false } }
      }
    }
  });

  const doughCtx = document.getElementById('fleetDoughnutChart').getContext('2d');
  if (doughnutChartObj) doughnutChartObj.destroy();
  const totalFleet = bikeCnt + cngCnt + carCnt || 1;
  doughnutChartObj = new Chart(doughCtx, {
    type: 'doughnut',
    data: {
      labels: ['Bike', 'CNG', 'Car'],
      datasets: [{
        data: [bikeCnt, cngCnt, carCnt],
        backgroundColor: ['#1F3BB3', '#38BDF8', '#2DD4BF'],
        borderWidth: 0
      }]
    },
    options: {
      cutout: '68%',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });

  document.getElementById('fleet-legend').innerHTML = `
    <div class="legend-row"><span class="legend-dot" style="background:#1F3BB3"></span> Bike (${Math.round((bikeCnt / totalFleet) * 100)}%) — ${bikeCnt}</div>
    <div class="legend-row"><span class="legend-dot" style="background:#38BDF8"></span> CNG (${Math.round((cngCnt / totalFleet) * 100)}%) — ${cngCnt}</div>
    <div class="legend-row"><span class="legend-dot" style="background:#2DD4BF"></span> Car (${Math.round((carCnt / totalFleet) * 100)}%) — ${carCnt}</div>
  `;

  const lineCtx = document.getElementById('gmvLineChart').getContext('2d');
  if (lineChartObj) lineChartObj.destroy();
  lineChartObj = new Chart(lineCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Trip Fare GMV (৳)',
        data: gmvData,
        borderColor: '#1F3BB3',
        backgroundColor: 'rgba(31, 59, 179, 0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#1F3BB3'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true }
      }
    }
  });
}

function renderTopPerformers(drivers) {
  const sorted = [...drivers].sort((a, b) => (b.total_rides || 0) - (a.total_rides || 0)).slice(0, 4);
  const el = document.getElementById('top-performers-list');
  el.innerHTML = sorted.map((d) => {
    const prof = allProfilesMap[d.user_id] || allProfilesMap[d.id] || {};
    const name = prof.full_name || 'Rider';
    return `
      <div class="performer-row">
        <div class="perf-left">
          <div class="perf-avatar">${name.charAt(0).toUpperCase()}</div>
          <div>
            <div class="perf-name">${name}</div>
            <div class="perf-sub">${(d.vehicle_type || '').toUpperCase()} • ${d.vehicle_number || 'N/A'}</div>
          </div>
        </div>
        <div style="text-align:right">
          <strong>${d.total_rides || 0} Rides</strong>
          <div class="perf-sub">৳${d.total_earnings || 0}</div>
        </div>
      </div>
    `;
  }).join('') || '<p class="muted-text">কোনো ড্রাইভার ডাটা নেই।</p>';
}

// ============================================================
// 4. LIVE BARISHAL FLEET MAP
// ============================================================
function initOrRefreshMap() {
  if (!fleetMap) {
    fleetMap = L.map('barishal-map').setView([22.7010, 90.3535], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(fleetMap);
    fleetLayer = L.layerGroup().addTo(fleetMap);
  }
  setTimeout(() => fleetMap.invalidateSize(), 200);
  refreshMapData();

  if (mapTimer) clearInterval(mapTimer);
  mapTimer = setInterval(() => {
    if (activeTab === 'map' && document.getElementById('auto-refresh-map').checked) {
      refreshMapData();
    }
  }, 5000);
}

async function refreshMapData() {
  await cacheProfiles();
  const [drvRes, rideRes] = await Promise.all([
    db.from('drivers').select('*').eq('is_online', true),
    db.from('rides').select('*').in('status', ['searching', 'accepted', 'arrived', 'ongoing'])
  ]);

  fleetLayer.clearLayers();
  const palette = { bike: '#16A34A', cng: '#D97706', car: '#1F3BB3' };

  (drvRes.data || []).forEach((d) => {
    if (!d.lat || !d.lng) return;
    const prof = allProfilesMap[d.user_id] || allProfilesMap[d.id] || {};
    L.circleMarker([d.lat, d.lng], {
      radius: 9,
      fillColor: palette[d.vehicle_type] || '#1F3BB3',
      color: '#fff',
      weight: 2,
      fillOpacity: 0.92
    }).bindPopup(`
      <strong>${prof.full_name || 'Rider'}</strong> (${(d.vehicle_type || '').toUpperCase()})<br/>
      ফোন: ${prof.phone || 'N/A'}<br/>
      গাড়ি: ${d.vehicle_number || 'N/A'}<br/>
      সর্বশেষ আপডেট: ${d.last_heartbeat_at ? new Date(d.last_heartbeat_at).toLocaleTimeString() : 'N/A'}
    `).addTo(fleetLayer);
  });

  (rideRes.data || []).forEach((r) => {
    if (r.pickup_lat && r.pickup_lng) {
      L.marker([r.pickup_lat, r.pickup_lng])
        .bindPopup(`<strong>রাইড (${r.status})</strong><br/>পিকআপ: ${r.pickup_area || r.pickup_text}<br/>যাত্রী: ${r.passenger_name || 'N/A'}`)
        .addTo(fleetLayer);
    }
  });
}

// ============================================================
// 5. DRIVER MANAGEMENT
// ============================================================
async function loadDrivers() {
  await cacheProfiles();
  const { data, error } = await db.from('drivers').select('*').order('created_at', { ascending: false });
  if (error) return showToast('ড্রাইভার লোড ব্যর্থ হয়েছে: ' + error.message);
  allDrivers = data || [];
  renderDriversTable();
}

function renderDriversTable() {
  const q = document.getElementById('driver-search').value.toLowerCase();
  const filter = document.getElementById('driver-filter').value;
  const now = new Date();

  const rows = allDrivers.filter((d) => {
    const prof = allProfilesMap[d.user_id] || allProfilesMap[d.id] || {};
    const hay = `${prof.full_name || ''} ${prof.phone || ''} ${d.vehicle_number || ''}`.toLowerCase();
    if (q && !hay.includes(q)) return false;

    const expired = !d.package_expires_at || new Date(d.package_expires_at) < now;
    if (filter === 'online') return d.is_online;
    if (filter === 'approved') return d.status === 'approved';
    if (filter === 'pending') return d.status === 'pending';
    if (filter === 'suspended') return d.status === 'suspended';
    if (filter === 'expired') return expired;
    return true;
  });

  document.getElementById('drivers-tbody').innerHTML = rows.map((d) => {
    const prof = allProfilesMap[d.user_id] || allProfilesMap[d.id] || {};
    const exp = d.package_expires_at ? new Date(d.package_expires_at) : null;
    const validPass = exp && exp > now;

    return `
      <tr>
        <td><strong>${prof.full_name || 'N/A'}</strong> ${d.is_online ? '🟢' : '⚪'}<br/><span class="muted-text">${prof.phone || ''}</span></td>
        <td><span class="status-badge sb-blue">${(d.vehicle_type || '').toUpperCase()}</span><br/>${d.vehicle_model || ''} (${d.vehicle_number || 'N/A'})</td>
        <td>⭐ ${Number(d.rating_avg || 0).toFixed(1)} (${d.rating_count || 0})<br/><span class="muted-text">${d.total_rides || 0} রাইড • ৳${d.total_earnings || 0}</span></td>
        <td><strong>${d.free_rides_left ?? 0}</strong></td>
        <td><span class="status-badge ${validPass ? 'sb-green' : 'sb-red'}">${validPass ? exp.toLocaleDateString() : 'Expired'}</span></td>
        <td><span class="status-badge ${d.status === 'approved' ? 'sb-green' : 'sb-amber'}">${d.status}</span></td>
        <td>
          <div class="btn-row">
            <button class="btn btn-sm ${d.status === 'approved' ? 'btn-danger' : 'btn-success'}"
              onclick="setDriverStatus('${d.id}', '${d.status === 'approved' ? 'suspended' : 'approved'}')">
              ${d.status === 'approved' ? 'Suspend' : 'Approve'}
            </button>
            <button class="btn btn-sm btn-royal" onclick="grantWeeklyPass('${d.id}', '${d.package_expires_at || ''}')">+7 Days</button>
            <button class="btn btn-sm btn-white" onclick="updateFreeRides('${d.id}', ${d.free_rides_left ?? 0})">Free Rides</button>
            <button class="btn btn-sm btn-white" onclick="openResetModalForUser('${d.user_id || d.id}', '${(prof.full_name || '').replace(/'/g, '')}', 'driver', '${prof.phone || ''}')">🔑 Reset Pass</button>
          </div>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="7">কোনো ড্রাইভার পাওয়া যায়নি।</td></tr>';
}

async function setDriverStatus(driverId, status) {
  const { error } = await db.from('drivers').update({ status }).eq('id', driverId);
  if (error) return showToast('আপডেট ব্যর্থ হয়েছে');
  showToast(`ড্রাইভার স্ট্যাটাস ${status} করা হয়েছে`);
  loadDrivers();
}

async function grantWeeklyPass(driverId, currentExp) {
  const base = currentExp && new Date(currentExp) > new Date() ? new Date(currentExp) : new Date();
  base.setDate(base.getDate() + 7);
  const { error } = await db.from('drivers').update({ package_expires_at: base.toISOString(), status: 'approved' }).eq('id', driverId);
  if (error) return showToast('প্যাকেজ যোগ করা যায়নি');
  showToast('+৭ দিনের আনলিমিটেড পাস যুক্ত হয়েছে!');
  loadDrivers();
}

async function updateFreeRides(driverId, current) {
  const val = prompt('নতুন ফ্রি রাইড সংখ্যা দিন:', current);
  if (val === null || isNaN(val)) return;
  const { error } = await db.from('drivers').update({ free_rides_left: parseInt(val, 10) }).eq('id', driverId);
  if (error) return showToast('আপডেট ব্যর্থ হয়েছে');
  showToast('ফ্রি রাইড আপডেট হয়েছে');
  loadDrivers();
}

// ============================================================
// 6. BKASH WEEKLY PASS VERIFICATION (RPC)
// ============================================================
async function loadPayments() {
  await cacheProfiles();
  const [payRes, drvRes] = await Promise.all([
    db.from('payments').select('*').order('submitted_at', { ascending: false }),
    db.from('drivers').select('id, user_id')
  ]);

  const drvUserMap = {};
  (drvRes.data || []).forEach((d) => { drvUserMap[d.id] = d.user_id; });

  const sorted = (payRes.data || []).sort((a, b) => (a.status === 'pending' ? -1 : 1));
  document.getElementById('payments-tbody').innerHTML = sorted.map((p) => {
    const uid = drvUserMap[p.driver_id] || p.driver_id;
    const prof = allProfilesMap[uid] || {};
    const cls = p.status === 'approved' ? 'sb-green' : p.status === 'rejected' ? 'sb-red' : 'sb-amber';

    return `
      <tr>
        <td>${p.submitted_at ? new Date(p.submitted_at).toLocaleString() : 'N/A'}</td>
        <td><strong>${prof.full_name || 'Rider'}</strong><br/><span class="muted-text">${prof.phone || ''}</span></td>
        <td><strong>৳${p.amount || 150}</strong></td>
        <td>
          <span class="trx-chip">${p.bkash_trx_id || 'N/A'}
            <button class="btn btn-sm btn-white" onclick="copyTrx('${p.bkash_trx_id}')">Copy</button>
          </span>
        </td>
        <td><span class="status-badge ${cls}">${p.status}</span></td>
        <td>
          ${p.status === 'pending' ? `
            <div class="btn-row">
              <button class="btn btn-sm btn-success" onclick="approvePaymentRpc('${p.id}', 'approved')">Approve (+7d)</button>
              <button class="btn btn-sm btn-danger" onclick="approvePaymentRpc('${p.id}', 'rejected')">Reject</button>
            </div>
          ` : '—'}
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="6">কোনো পেমেন্ট রেকর্ড নেই।</td></tr>';
}

function copyTrx(trx) {
  navigator.clipboard.writeText(trx);
  showToast('TrxID কপি হয়েছে: ' + trx);
}

async function approvePaymentRpc(paymentId, decision) {
  if (!confirm(`আপনি কি পেমেন্টটি ${decision} করতে চান?`)) return;
  const { data, error } = await db.rpc('admin_approve_payment', {
    p_payment_id: paymentId,
    p_decision: decision
  });

  if (error || (data && data.success === false)) {
    return showToast('ত্রুটি: ' + (error?.message || data?.message));
  }
  showToast(`পেমেন্ট ${decision} হয়েছে!`);
  loadPayments();
  loadDashboard();
}

// ============================================================
// 7. RIDES & DISPATCH MONITOR
// ============================================================
async function loadRides() {
  await cacheProfiles();
  const status = document.getElementById('ride-status-filter').value;
  let query = db.from('rides').select('*').order('created_at', { ascending: false }).limit(100);
  if (status !== 'all') query = query.eq('status', status);

  const [ridesRes, drvRes] = await Promise.all([query, db.from('drivers').select('id, user_id')]);
  const drvUserMap = {};
  (drvRes.data || []).forEach((d) => { drvUserMap[d.id] = d.user_id; });

  document.getElementById('rides-tbody').innerHTML = (ridesRes.data || []).map((r) => {
    const drvUid = drvUserMap[r.driver_id] || r.driver_id;
    const drvProf = allProfilesMap[drvUid] || {};
    const ongoing = ['searching', 'accepted', 'arrived', 'ongoing'].includes(r.status);

    return `
      <tr>
        <td><strong>${r.pickup_area || r.pickup_text || ''}</strong> → <strong>${r.drop_area || r.drop_text || ''}</strong><br/><span class="muted-text">${new Date(r.created_at).toLocaleString()}</span></td>
        <td>${r.distance_km || 0} km<br/><strong>৳${r.final_fare || r.offered_fare || 0}</strong></td>
        <td><code>${r.otp || '—'}</code></td>
        <td>${r.passenger_name || 'N/A'}<br/><span class="muted-text">${r.passenger_phone || ''}</span></td>
        <td>${drvProf.full_name || 'Unassigned'}<br/><span class="muted-text">${drvProf.phone || ''}</span></td>
        <td><span class="status-badge sb-blue">${r.status}</span> ${r.rating ? `<br/><small>⭐ ${r.rating}</small>` : ''}</td>
        <td>
          ${ongoing ? `
            <div class="btn-row">
              <button class="btn btn-sm btn-success" onclick="forceRideStatus('${r.id}', '${r.driver_id || ''}', 'completed')">Complete</button>
              <button class="btn btn-sm btn-danger" onclick="forceRideStatus('${r.id}', '${r.driver_id || ''}', 'cancelled')">Cancel</button>
            </div>
          ` : '—'}
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="7">কোনো রাইড পাওয়া যায়নি।</td></tr>';
}

async function forceRideStatus(rideId, driverId, newStatus) {
  if (!confirm(`রাইডটি ${newStatus} করতে চান?`)) return;
  const payload = { status: newStatus };
  if (newStatus === 'completed') payload.completed_at = new Date().toISOString();
  if (newStatus === 'cancelled') payload.cancel_reason = 'Cancelled by Admin';

  await db.from('rides').update(payload).eq('id', rideId);
  if (driverId) await db.from('drivers').update({ active_ride_id: null }).eq('id', driverId);
  showToast(`রাইড ${newStatus} করা হয়েছে`);
  loadRides();
}

// ============================================================
// 8. PASSENGERS & INCIDENT REPORTS
// ============================================================
function togglePassReport(type) {
  document.getElementById('view-passengers').classList.toggle('hidden', type !== 'passengers');
  document.getElementById('view-reports').classList.toggle('hidden', type !== 'reports');
}

async function loadPassengersAndReports() {
  const [profRes, ridesRes, repRes] = await Promise.all([
    db.from('profiles').select('*').eq('role', 'passenger'),
    db.from('rides').select('passenger_id'),
    db.from('reports').select('*').order('created_at', { ascending: false })
  ]);

  const counts = {};
  (ridesRes.data || []).forEach((r) => { counts[r.passenger_id] = (counts[r.passenger_id] || 0) + 1; });

  document.getElementById('passengers-tbody').innerHTML = (profRes.data || []).map((p) => `
    <tr>
      <td><strong>${p.full_name || 'N/A'}</strong></td>
      <td>${p.phone || 'N/A'}</td>
      <td>${counts[p.id] || 0} টি রাইড</td>
      <td>
        <span class="status-badge sb-green">${p.status || 'active'}</span>
        <button class="btn btn-sm btn-white" style="margin-left:8px"
          onclick="openResetModalForUser('${p.id}', '${(p.full_name || '').replace(/'/g, '')}', 'passenger', '${p.phone || ''}')">
          🔑 Reset Pass
        </button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4">কোনো যাত্রী পাওয়া যায়নি।</td></tr>';

  document.getElementById('reports-tbody').innerHTML = (repRes.data || []).map((rep) => `
    <tr>
      <td>${rep.created_at ? new Date(rep.created_at).toLocaleString() : 'N/A'}</td>
      <td><span class="status-badge sb-red">${rep.report_type || 'Report'}</span></td>
      <td><strong>${rep.reason || ''}</strong><br/><span class="muted-text">${rep.details || ''}</span></td>
      <td><code>${rep.ride_id || '—'}</code></td>
      <td><code>${rep.driver_id || '—'}</code></td>
    </tr>
  `).join('') || '<tr><td colspan="5">কোনো অভিযোগ রিপোর্ট নেই।</td></tr>';
}

// ============================================================
// 9. FARE & APP SETTINGS (Synced with public_settings)
// ============================================================
async function loadSettings() {
  const { data, error } = await db.from('public_settings').select('*').eq('id', 1).single();
  if (error || !data) return showToast('সেটিংস লোড ব্যর্থ হয়েছে: ' + (error?.message || ''));

  document.getElementById('set-bike-base').value = data.bike_base_fare ?? 25;
  document.getElementById('set-bike-km').value = data.bike_per_km ?? 10;
  document.getElementById('set-bike-min').value = data.bike_min_fare ?? 30;

  document.getElementById('set-cng-base').value = data.cng_base_fare ?? 50;
  document.getElementById('set-cng-km').value = data.cng_per_km ?? 18;
  document.getElementById('set-cng-min').value = data.cng_min_fare ?? 60;

  document.getElementById('set-car-base').value = data.car_base_fare ?? 120;
  document.getElementById('set-car-km').value = data.car_per_km ?? 30;
  document.getElementById('set-car-min').value = data.car_min_fare ?? 150;

  document.getElementById('set-weekly-price').value = data.weekly_pass_price ?? 150;
  document.getElementById('set-bkash-num').value = data.bkash_number || '';
  document.getElementById('set-support-phone').value = data.support_phone || '09638306861';
}

document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    id: 1,
    bike_base_fare: parseFloat(document.getElementById('set-bike-base').value),
    bike_per_km: parseFloat(document.getElementById('set-bike-km').value),
    bike_min_fare: parseFloat(document.getElementById('set-bike-min').value),
    cng_base_fare: parseFloat(document.getElementById('set-cng-base').value),
    cng_per_km: parseFloat(document.getElementById('set-cng-km').value),
    cng_min_fare: parseFloat(document.getElementById('set-cng-min').value),
    car_base_fare: parseFloat(document.getElementById('set-car-base').value),
    car_per_km: parseFloat(document.getElementById('set-car-km').value),
    car_min_fare: parseFloat(document.getElementById('set-car-min').value),
    weekly_pass_price: parseFloat(document.getElementById('set-weekly-price').value),
    bkash_number: document.getElementById('set-bkash-num').value.trim(),
    support_phone: document.getElementById('set-support-phone').value.trim(),
    updated_at: new Date().toISOString()
  };

  const { error } = await db.from('public_settings').upsert(payload);
  if (error) return showToast('সেভ ব্যর্থ: ' + error.message);
  showToast('ভাড়া ও বিকাশ নম্বর সফলভাবে সেভ হয়েছে!');
});

// ============================================================
// 10. ID LOOKUP & PASSWORD RESET MODAL (RPC)
// ============================================================
function openResetModal() {
  document.getElementById('reset-phone-input').value = '';
  document.getElementById('reset-new-pass').value = '';
  document.getElementById('reset-user-box').classList.add('hidden');
  document.getElementById('reset-modal').classList.remove('hidden');
}

function closeResetModal() {
  document.getElementById('reset-modal').classList.add('hidden');
}

async function openResetModalForUser(userId, fullName, role, phone) {
  openResetModal();
  document.getElementById('reset-phone-input').value = phone || '';
  document.getElementById('reset-target-uid').value = userId;
  document.getElementById('reset-user-name').textContent = fullName || 'User';
  document.getElementById('reset-user-role').textContent = role;
  document.getElementById('reset-user-email').textContent = 'ইমেইল লোড হচ্ছে...';
  document.getElementById('reset-user-box').classList.remove('hidden');

  if (phone) {
    await findUserByPhone(phone);
  }
}

async function findUserByPhone(prefillPhone) {
  const p_phone = (prefillPhone || document.getElementById('reset-phone-input').value).trim();
  if (!p_phone) return showToast('ফোন নম্বর লিখুন');

  const { data, error } = await sb.rpc('admin_find_user_by_phone', { p_phone });
  if (error || !data) {
    return showToast('ইউজার পাওয়া যায়নি: ' + (error?.message || 'Not found'));
  }

  const user = Array.isArray(data) ? data[0] : data;
  if (!user || (!user.user_id && !user.id && !user.email)) {
    return showToast('এই ফোন নম্বরে কোনো অ্যাকাউন্ট নেই');
  }

  document.getElementById('reset-target-uid').value = user.user_id || user.id;
  document.getElementById('reset-user-name').textContent = user.full_name || 'N/A';
  document.getElementById('reset-user-role').textContent = user.role || 'user';
  document.getElementById('reset-user-email').textContent = user.email || 'N/A';
  document.getElementById('reset-user-box').classList.remove('hidden');
}

function copyResetEmail() {
  const email = document.getElementById('reset-user-email').textContent;
  navigator.clipboard.writeText(email);
  showToast('Login Email কপি হয়েছে: ' + email);
}

async function submitNewPassword() {
  const p_user_id = document.getElementById('reset-target-uid').value;
  const p_new_password = document.getElementById('reset-new-pass').value.trim();

  if (!p_user_id) return showToast('আগে ইউজার নির্বাচন করুন');
  if (p_new_password.length < 6) return showToast('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে');

  const { data, error } = await sb.rpc('admin_reset_user_password', {
    p_user_id,
    p_new_password
  });

  if (error || (data && data.success === false)) {
    return showToast('পাসওয়ার্ড আপডেট ব্যর্থ: ' + (error?.message || data?.message));
  }

  showToast('পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে!');
  closeResetModal();
}

// ============================================================
// 11. PROMO CODES & APP ANNOUNCEMENTS (ADS / NOTICES)
// ============================================================
async function loadPromotionsAndAds() {
  await Promise.all([loadAnnouncements(), loadPromoCodes()]);
}

async function loadAnnouncements() {
  const { data, error } = await db
    .from('app_announcements')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return showToast('নোটিফিকেশন লোড ব্যর্থ: ' + error.message);

  const targetLabels = {
    passenger: 'Passenger App',
    rider: 'Rider App',
    both: 'Both Apps'
  };

  document.getElementById('announcements-tbody').innerHTML = (data || []).map((a) => `
    <tr>
      <td>
        <span class="status-badge sb-blue">${targetLabels[a.target_app] || a.target_app}</span><br/>
        <span class="status-badge sb-amber" style="margin-top:4px;">${a.badge_text || 'Notice'}</span>
      </td>
      <td>
        <strong>${a.title}</strong><br/>
        <span class="muted-text">${a.message}</span>
      </td>
      <td>
        <label class="switch-toggle" title="Active / Pause">
          <input type="checkbox" ${a.is_active ? 'checked' : ''} onchange="toggleAnnouncement('${a.id}', this.checked)" />
          <span class="switch-slider"></span>
        </label>
      </td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="deleteAnnouncement('${a.id}')">Delete</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4">কোনো নোটিফিকেশন বা বিজ্ঞাপন নেই।</td></tr>';
}

document.getElementById('announcement-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    target_app: document.getElementById('ann-target').value,
    badge_text: document.getElementById('ann-badge').value.trim(),
    title: document.getElementById('ann-title').value.trim(),
    message: document.getElementById('ann-message').value.trim(),
    is_active: true
  };

  const { error } = await db.from('app_announcements').insert(payload);
  if (error) return showToast('পাবলিশ ব্যর্থ: ' + error.message);

  showToast('নতুন নোটিফিকেশন/বিজ্ঞাপন পাবলিশ হয়েছে!');
  document.getElementById('ann-title').value = '';
  document.getElementById('ann-message').value = '';
  loadAnnouncements();
});

async function toggleAnnouncement(id, isActive) {
  const { error } = await db.from('app_announcements').update({ is_active: isActive }).eq('id', id);
  if (error) return showToast('আপডেট ব্যর্থ হয়েছে');
  showToast(isActive ? 'বিজ্ঞাপনটি চালু করা হয়েছে' : 'বিজ্ঞাপনটি সাময়িক বন্ধ (Paused) করা হয়েছে');
}

async function deleteAnnouncement(id) {
  if (!confirm('আপনি কি এই বিজ্ঞাপনটি স্থায়ীভাবে মুছে ফেলতে চান?')) return;
  const { error } = await db.from('app_announcements').delete().eq('id', id);
  if (error) return showToast('ডিলিট ব্যর্থ হয়েছে');
  showToast('বিজ্ঞাপনটি মুছে ফেলা হয়েছে');
  loadAnnouncements();
}

async function loadPromoCodes() {
  const { data, error } = await db
    .from('promo_codes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return showToast('প্রোমো কোড লোড ব্যর্থ: ' + error.message);

  document.getElementById('promos-tbody').innerHTML = (data || []).map((p) => {
    const discLabel = p.discount_type === 'percent'
      ? `${p.discount_value}% (Max ৳${p.max_discount || 0})`
      : `Flat ৳${p.discount_value}`;

    const maxUses = p.max_uses_per_user ?? 1;
    const isExpired = p.expires_at && new Date(p.expires_at) < new Date();
    const expiryText = p.expires_at
      ? `${isExpired ? 'Expired:' : 'Exp:'} ${new Date(p.expires_at).toLocaleDateString('en-GB')}`
      : 'No Expiry';

    return `
      <tr>
        <td>
          <span class="trx-chip">${p.code}</span><br/>
          <span class="status-badge sb-blue" style="margin-top:4px;">Limit: ${maxUses}/user</span>
        </td>
        <td>
          <strong>${discLabel}</strong><br/>
          <span class="muted-text">Min Fare: ৳${p.min_fare || 0} • ${expiryText}</span>
        </td>
        <td>
          <label class="switch-toggle" title="Active / Inactive">
            <input type="checkbox" ${p.is_active ? 'checked' : ''} onchange="togglePromoCode('${p.id}', this.checked)" />
            <span class="switch-slider"></span>
          </label>
        </td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="deletePromoCode('${p.id}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="4">কোনো প্রোমো কোড তৈরি করা হয়নি।</td></tr>';
}

document.getElementById('promo-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const expiresRaw = document.getElementById('promo-expires-at').value;
  const payload = {
    code: document.getElementById('promo-code').value.trim().toUpperCase(),
    discount_type: document.getElementById('promo-type').value,
    discount_value: parseFloat(document.getElementById('promo-value').value),
    max_discount: parseFloat(document.getElementById('promo-max').value) || 0,
    min_fare: parseFloat(document.getElementById('promo-min').value) || 0,
    max_uses_per_user: parseInt(document.getElementById('promo-max-uses').value, 10) || 1,
    expires_at: expiresRaw ? new Date(expiresRaw).toISOString() : null,
    is_active: true
  };

  if (!payload.code) return showToast('প্রোমো কোড লিখুন');

  const { error } = await db.from('promo_codes').insert(payload);
  if (error) return showToast('প্রোমো তৈরি ব্যর্থ: ' + error.message);

  showToast(`প্রোমো কোড ${payload.code} তৈরি হয়েছে!`);
  document.getElementById('promo-code').value = '';
  document.getElementById('promo-value').value = '';
  document.getElementById('promo-max-uses').value = '1';
  document.getElementById('promo-expires-at').value = '';
  loadPromoCodes();
});

async function togglePromoCode(id, isActive) {
  const { error } = await db.from('promo_codes').update({ is_active: isActive }).eq('id', id);
  if (error) return showToast('আপডেট ব্যর্থ হয়েছে');
  showToast(isActive ? 'প্রোমো কোড অ্যাক্টিভ করা হয়েছে' : 'প্রোমো কোড নিষ্ক্রিয় করা হয়েছে');
}

async function deletePromoCode(id) {
  if (!confirm('আপনি কি এই প্রোমো কোডটি মুছে ফেলতে চান?')) return;
  const { error } = await db.from('promo_codes').delete().eq('id', id);
  if (error) return showToast('ডিলিট ব্যর্থ হয়েছে');
  showToast('প্রোমো কোড মুছে ফেলা হয়েছে');
  loadPromoCodes();
}
