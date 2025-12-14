// عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    // التحقق من الصلاحية (كود مختصر)
    auth.onAuthStateChanged(async user => {
        if (!user) return;
        const u = await db.collection('users').doc(user.uid).get();
        if (u.exists && u.data().role === 'admin') {
            document.getElementById('adminPanel').style.display = 'block';
            loadAllSites();
        } else {
            loadMySite(u.data().assignedSiteId);
        }
    });
});

function loadAllSites() {
    db.collection("budgets").orderBy("createdAt", "desc").onSnapshot(snap => renderSites(snap.docs));
}

function loadMySite(siteId) {
    if (!siteId) return document.getElementById('sitesGrid').innerHTML = "<p>لا يوجد مشروع.</p>";
    db.collection("budgets").doc(siteId).onSnapshot(doc => {
        doc.exists ? renderSites([doc]) : null;
    });
}

function renderSites(docs) {
    const container = document.getElementById('sitesGrid');
    container.innerHTML = "";
    docs.forEach(doc => {
        const d = doc.data();
        const percent = d.totalAllocatedAmount ? (d.currentBalance / d.totalAllocatedAmount) * 100 : 0;
        const color = percent < 20 ? 'var(--danger)' : 'var(--success)';
        
        container.innerHTML += `
        <div class="project-card">
            <div class="card-header"><h3>${d.itemName}</h3></div>
            <div class="card-body">
                <div class="stat-row"><label>الميزانية</label><span>${fmt(d.totalAllocatedAmount)}</span></div>
                <div class="profit-badge"><label>الأرباح</label><span>${fmt(d.totalProfit)}</span></div>
                <div style="text-align:center; color:${color}; font-weight:800; font-size:1.5em">${fmt(d.currentBalance)}</div>
            </div>
            <div class="card-footer"><a href="details.html?id=${doc.id}" class="btn-view">التفاصيل</a></div>
        </div>`;
    });
}

function addSite() {
    const name = document.getElementById('newSiteName').value;
    const budget = Number(document.getElementById('newSiteBudget').value);
    if (!name || !budget) return alert("بيانات ناقصة");
    db.collection("budgets").add({
        itemName: name, totalAllocatedAmount: budget, currentBalance: budget,
        totalSpent: 0, totalProfit: 0, createdAt: new Date()
    });
}

// دالة التحديث الشامل
async function recalculateAllProjects() {
    if(!confirm("تحديث كافة الأرصدة؟")) return;
    document.getElementById('loader').style.display = 'flex';
    // ... (ضع هنا كود الـ recalculate السابق)
    // لعدم الإطالة لم أكرره، انسخه من الرد السابق وضعه هنا
}
