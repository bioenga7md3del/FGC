/* =========================================================
   FGC System — Core
   إعدادات Firebase + الحماية + أدوات مشتركة لكل الصفحات
   ========================================================= */
(function () {
  'use strict';

  // ---------- Firebase ----------
  const firebaseConfig = {
    apiKey: "AIzaSyCHZsLreB9fd8fkjnj87miAPDrZsKMOrDI",
    authDomain: "fgcbio.firebaseapp.com",
    projectId: "fgcbio",
    storageBucket: "fgcbio.firebasestorage.app",
    messagingSenderId: "924334872806",
    appId: "1:924334872806:web:fac89ce388b1ff2de24327"
  };
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  const auth = firebase.auth();

  // ---------- Roles ----------
  const ROLES = {
    admin:      { label: 'مدير النظام',     edit: true,  profit: true,  admin: true  },
    user:       { label: 'مستخدم (إدخال)',  edit: true,  profit: false, admin: false },
    viewer:     { label: 'مشاهد فقط',       edit: false, profit: false, admin: false },
    viewer_pro: { label: 'مشاهد + أرباح',   edit: false, profit: true,  admin: false }
  };

  const CATEGORIES = {
    spare_parts:    { label: 'قطع غيار',    icon: 'fa-gears',     badge: 'badge-brand' },
    labor:          { label: 'عمالة',       icon: 'fa-helmet-safety', badge: 'badge-accent' },
    subcontractors: { label: 'مقاولي باطن', icon: 'fa-handshake', badge: 'badge-neutral' }
  };

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /** يمنع حقن الأكواد (XSS) — لازم يُستخدم مع أي بيانات جاية من قاعدة البيانات */
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function fmt(n) { return nf.format(Number(n) || 0); }
  function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

  function pad(n) { return String(n).padStart(2, '0'); }
  function toISODate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function todayStr() { return toISODate(new Date()); }
  function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }

  /** يحوّل أي صيغة تاريخ لـ YYYY-MM-DD عشان المقارنة والفلترة تبقى صحيحة */
  function normDate(v) {
    if (!v) return '';
    if (typeof v === 'object' && typeof v.toDate === 'function') return toISODate(v.toDate());
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/); // DD/MM/YYYY
    if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    const d = new Date(s);
    return isNaN(d) ? '' : toISODate(d);
  }
  /** يبني تاريخ محلي من YYYY-MM-DD (بدون مشاكل فرق التوقيت) */
  function parseDate(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function daysBetween(a, b) {
    const d1 = parseDate(a), d2 = parseDate(b);
    if (!d1 || !d2) return 0;
    return Math.round((d2 - d1) / 86400000) + 1;
  }
  function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return toISODate(d); }
  function tsMillis(v) {
    if (!v) return 0;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    const t = new Date(v).getTime();
    return isNaN(t) ? 0 : t;
  }
  function param(name) { return new URLSearchParams(location.search).get(name); }

  // ---------- CSV ----------
  function toCSV(headers, rows) {
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    return '﻿' + [headers, ...rows].map(r => r.map(q).join(',')).join('\r\n');
  }
  function download(content, filename, type = 'text/csv;charset=utf-8') {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function downloadCSV(filename, headers, rows) { download(toCSV(headers, rows), filename); }

  // ---------- Firestore batching (حد Firestore = 500 عملية في الدفعة) ----------
  async function commitInChunks(ops, size = 400) {
    for (let i = 0; i < ops.length; i += size) {
      const batch = db.batch();
      ops.slice(i, i + size).forEach(op => op(batch));
      await batch.commit();
    }
  }

  // ---------- UI: toast ----------
  function toast(msg, type = 'success') {
    let box = $('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><div>${esc(msg)}</div>`;
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, type === 'error' ? 6000 : 3500);
  }

  // ---------- UI: modals ----------
  function openModal(id) { const m = document.getElementById(id); if (m) { m.classList.add('is-open'); const f = m.querySelector('input:not([type=hidden]):not([readonly]), select, textarea'); if (f) setTimeout(() => f.focus(), 50); } }
  function closeModal(id) { const m = document.getElementById(id); if (m) m.classList.remove('is-open'); }
  function closeAllModals() { $$('.modal.is-open').forEach(m => m.classList.remove('is-open')); }
  document.addEventListener('click', e => {
    if (e.target.classList && e.target.classList.contains('modal') && !e.target.dataset.static) e.target.classList.remove('is-open');
    const closer = e.target.closest && e.target.closest('[data-close]');
    if (closer) { const m = closer.closest('.modal'); if (m) m.classList.remove('is-open'); }
    // close dropdowns
    $$('.dropdown.is-open').forEach(d => { if (!d.contains(e.target)) d.classList.remove('is-open'); });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { const open = $$('.modal.is-open'); if (open.length) open[open.length - 1].classList.remove('is-open'); }
  });

  function dialog({ title, message = '', confirmText = 'تأكيد', cancelText = 'إلغاء', danger = false, input = null }) {
    return new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.className = 'modal is-open';
      wrap.dataset.static = '1';
      wrap.innerHTML = `
        <div class="modal__dialog sm" role="dialog" aria-modal="true">
          <div class="modal__head"><div><h3>${esc(title)}</h3>${message ? `<p style="white-space:pre-line">${esc(message)}</p>` : ''}</div></div>
          ${input ? `<div class="modal__body"><div class="field"><label>${esc(input.label || '')}</label><input class="input" id="__dlgInput" placeholder="${esc(input.placeholder || '')}" value="${esc(input.value || '')}"></div></div>` : ''}
          <div class="modal__foot">
            ${cancelText ? `<button class="btn btn-secondary" data-act="cancel">${esc(cancelText)}</button>` : ''}
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${esc(confirmText)}</button>
          </div>
        </div>`;
      document.body.appendChild(wrap);
      const inp = wrap.querySelector('#__dlgInput');
      setTimeout(() => (inp || wrap.querySelector('[data-act=ok]')).focus(), 30);
      const done = val => { wrap.remove(); document.removeEventListener('keydown', onKey, true); resolve(val); };
      const onKey = e => {
        if (e.key === 'Escape') { e.stopPropagation(); done(input ? null : false); }
        if (e.key === 'Enter' && inp) { e.preventDefault(); done(inp.value.trim()); }
      };
      document.addEventListener('keydown', onKey, true);
      wrap.addEventListener('click', e => {
        const act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'ok') done(input ? (inp.value.trim()) : true);
        else done(input ? null : false);
      });
    });
  }
  const confirmDialog = (message, opts = {}) => dialog({ title: opts.title || 'تأكيد الإجراء', message, confirmText: opts.confirmText || 'تأكيد', danger: !!opts.danger });
  const promptDialog = (title, opts = {}) => dialog({ title, message: opts.message || '', confirmText: opts.confirmText || 'حفظ', input: { label: opts.label, placeholder: opts.placeholder, value: opts.value } });
  const alertDialog = (title, message) => dialog({ title, message, confirmText: 'حسناً', cancelText: '' });

  function busy(on, text = 'جاري المعالجة...') {
    let el = $('#__busy');
    if (on) {
      if (!el) { el = document.createElement('div'); el.id = '__busy'; el.className = 'busy-overlay'; el.innerHTML = '<div class="box"><div class="spinner" style="margin:auto"></div><p></p></div>'; document.body.appendChild(el); }
      el.querySelector('p').textContent = text;
    } else if (el) el.remove();
  }

  /** يشغّل دالة async على زرار مع حالة تحميل ورسالة خطأ واضحة */
  async function withButton(btn, fn) {
    const html = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px"></span>'; }
    try { return await fn(); }
    catch (e) { console.error(e); toast(errMsg(e), 'error'); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = html; } }
  }
  function errMsg(e) {
    const code = e && e.code;
    if (code === 'permission-denied') return 'ليس لديك صلاحية لتنفيذ هذا الإجراء.';
    if (code === 'unavailable') return 'تعذر الاتصال بالخادم، تحقق من الإنترنت.';
    return 'حدث خطأ: ' + ((e && e.message) || e);
  }

  // ---------- Status helpers ----------
  const VAC_STATUS = {
    pending:   { label: 'قيد المراجعة', badge: 'badge-warning' },
    suggested: { label: 'موعد مقترح',   badge: 'badge-info' },
    approved:  { label: 'معتمد',        badge: 'badge-success' },
    rejected:  { label: 'مرفوض',        badge: 'badge-danger' }
  };
  function vacBadge(status) {
    const s = VAC_STATUS[status] || VAC_STATUS.pending;
    return `<span class="badge ${s.badge}"><span class="dot"></span>${s.label}</span>`;
  }
  function catBadge(cat) {
    const c = CATEGORIES[cat] || CATEGORIES.spare_parts;
    return `<span class="badge ${c.badge}"><i class="fa-solid ${c.icon}"></i>${c.label}</span>`;
  }

  // ---------- Layout ----------
  function renderHeader(ctx, active) {
    const el = document.getElementById('appHeader');
    if (!el) return;
    const isAdmin = ctx.can.admin;
    const links = isAdmin ? [
      { key: 'dashboard', href: 'dashboard.html', icon: 'fa-gauge-high', label: 'لوحة التحكم' },
      { key: 'vacations', href: 'vacations.html', icon: 'fa-umbrella-beach', label: 'الإجازات' },
      { key: 'calendar', href: 'calendar.html', icon: 'fa-calendar-days', label: 'التقويم' }
    ] : (ctx.profile.assignedSiteId ? [
      { key: 'site', href: 'details_finance.html?id=' + encodeURIComponent(ctx.profile.assignedSiteId), icon: 'fa-building', label: 'موقعي' }
    ] : []);
    const email = ctx.user.email || '';
    el.className = 'app-header';
    el.innerHTML = `
      <div class="app-header__inner">
        <a class="brand" href="${isAdmin ? 'dashboard.html' : (links[0] ? links[0].href : '#')}">
          <img src="FGC.jpeg" alt="FGC"><span>FGC System<small>إدارة العقود والمشاريع</small></span>
        </a>
        <nav class="main-nav">${links.map(l => `<a href="${l.href}" class="${l.key === active ? 'active' : ''}"><i class="fa-solid ${l.icon}"></i>${l.label}</a>`).join('')}</nav>
        <div class="user-box">
          <div class="user-box__meta"><div class="user-box__email">${esc(email)}</div><span class="badge badge-neutral" style="margin-top:3px">${esc((ROLES[ctx.role] || {}).label || ctx.role)}</span></div>
          <div class="avatar">${esc(email.charAt(0) || '?')}</div>
          <button class="btn btn-ghost btn-icon" title="تسجيل الخروج" onclick="FGC.logout()"><i class="fa-solid fa-arrow-right-from-bracket"></i></button>
        </div>
      </div>`;
  }

  function renderSiteTabs(siteId, active) {
    const el = document.getElementById('siteTabs');
    if (!el) return;
    const id = encodeURIComponent(siteId);
    const tabs = [
      { key: 'finance', href: `details_finance.html?id=${id}`, icon: 'fa-money-bill-wave', label: 'المالية وقطع الغيار' },
      { key: 'vacations', href: `details_vacations.html?id=${id}`, icon: 'fa-umbrella-beach', label: 'إجازات الموظفين' },
      { key: 'subcontracts', href: `details_subcontracts.html?id=${id}`, icon: 'fa-handshake', label: 'المستخلصات والعمالة' },
      { key: 'calibration', href: `details_calibration.html?id=${id}`, icon: 'fa-gauge-simple-high', label: 'المعايرة' }
    ];
    el.className = 'tabs';
    el.innerHTML = tabs.map(t => `<a href="${t.href}" class="${t.key === active ? 'active' : ''}"><i class="fa-solid ${t.icon}"></i>${t.label}</a>`).join('');
  }

  function homeFor(profile) {
    if (!profile) return null;
    if (profile.role === 'admin') return 'dashboard.html';
    if (profile.assignedSiteId) return 'details_finance.html?id=' + encodeURIComponent(profile.assignedSiteId);
    return null;
  }

  /**
   * حماية الصفحة: لازم تسجيل دخول + صلاحية مناسبة
   * opts: { admin: true } صفحة للمدير فقط
   *       { site: true }  صفحة خاصة بموقع (?id=) — غير المدير يشوف موقعه فقط
   */
  function init(opts = {}) {
    return new Promise(resolve => {
      const unsub = auth.onAuthStateChanged(async user => {
        unsub();
        if (!user) { location.replace('index.html'); return; }
        let profile = null;
        try {
          const snap = await db.collection('users').doc(user.uid).get();
          profile = snap.exists ? snap.data() : null;
        } catch (e) { console.error(e); }
        if (!profile) { location.replace('index.html?state=pending'); return; }

        const role = ROLES[profile.role] ? profile.role : 'viewer';
        const can = { ...ROLES[role] };
        const home = homeFor(profile);

        if (opts.admin && !can.admin) { location.replace(home || 'index.html?state=pending'); return; }

        let siteId = null;
        if (opts.site) {
          siteId = param('id');
          if (!can.admin) {
            if (!profile.assignedSiteId) { location.replace('index.html?state=pending'); return; }
            if (siteId !== profile.assignedSiteId) {
              const u = new URL(location.href); u.searchParams.set('id', profile.assignedSiteId);
              location.replace(u.toString()); return;
            }
          }
          if (!siteId) { location.replace(home || 'index.html'); return; }
        }

        const ctx = { user, profile, role, can, siteId };
        renderHeader(ctx, opts.nav);
        if (opts.site) renderSiteTabs(siteId, opts.tab);
        const loader = document.getElementById('pageLoader');
        if (loader) loader.remove();
        resolve(ctx);
      });
    });
  }

  function logout() { auth.signOut().then(() => location.replace('index.html')); }

  window.FGC = {
    db, auth, firebase, ROLES, CATEGORIES, VAC_STATUS,
    $, $$, esc, fmt, num, pad, todayStr, currentMonth, toISODate, normDate, parseDate, daysBetween, addDays, tsMillis, param,
    downloadCSV, download, commitInChunks,
    toast, openModal, closeModal, closeAllModals, confirmDialog, promptDialog, alertDialog, busy, withButton, errMsg,
    vacBadge, catBadge, init, logout, homeFor
  };
})();
