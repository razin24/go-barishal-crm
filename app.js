// ============================================================
// GO BARISHAL ADMIN CRM — SUPABASE & PURPLE BRAND ENGINE
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
let lockCountdownTimer = null;
let driverMarkersMap = {};
let allMapDriversCache = [];
let cachedAnnouncementsMap = {};
let isMarketingHubOpen = false;

function showToast(msg) {
  const box = document.getElementById('toast-container');
  if (!box) return;
  const item = document.createElement('div');
  item.className = 'toast';
  item.textContent = msg;
  box.appendChild(item);
  setTimeout(() => item.remove(), 3500);
}

function showGbLoader(text = 'ডেটা লোড হচ্ছে...') {
  const el = document.getElementById('gb-preloader');
  if (!el) return;
  const txt = el.querySelector('.gb-loader-text');
  if (txt) txt.textContent = text;
  el.classList.remove('fade-out');
}

function hideGbLoader() {
  const el = document.getElementById('gb-preloader');
  if (!el) return;
  el.classList.add('fade-out');
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
// 1. AUTHENTICATION, 5-MIN LOCKDOWN & ADMIN ROLE GUARD
// ============================================================
function enforceLoginLockUI() {
  const lockUntil = Number(localStorage.getItem('gb_login_lock_until') || 0);
  const errBox = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  const emailInput = document.getElementById('login-email');
  const passInput = document.getElementById('login-password');

  if (!btn || !errBox) return false;

  if (Date.now() < lockUntil) {
    btn.disabled = true;
    if (emailInput) emailInput.disabled = true;
    if (passInput) passInput.disabled = true;
    errBox.classList.remove('hidden');

    if (lockCountdownTimer) clearInterval(lockCountdownTimer);
    const updateTimer = () => {
      const rem = Number(localStorage.getItem('gb_login_lock_until') || 0) - Date.now();
      if (rem <= 0) {
        clearInterval(lockCountdownTimer);
        localStorage.removeItem('gb_login_lock_until');
        localStorage.removeItem('gb_failed_attempts');
        btn.disabled = false;
        btn.textContent = 'সাইন ইন করুন';
        if (emailInput) emailInput.disabled = false;
        if (passInput) passInput.disabled = false;
        errBox.classList.add('hidden');
        return;
      }
      const mins = String(Math.floor(rem / 60000)).padStart(2, '0');
      const secs = String(Math.floor((rem % 60000) / 1000)).padStart(2, '0');
      btn.textContent = `লক করা আছে (${mins}:${secs})`;
      errBox.textContent = `পরপর ৩ বার ভুল পাসওয়ার্ড দেওয়ায় ৫ মিনিটের জন্য লগইন বন্ধ করা হয়েছে। অপেক্ষা করুন: ${mins}:${secs}`;
    };

    updateTimer();
    lockCountdownTimer = setInterval(updateTimer, 1000);
    return true;
  }
  return false;
}

function mountAdminWorkspace() {
  const mount = document.getElementById('secure-app-mount');
  if (!mount || mount.children.length > 0) return;
  const tpl = document.getElementById('admin-crm-template');
  if (!tpl) return;
  mount.appendChild(tpl.content.cloneNode(true));
  bindWorkspaceForms();
}

function bindWorkspaceForms() {
  const settingsForm = document.getElementById('settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
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
  }

  // ইমেজ ব্যানার বিজ্ঞাপন ফর্ম (শিডিউলসহ)
  const bannerForm = document.getElementById('banner-ad-form');
  const annImageInput = document.getElementById('ann-image-url');
  if (annImageInput) {
    ['input', 'paste', 'change'].forEach((evt) => {
      annImageInput.addEventListener(evt, () => {
        setTimeout(() => updateAnnouncementBannerPreview(annImageInput.value), 0);
      });
    });
  }

  if (bannerForm) {
    bannerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('banner-edit-id')?.value.trim();
      const imageUrlRaw = document.getElementById('ann-image-url')?.value.trim() || '';
      if (!imageUrlRaw) return showToast('ব্যানার ছবির URL দিন');

      const startsRaw = document.getElementById('banner-starts-at')?.value;
      const expiresRaw = document.getElementById('banner-expires-at')?.value;
      const labelText = document.getElementById('banner-label')?.value.trim() || 'Promo Banner';

      const payload = {
        target_app: document.getElementById('banner-target').value,
        badge_text: 'BANNER_AD',
        title: labelText,
        message: labelText,
        image_url: imageUrlRaw,
        starts_at: startsRaw ? new Date(startsRaw).toISOString() : new Date().toISOString(),
        expires_at: expiresRaw ? new Date(expiresRaw).toISOString() : null
      };

      if (editId) {
        const { error } = await db.from('app_announcements').update(payload).eq('id', editId);
        if (error) return showToast('ব্যানার আপডেট ব্যর্থ: ' + error.message);
        showToast('ইমেজ ব্যানার আপডেট হয়েছে!');
      } else {
        payload.is_active = true;
        const { error } = await db.from('app_announcements').insert(payload);
        if (error) return showToast('ব্যানার পাবলিশ ব্যর্থ: ' + error.message);
        showToast('ইমেজ ব্যানার শিডিউল/পাবলিশ হয়েছে!');
      }

      resetBannerAdForm();
      loadAnnouncements();
    });
  }

  // টেক্সট নোটিফিকেশন ও নোটিশ ফর্ম (শিডিউলসহ)
  const annForm = document.getElementById('announcement-form');
  if (annForm) {
    annForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const startsRaw = document.getElementById('ann-starts-at')?.value;
      const expiresRaw = document.getElementById('ann-expires-at')?.value;

      const payload = {
        target_app: document.getElementById('ann-target').value,
        badge_text: document.getElementById('ann-badge').value.trim() || 'Notice',
        title: document.getElementById('ann-title').value.trim(),
        message: document.getElementById('ann-message').value.trim(),
        image_url: null,
        starts_at: startsRaw ? new Date(startsRaw).toISOString() : new Date().toISOString(),
        expires_at: expiresRaw ? new Date(expiresRaw).toISOString() : null,
        is_active: true
      };
      const { error } = await db.from('app_announcements').insert(payload);
      if (error) return showToast('পাবলিশ ব্যর্থ: ' + error.message);
      showToast('টেক্সট নোটিফিকেশন শিডিউল/পাবলিশ হয়েছে!');
      document.getElementById('ann-title').value = '';
      document.getElementById('ann-message').value = '';
      if (document.getElementById('ann-starts-at')) document.getElementById('ann-starts-at').value = '';
      if (document.getElementById('ann-expires-at')) document.getElementById('ann-expires-at').value = '';
      loadAnnouncements();
    });
  }

  const promoForm = document.getElementById('promo-form');
  if (promoForm) {
    promoForm.addEventListener('submit', async (e) => {
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
  }

  // মার্কেটিং খরচ ও ক্যাম্পেইন ফর্ম
  const mktSpendForm = document.getElementById('marketing-spend-form');
  if (mktSpendForm) {
    mktSpendForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        campaign_name: document.getElementById('mkt-camp-name').value.trim(),
        platform: document.getElementById('mkt-camp-platform').value,
        spend_bdt: parseFloat(document.getElementById('mkt-camp-spend').value) || 0,
        ad_reach: parseInt(document.getElementById('mkt-camp-reach').value, 10) || 0,
        link_clicks: parseInt(document.getElementById('mkt-camp-clicks').value, 10) || 0,
        notes: document.getElementById('mkt-camp-notes').value.trim()
      };
      const { error } = await db.from('marketing_campaigns').insert(payload);
      if (error) return showToast('সেভ ব্যর্থ: ' + error.message);
      showToast('মার্কেটিং খরচ ও ক্যাম্পেইন ডেটা সেভ হয়েছে!');
      mktSpendForm.reset();
      loadMarketingHub();
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.location.search) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  enforceLoginLockUI();

  const { data: { session } } = await db.auth.getSession();
  if (session) {
    showGbLoader('ড্যাশবোর্ড লোড হচ্ছে...');
    try {
      await verifyAdminSession(session.user.id);
    } finally {
      hideGbLoader();
    }
  } else {
    hideGbLoader();
  }
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (enforceLoginLockUI()) return;

  const errBox = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  const trap = document.getElementById('bot-trap');
  if (trap && trap.value !== '') return;

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  errBox.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'যাচাই করা হচ্ছে...';

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  if (window.turnstile) turnstile.reset();
  btn.disabled = false;
  btn.textContent = 'সাইন ইন করুন';

  if (error) {
    const attempts = Number(localStorage.getItem('gb_failed_attempts') || 0) + 1;
    localStorage.setItem('gb_failed_attempts', attempts);

    if (attempts >= 3) {
      localStorage.setItem('gb_login_lock_until', Date.now() + 5 * 60 * 1000);
      localStorage.setItem('gb_failed_attempts', '0');
      enforceLoginLockUI();
    } else {
      errBox.textContent = `ভুল ইমেইল বা পাসওয়ার্ড! সতর্কতা: ${attempts}/3 বার ভুল হয়েছে (৩ বার হলে ৫ মিনিট লক হবে)।`;
      errBox.classList.remove('hidden');
    }
    return;
  }

  localStorage.removeItem('gb_failed_attempts');
  localStorage.removeItem('gb_login_lock_until');

  showGbLoader('অ্যাডমিন প্যানেল লোড হচ্ছে...');
  try {
    await verifyAdminSession(data.user.id);
  } finally {
    hideGbLoader();
  }
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

  mountAdminWorkspace();

  const dateChip = document.getElementById('today-date-chip');
  if (dateChip) dateChip.textContent = new Date().toLocaleDateString('en-GB');
  document.getElementById('admin-name-display').textContent = profile.full_name || 'Admin';
  document.getElementById('login-screen').classList.add('hidden');

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await db.auth.signOut();
    location.reload();
  });

  initSidebarEvents();
  await cacheProfiles();
  await loadDashboard();
}

// ============================================================
// 2. NAVIGATION & TAB ROUTING
// ============================================================
function initSidebarEvents() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');

  document.getElementById('menu-toggle').addEventListener('click', () => {
    sidebar.classList.toggle('open');
    if (backdrop) backdrop.classList.toggle('show', sidebar.classList.contains('open'));
  });

  document.getElementById('sidebar-close').addEventListener('click', () => {
    sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('show');
  });

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabName) {
  if (isMarketingHubOpen) {
    isMarketingHubOpen = false;
    const opsView = document.querySelector('.main-panel > .content-body:not(#marketing-workspace-view)');
    const mktView = document.getElementById('marketing-workspace-view');
    const btn = document.getElementById('toggle-marketing-hub-btn');
    const lbl = document.getElementById('gb-hub-btn-label');
    if (mktView) mktView.classList.add('hidden');
    if (opsView) opsView.classList.remove('hidden');
    if (btn) btn.classList.remove('is-active');
    if (lbl) lbl.textContent = 'Marketing Hub';
  }

  activeTab = tabName;
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('show');

  document.querySelectorAll('.nav-item, .m-nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-view').forEach((v) => v.classList.remove('active'));
  const targetTab = document.getElementById(`tab-${tabName}`);
  if (targetTab) targetTab.classList.add('active');

  refreshCurrentTab();
}

async function refreshCurrentTab() {
  if (isMarketingHubOpen) return loadMarketingHub();
  if (activeTab === 'promotions') await loadPromotionsAndAds();
  if (activeTab === 'dashboard') await loadDashboard();
  if (activeTab === 'map') initOrRefreshMap();
  if (activeTab === 'drivers') await loadDrivers();
  if (activeTab === 'payments') await loadPayments();
  if (activeTab === 'rides') await loadRides();
  if (activeTab === 'passengers') await loadPassengersAndReports();
  if (activeTab === 'settings') await loadSettings();
}

async function cacheProfiles() {
  const { data } = await db.from('profiles').select('id, full_name, phone, role, status');
  allProfilesMap = {};
  (data || []).forEach((p) => { allProfilesMap[p.id] = p; });
}

// ============================================================
// 3. DASHBOARD OVERVIEW & PURPLE BRAND CHARTS
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

  const barEl = document.getElementById('ridesBarChart');
  if (barEl && window.Chart) {
    if (barChartObj) barChartObj.destroy();
    barChartObj = new Chart(barEl.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Completed Rides',
          data: counts,
          backgroundColor: '#4A148C',
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
  }

  const doughEl = document.getElementById('fleetDoughnutChart');
  const totalFleet = bikeCnt + cngCnt + carCnt || 1;
  if (doughEl && window.Chart) {
    if (doughnutChartObj) doughnutChartObj.destroy();
    doughnutChartObj = new Chart(doughEl.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Bike', 'CNG', 'Car'],
        datasets: [{
          data: [bikeCnt, cngCnt, carCnt],
          backgroundColor: ['#4A148C', '#9333EA', '#14B8A6'],
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
  }

  document.getElementById('fleet-legend').innerHTML = `
    <div class="legend-row"><span class="legend-dot" style="background:#4A148C"></span> Bike (${Math.round((bikeCnt / totalFleet) * 100)}%) — ${bikeCnt}</div>
    <div class="legend-row"><span class="legend-dot" style="background:#9333EA"></span> CNG (${Math.round((cngCnt / totalFleet) * 100)}%) — ${cngCnt}</div>
    <div class="legend-row"><span class="legend-dot" style="background:#14B8A6"></span> Car (${Math.round((carCnt / totalFleet) * 100)}%) — ${carCnt}</div>
  `;

  const lineEl = document.getElementById('gmvLineChart');
  if (lineEl && window.Chart) {
    if (lineChartObj) lineChartObj.destroy();
    lineChartObj = new Chart(lineEl.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Trip Fare GMV (৳)',
          data: gmvData,
          borderColor: '#4A148C',
          backgroundColor: 'rgba(74, 20, 140, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#4A148C'
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
// 4. LIVE BARISHAL FLEET MAP & ROAD-WISE TRACKER
// ============================================================
const routeGeometryCache = {};

async function fetchRoadRouteCoords(lat1, lng1, lat2, lng2) {
  const key = `${Number(lat1).toFixed(4)},${Number(lng1).toFixed(4)}_${Number(lat2).toFixed(4)},${Number(lng2).toFixed(4)}`;
  if (routeGeometryCache[key]) return routeGeometryCache[key];

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.code === 'Ok' && json.routes && json.routes[0]) {
      const coords = json.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      routeGeometryCache[key] = coords;
      return coords;
    }
  } catch (e) {}
  return [[lat1, lng1], [lat2, lng2]];
}

function initOrRefreshMap(targetDriverId = null) {
  if (!fleetMap) {
    fleetMap = L.map('barishal-map').setView([22.7010, 90.3535], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(fleetMap);
    fleetLayer = L.layerGroup().addTo(fleetMap);
  }
  setTimeout(() => fleetMap.invalidateSize(), 200);
  refreshMapData(targetDriverId);

  if (mapTimer) clearInterval(mapTimer);
  mapTimer = setInterval(() => {
    const autoEl = document.getElementById('auto-refresh-map');
    if (activeTab === 'map' && !isMarketingHubOpen && autoEl && autoEl.checked) {
      refreshMapData();
    }
  }, 5000);
}

async function refreshMapData(targetDriverId = null) {
  await cacheProfiles();
  const showOffline = document.getElementById('show-offline-riders')?.checked ?? false;

  const [drvRes, rideRes] = await Promise.all([
    db.from('drivers').select('*'),
    db.from('rides').select('*').in('status', ['searching', 'accepted', 'arrived', 'ongoing'])
  ]);

  allMapDriversCache = drvRes.data || [];
  const fifteenMinsAgo = Date.now() - 15 * 60 * 1000;
  const activeRides = (rideRes.data || []).filter((r) => {
    if (r.status === 'searching' && r.created_at) {
      return new Date(r.created_at).getTime() > fifteenMinsAgo;
    }
    return true;
  });

  const datalist = document.getElementById('map-riders-datalist');
  if (datalist) {
    datalist.innerHTML = allMapDriversCache.map((d) => {
      const prof = allProfilesMap[d.user_id] || allProfilesMap[d.id] || {};
      return `<option value="${prof.phone || d.vehicle_number || ''}">${prof.full_name || 'Rider'} (${(d.vehicle_type || '').toUpperCase()} - ${d.vehicle_number || 'N/A'})</option>`;
    }).join('');
  }

  fleetLayer.clearLayers();
  driverMarkersMap = {};
  const palette = { bike: '#15803D', cng: '#B45309', car: '#4A148C' };

  allMapDriversCache.forEach((d) => {
    if (!d.lat || !d.lng) return;
    const ongoingRide = activeRides.find((r) => r.driver_id === d.id);
    const isOnline = Boolean(d.is_online);
    const isTarget = targetDriverId && d.id === targetDriverId;

    if (!isOnline && !ongoingRide && !showOffline && !isTarget) return;

    const prof = allProfilesMap[d.user_id] || allProfilesMap[d.id] || {};
    const pinColor = isOnline ? (palette[d.vehicle_type] || '#4A148C') : '#64748B';
    const lastSeen = d.last_heartbeat_at ? new Date(d.last_heartbeat_at).toLocaleString('en-GB') : 'অজানা';

    const marker = L.circleMarker([d.lat, d.lng], {
      radius: ongoingRide ? 11 : 9,
      fillColor: pinColor,
      color: ongoingRide ? '#B91C1C' : '#FFFFFF',
      weight: ongoingRide ? 3 : 2,
      fillOpacity: isOnline ? 0.95 : 0.75,
      className: ongoingRide ? 'active-ride-pulse' : ''
    });

    if (ongoingRide) {
      marker.bindTooltip(
        `${prof.full_name || 'Rider'} → ${ongoingRide.passenger_name || 'Passenger'} (${ongoingRide.status})`,
        { permanent: true, direction: 'top', offset: [0, -10], className: 'map-rider-tag' }
      );
    }

    marker.bindPopup(`
      <div style="min-width:205px; line-height:1.5;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <strong>${prof.full_name || 'Rider'}</strong>
          <span style="font-size:11px; padding:2px 7px; border-radius:99px; background:${isOnline ? '#DCFCE7' : '#F1F5F9'}; color:${isOnline ? '#14532D' : '#475569'}; font-weight:700;">
            ${isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
        <div>গাড়ি: <strong>${(d.vehicle_type || '').toUpperCase()}</strong> (${d.vehicle_number || 'N/A'})</div>
        <div>ফোন: <a href="tel:${prof.phone || ''}" style="color:#4A148C; font-weight:700;">${prof.phone || 'N/A'}</a></div>
        <div style="font-size:11.5px; color:#64748B; margin-top:3px;">সর্বশেষ সিগন্যাল: ${lastSeen}</div>
        ${ongoingRide ? `
          <div style="margin-top:6px; padding:6px; background:#FEE2E2; border-left:3px solid #B91C1C; font-size:12px;">
            <strong>চলমান রাইড (${ongoingRide.status}):</strong><br/>
            যাত্রী: ${ongoingRide.passenger_name || 'N/A'} (${ongoingRide.passenger_phone || ''})<br/>
            রুট: ${ongoingRide.pickup_area || ''} → ${ongoingRide.drop_area || ''}
          </div>
        ` : ''}
      </div>
    `).addTo(fleetLayer);

    driverMarkersMap[d.id] = { marker, lat: d.lat, lng: d.lng, driver: d, profile: prof };
  });

  for (const r of activeRides) {
    const assignedDrv = r.driver_id ? driverMarkersMap[r.driver_id] : null;
    const targetLat = r.status === 'ongoing' && r.drop_lat ? r.drop_lat : r.pickup_lat;
    const targetLng = r.status === 'ongoing' && r.drop_lng ? r.drop_lng : r.pickup_lng;

    if (r.pickup_lat && r.pickup_lng) {
      L.marker([r.pickup_lat, r.pickup_lng])
        .bindPopup(`<strong>পিকআপ (${r.status})</strong><br/>স্থান: ${r.pickup_area || r.pickup_text}<br/>যাত্রী: ${r.passenger_name || 'N/A'} (${r.passenger_phone || ''})`)
        .addTo(fleetLayer);
    }

    if (r.drop_lat && r.drop_lng) {
      L.circleMarker([r.drop_lat, r.drop_lng], {
        radius: 7,
        fillColor: '#B91C1C',
        color: '#FFFFFF',
        weight: 2,
        fillOpacity: 0.9
      }).bindPopup(`<strong>গন্তব্য (Drop):</strong> ${r.drop_area || r.drop_text || ''}`).addTo(fleetLayer);
    }

    if (assignedDrv && targetLat && targetLng) {
      const roadPath = await fetchRoadRouteCoords(assignedDrv.lat, assignedDrv.lng, targetLat, targetLng);
      L.polyline(roadPath, {
        color: r.status === 'ongoing' ? '#15803D' : '#4A148C',
        weight: 4.5,
        opacity: 0.9,
        lineJoin: 'round'
      }).addTo(fleetLayer);
    }
  }

  const stripEl = document.getElementById('live-rides-strip');
  if (stripEl) {
    stripEl.innerHTML = activeRides.map((r) => {
      const drvEntry = r.driver_id ? driverMarkersMap[r.driver_id] : null;
      const riderName = drvEntry ? (drvEntry.profile.full_name || 'Rider') : 'রাইডার খোঁজা হচ্ছে...';
      const clickAttr = drvEntry ? `onclick="trackDriverOnMap('${r.driver_id}')"` : (r.pickup_lat ? `onclick="fleetMap.setView([${r.pickup_lat}, ${r.pickup_lng}], 16)"` : '');

      return `
        <div class="live-ride-pill-card" ${clickAttr}>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span class="status-badge sb-red">${r.status.toUpperCase()}</span>
            <strong>৳${r.final_fare || r.offered_fare || 0}</strong>
          </div>
          <div><strong>রাইডার:</strong> ${riderName}</div>
          <div><strong>যাত্রী:</strong> ${r.passenger_name || 'N/A'} (${r.passenger_phone || ''})</div>
          <div class="muted-text" style="margin-top:3px;">${r.pickup_area || ''} → ${r.drop_area || ''}</div>
        </div>
      `;
    }).join('') || '<p class="muted-text" style="grid-column:1/-1;">এই মুহূর্তে কোনো রাইড চলমান নেই।</p>';
  }

  if (targetDriverId && driverMarkersMap[targetDriverId]) {
    const target = driverMarkersMap[targetDriverId];
    fleetMap.setView([target.lat, target.lng], 16);
    target.marker.openPopup();
  }
}

function focusRiderOnMap(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return showToast('রাইডারের ফোন নম্বর, নাম বা গাড়ির নম্বর লিখুন');

  const foundDriver = allMapDriversCache.find((d) => {
    const prof = allProfilesMap[d.user_id] || allProfilesMap[d.id] || {};
    const hay = `${prof.full_name || ''} ${prof.phone || ''} ${d.vehicle_number || ''}`.toLowerCase();
    return hay.includes(q);
  });

  if (!foundDriver || !foundDriver.lat || !foundDriver.lng) {
    return showToast('ম্যাপে এই রাইডারের কোনো GPS লোকেশন পাওয়া যায়নি');
  }

  refreshMapData(foundDriver.id);
}

function trackDriverOnMap(driverId) {
  switchTab('map');
  setTimeout(() => initOrRefreshMap(driverId), 250);
}

// ============================================================
// 5. DRIVER MANAGEMENT
// ============================================================
async function loadDrivers() {
  showTableLoader('drivers-tbody', 7, 'ড্রাইভার তালিকা লোড হচ্ছে...');
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
        <td><strong>${prof.full_name || 'N/A'}</strong> <span class="online-dot ${d.is_online ? 'on' : 'off'}"></span><br/><span class="muted-text">${prof.phone || ''}</span></td>
        <td><span class="status-badge sb-blue">${(d.vehicle_type || '').toUpperCase()}</span><br/>${d.vehicle_model || ''} (${d.vehicle_number || 'N/A'})</td>
        <td>Rating: ${Number(d.rating_avg || 0).toFixed(1)} (${d.rating_count || 0})<br/><span class="muted-text">${d.total_rides || 0} রাইড • ৳${d.total_earnings || 0}</span></td>
        <td><strong>${d.free_rides_left ?? 0}</strong></td>
        <td><span class="status-badge ${validPass ? 'sb-green' : 'sb-red'}">${validPass ? exp.toLocaleDateString() : 'Expired'}</span></td>
        <td><span class="status-badge ${d.status === 'approved' ? 'sb-green' : 'sb-amber'}">${d.status}</span></td>
        <td>
          <div class="btn-row">
            <button class="btn btn-sm btn-white" onclick="trackDriverOnMap('${d.id}')">Map</button>
            <button class="btn btn-sm ${d.status === 'approved' ? 'btn-danger' : 'btn-success'}"
              onclick="setDriverStatus('${d.id}', '${d.status === 'approved' ? 'suspended' : 'approved'}')">
              ${d.status === 'approved' ? 'Suspend' : 'Approve'}
            </button>
            <button class="btn btn-sm btn-royal" onclick="grantWeeklyPass('${d.id}', '${d.package_expires_at || ''}')">+7 Days</button>
            <button class="btn btn-sm btn-white" onclick="updateFreeRides('${d.id}', ${d.free_rides_left ?? 0})">Free Rides</button>
            <button class="btn btn-sm btn-white" onclick="openResetModalForUser('${d.user_id || d.id}', '${(prof.full_name || '').replace(/'/g, '')}', 'driver', '${prof.phone || ''}')">Reset Pass</button>
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
  showTableLoader('payments-tbody', 6, 'বিকাশ পেমেন্ট রেকর্ড লোড হচ্ছে...');
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
  showTableLoader('rides-tbody', 7, 'রাইড তালিকা লোড হচ্ছে...');
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
        <td>
          ${drvProf.full_name || 'Unassigned'}<br/>
          <span class="muted-text">${drvProf.phone || ''}</span>
          ${r.driver_id ? `<br/><button class="btn btn-sm btn-white" style="margin-top:4px;" onclick="trackDriverOnMap('${r.driver_id}')">Track Rider</button>` : ''}
        </td>
        <td><span class="status-badge sb-blue">${r.status}</span> ${r.rating ? `<br/><small>Rating: ${r.rating}</small>` : ''}</td>
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
  showTableLoader('passengers-tbody', 4, 'যাত্রী তালিকা লোড হচ্ছে...');
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
          Reset Pass
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
// 11. PROMO CODES, SCHEDULED BANNERS & APP NOTICES
// ============================================================
function toLocalDatetimeInput(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

function getScheduleStatusHtml(item) {
  const now = Date.now();
  const startMs = item.starts_at ? new Date(item.starts_at).getTime() : 0;
  const endMs = item.expires_at ? new Date(item.expires_at).getTime() : null;

  if (!item.is_active) {
    return '<span class="status-badge sb-amber">Paused</span>';
  }
  if (startMs > now) {
    return `<span class="status-badge sb-blue">Scheduled</span><div class="muted-text" style="font-size:11px;margin-top:2px;">শুরু: ${new Date(startMs).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</div>`;
  }
  if (endMs && endMs < now) {
    return `<span class="status-badge sb-red">Expired</span><div class="muted-text" style="font-size:11px;margin-top:2px;">শেষ: ${new Date(endMs).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</div>`;
  }
  const endText = endMs ? `শেষ: ${new Date(endMs).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}` : 'চলমান (No Expiry)';
  return `<span class="status-badge sb-green">Live Now</span><div class="muted-text" style="font-size:11px;margin-top:2px;">${endText}</div>`;
}

function updateAnnouncementBannerPreview(rawUrl) {
  const url = (rawUrl || '').trim();
  const stage = document.getElementById('ann-preview-stage');
  const placeholder = document.getElementById('ann-preview-placeholder');
  const img = document.getElementById('ann-preview-img');
  const errBox = document.getElementById('ann-preview-error');
  const dimsBadge = document.getElementById('ann-preview-dims');

  if (!stage || !placeholder || !img || !errBox || !dimsBadge) return;

  if (!url) {
    stage.classList.add('is-empty');
    placeholder.classList.remove('hidden');
    img.classList.add('hidden');
    img.removeAttribute('src');
    errBox.classList.add('hidden');
    dimsBadge.textContent = 'No image URL';
    dimsBadge.className = 'banner-dim-badge';
    return;
  }

  stage.classList.remove('is-empty');
  placeholder.classList.add('hidden');
  errBox.classList.add('hidden');
  dimsBadge.textContent = 'Loading...';
  dimsBadge.className = 'banner-dim-badge';

  img.onload = () => {
    img.classList.remove('hidden');
    errBox.classList.add('hidden');
    dimsBadge.textContent = `Loaded: ${img.naturalWidth} × ${img.naturalHeight} px`;
    dimsBadge.className = 'banner-dim-badge is-loaded';
  };

  img.onerror = () => {
    img.classList.add('hidden');
    errBox.classList.remove('hidden');
    dimsBadge.textContent = 'Failed to load';
    dimsBadge.className = 'banner-dim-badge is-error';
  };

  img.src = url;
}

function editBannerAd(id) {
  const item = cachedAnnouncementsMap[id];
  if (!item) return;

  document.getElementById('banner-edit-id').value = item.id;
  document.getElementById('banner-target').value = item.target_app || 'passenger';
  document.getElementById('banner-label').value = item.title || '';
  document.getElementById('ann-image-url').value = item.image_url || '';
  if (document.getElementById('banner-starts-at')) document.getElementById('banner-starts-at').value = toLocalDatetimeInput(item.starts_at);
  if (document.getElementById('banner-expires-at')) document.getElementById('banner-expires-at').value = toLocalDatetimeInput(item.expires_at);

  const heading = document.getElementById('banner-form-heading');
  const submitBtn = document.getElementById('banner-submit-btn');
  const cancelBtn = document.getElementById('banner-cancel-edit-btn');
  if (heading) heading.textContent = 'ইমেজ ব্যানার এডিট করুন';
  if (submitBtn) submitBtn.textContent = 'ব্যানার আপডেট করুন';
  if (cancelBtn) cancelBtn.classList.remove('hidden');

  updateAnnouncementBannerPreview(item.image_url || '');
  document.getElementById('banner-ad-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function resetBannerAdForm() {
  const editIdEl = document.getElementById('banner-edit-id');
  if (editIdEl) editIdEl.value = '';
  document.getElementById('banner-target').value = 'passenger';
  document.getElementById('banner-label').value = '';
  if (document.getElementById('banner-starts-at')) document.getElementById('banner-starts-at').value = '';
  if (document.getElementById('banner-expires-at')) document.getElementById('banner-expires-at').value = '';
  const imgUrlEl = document.getElementById('ann-image-url');
  if (imgUrlEl) imgUrlEl.value = '';

  const heading = document.getElementById('banner-form-heading');
  const submitBtn = document.getElementById('banner-submit-btn');
  const cancelBtn = document.getElementById('banner-cancel-edit-btn');
  if (heading) heading.textContent = 'ইমেজ ব্যানার বিজ্ঞাপন (App Carousel Banner)';
  if (submitBtn) submitBtn.textContent = 'ব্যানার পাবলিশ করুন';
  if (cancelBtn) cancelBtn.classList.add('hidden');

  updateAnnouncementBannerPreview('');
}

async function loadPromotionsAndAds() {
  await Promise.all([loadAnnouncements(), loadPromoCodes()]);
}

async function loadAnnouncements() {
  showTableLoader('banner-ads-tbody', 4, 'ব্যানার লোড হচ্ছে...');
  showTableLoader('announcements-tbody', 4, 'নোটিফিকেশন লোড হচ্ছে...');

  const { data, error } = await db
    .from('app_announcements')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return showToast('লোড ব্যর্থ: ' + error.message);

  cachedAnnouncementsMap = {};
  (data || []).forEach((item) => { cachedAnnouncementsMap[item.id] = item; });

  const targetLabels = {
    passenger: 'Passenger App',
    rider: 'Rider App',
    both: 'Both Apps'
  };

  const bannerItems = (data || []).filter((a) => a.badge_text === 'BANNER_AD' || Boolean(a.image_url));
  const noticeItems = (data || []).filter((a) => a.badge_text !== 'BANNER_AD' && !a.image_url);

  const bannerTbody = document.getElementById('banner-ads-tbody');
  if (bannerTbody) {
    bannerTbody.innerHTML = bannerItems.map((b) => `
      <tr>
        <td>
          <span class="status-badge sb-blue">${targetLabels[b.target_app] || b.target_app}</span>
          <div style="margin-top:5px;">${getScheduleStatusHtml(b)}</div>
        </td>
        <td>
          <strong>${b.title || 'Promo Banner'}</strong>
          ${b.image_url ? `<img src="${b.image_url}" alt="${b.title}" class="ann-thumb-mini" style="width:140px;" />` : ''}
        </td>
        <td>
          <label class="switch-toggle" title="Active / Pause">
            <input type="checkbox" ${b.is_active ? 'checked' : ''} onchange="toggleAnnouncement('${b.id}', this.checked)" />
            <span class="switch-slider"></span>
          </label>
        </td>
        <td>
          <div class="btn-row">
            <button class="btn btn-sm btn-white" onclick="editBannerAd('${b.id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteAnnouncement('${b.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="4">কোনো ইমেজ ব্যানার বিজ্ঞাপন নেই।</td></tr>';
  }

  document.getElementById('announcements-tbody').innerHTML = noticeItems.map((a) => `
    <tr>
      <td>
        <span class="status-badge sb-blue">${targetLabels[a.target_app] || a.target_app}</span>
        <span class="status-badge sb-amber" style="margin-left:4px;">${a.badge_text || 'Notice'}</span>
        <div style="margin-top:5px;">${getScheduleStatusHtml(a)}</div>
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
  `).join('') || '<tr><td colspan="4">কোনো টেক্সট নোটিফিকেশন নেই।</td></tr>';
}

async function toggleAnnouncement(id, isActive) {
  const { error } = await db.from('app_announcements').update({ is_active: isActive }).eq('id', id);
  if (error) return showToast('আপডেট ব্যর্থ হয়েছে');
  showToast(isActive ? 'বিজ্ঞাপনটি চালু করা হয়েছে' : 'বিজ্ঞাপনটি সাময়িক বন্ধ (Paused) করা হয়েছে');
  loadAnnouncements();
}

async function deleteAnnouncement(id) {
  if (!confirm('আপনি কি এই বিজ্ঞাপনটি স্থায়ীভাবে মুছে ফেলতে চান?')) return;
  const { error } = await db.from('app_announcements').delete().eq('id', id);
  if (error) return showToast('ডিলিট ব্যর্থ হয়েছে');
  showToast('বিজ্ঞাপনটি মুছে ফেলা হয়েছে');
  loadAnnouncements();
}

async function loadPromoCodes() {
  showTableLoader('promos-tbody', 4, 'প্রোমো কোড লোড হচ্ছে...');
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

// ============================================================
// 12. DEDICATED MARKETING & GROWTH COMMAND CENTER
// ============================================================
function toggleMarketingWorkspace() {
  isMarketingHubOpen = !isMarketingHubOpen;
  const opsView = document.querySelector('.main-panel > .content-body:not(#marketing-workspace-view)');
  const mktView = document.getElementById('marketing-workspace-view');
  const btn = document.getElementById('toggle-marketing-hub-btn');
  const lbl = document.getElementById('gb-hub-btn-label');

  if (!opsView || !mktView) return;

  if (isMarketingHubOpen) {
    opsView.classList.add('hidden');
    mktView.classList.remove('hidden');
    // প্রতিবার ওপেন হওয়ার সময় নতুন করে অ্যানিমেশন চালানো
    mktView.classList.remove('mkt-screen-animate');
    void mktView.offsetWidth;
    mktView.classList.add('mkt-screen-animate');

    if (btn) btn.classList.add('is-active');
    if (lbl) lbl.textContent = '← Operations CRM';
    loadMarketingHub();
  } else {
    mktView.classList.add('hidden');
    opsView.classList.remove('hidden');
    opsView.classList.remove('mkt-screen-animate');
    void opsView.offsetWidth;
    opsView.classList.add('mkt-screen-animate');

    if (btn) btn.classList.remove('is-active');
    if (lbl) lbl.textContent = 'Marketing Hub';
    refreshCurrentTab();
  }
}

async function loadMarketingHub() {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [profRes, ridesRes, payRes, campRes, taskRes] = await Promise.all([
    db.from('profiles').select('id, created_at'),
    db.from('rides').select('status, final_fare, offered_fare, created_at'),
    db.from('payments').select('amount, status'),
    db.from('marketing_campaigns').select('*').order('created_at', { ascending: false }),
    db.from('marketing_tasks').select('*').order('created_at', { ascending: true })
  ]);

  const profiles = profRes.data || [];
  const rides = ridesRes.data || [];
  const payments = payRes.data || [];
  const campaigns = campRes.data || [];
  const tasks = taskRes.data || [];

  const weeklyUsers = profiles.filter((p) => p.created_at && p.created_at >= sevenDaysAgo).length;
  const monthlyUsers = profiles.filter((p) => p.created_at && p.created_at >= thirtyDaysAgo).length;

  const completedRides = rides.filter((r) => r.status === 'completed');
  const weeklyRides = completedRides.filter((r) => r.created_at && r.created_at >= sevenDaysAgo).length;
  const monthlyRides = completedRides.filter((r) => r.created_at && r.created_at >= thirtyDaysAgo).length;

  const totalSpend = campaigns.reduce((s, c) => s + Number(c.spend_bdt || 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + Number(c.link_clicks || 0), 0);
  const passRevenue = payments.filter((p) => p.status === 'approved').reduce((s, p) => s + Number(p.amount || 0), 0);
  const tripGmv = completedRides.reduce((s, r) => s + Number(r.final_fare || r.offered_fare || 0), 0);
  const totalEarning = passRevenue + tripGmv;
  const netBalance = totalEarning - totalSpend;
  const cpa = monthlyUsers > 0 ? Math.round(totalSpend / monthlyUsers) : 0;
  const budgetLeft = Math.max(0, 1000 - totalSpend);

  document.getElementById('mkt-weekly-users').textContent = `+${weeklyUsers}`;
  document.getElementById('mkt-weekly-rides').textContent = `${weeklyRides} টি সম্পন্ন রাইড`;
  document.getElementById('mkt-monthly-users').textContent = `+${monthlyUsers}`;
  document.getElementById('mkt-monthly-rides').textContent = `${monthlyRides} টি সম্পন্ন রাইড`;
  document.getElementById('mkt-total-spend').textContent = `৳${totalSpend.toLocaleString()}`;
  document.getElementById('mkt-budget-rem').textContent = `টেস্ট বাজেট বাকি: ৳${budgetLeft.toLocaleString()}`;
  document.getElementById('mkt-total-earning').textContent = `৳${totalEarning.toLocaleString()}`;
  document.getElementById('mkt-net-roi').textContent = `নেট ব্যালেন্স: ৳${netBalance.toLocaleString()}`;
  document.getElementById('mkt-cpa').textContent = `৳${cpa}`;
  document.getElementById('mkt-ctr').textContent = `মোট ক্লিক: ${totalClicks}`;

  const setBar = (txtId, barId, val, max, prefix = '') => {
    const pct = Math.min(100, Math.round((val / max) * 100));
    const txtEl = document.getElementById(txtId);
    const barEl = document.getElementById(barId);
    if (txtEl) txtEl.textContent = `${prefix}${val} / ${prefix}${max}`;
    if (barEl) barEl.style.width = `${pct}%`;
  };
  setBar('target-weekly-user-txt', 'target-weekly-user-bar', weeklyUsers, 50);
  setBar('target-monthly-user-txt', 'target-monthly-user-bar', monthlyUsers, 200);
  setBar('target-monthly-ride-txt', 'target-monthly-ride-bar', monthlyRides, 150);
  setBar('target-budget-txt', 'target-budget-bar', totalSpend, 1000, '৳');

  const doneCount = tasks.filter((t) => t.is_done).length;
  const donePct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const progBadge = document.getElementById('mkt-task-progress');
  if (progBadge) progBadge.textContent = `${donePct}% Done (${doneCount}/${tasks.length})`;

  const taskListEl = document.getElementById('marketing-tasks-list');
  if (taskListEl) {
    taskListEl.innerHTML = tasks.map((t) => `
      <label style="display:flex; align-items:flex-start; gap:10px; padding:10px; border:1px solid #E2E8F0; border-radius:10px; background:${t.is_done ? '#F0FDF4' : '#FFFFFF'}; cursor:pointer;">
        <input type="checkbox" ${t.is_done ? 'checked' : ''} onchange="toggleMarketingTask('${t.id}', this.checked)" style="margin-top:3px; accent-color:#4A148C;" />
        <div style="flex:1;">
          <div style="font-size:11px; font-weight:700; color:#4A148C;">${t.phase_label} • টার্গেট: ${t.target_metric || 'N/A'}</div>
          <div style="font-size:13px; font-weight:600; color:${t.is_done ? '#15803D' : '#0F172A'}; text-decoration:${t.is_done ? 'line-through' : 'none'};">${t.task_title}</div>
        </div>
      </label>
    `).join('');
  }

  const tbody = document.getElementById('marketing-campaigns-tbody');
  if (tbody) {
    tbody.innerHTML = campaigns.map((c) => `
      <tr>
        <td>${c.campaign_date || new Date(c.created_at).toLocaleDateString('en-GB')}</td>
        <td><strong>${c.campaign_name}</strong></td>
        <td><span class="status-badge sb-blue">${c.platform}</span></td>
        <td><strong>৳${c.spend_bdt}</strong></td>
        <td>Reach: ${c.ad_reach || 0} • Clicks: ${c.link_clicks || 0}</td>
        <td class="muted-text">${c.notes || '—'}</td>
        <td><button class="btn btn-sm btn-danger" onclick="deleteMarketingCampaign('${c.id}')">Delete</button></td>
      </tr>
    `).join('') || '<tr><td colspan="7">এখনো কোনো মার্কেটিং খরচ যোগ করা হয়নি।</td></tr>';
  }
}

async function toggleMarketingTask(id, isDone) {
  await db.from('marketing_tasks').update({ is_done: isDone }).eq('id', id);
  loadMarketingHub();
}

async function deleteMarketingCampaign(id) {
  if (!confirm('এই ক্যাম্পেইন রেকর্ডটি মুছে ফেলতে চান?')) return;
  await db.from('marketing_campaigns').delete().eq('id', id);
  showToast('ক্যাম্পেইন রেকর্ড মুছে ফেলা হয়েছে');
  loadMarketingHub();
}

function copyMktAsset(key) {
  const el = document.getElementById(`mkt-asset-${key}`);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent.trim());
  showToast('অ্যাড কপি ক্লিপবোর্ডে কপি হয়েছে!');
}
