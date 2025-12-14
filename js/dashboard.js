// ننتظر حتى يتم تحميل الصفحة بالكامل (HTML) لتجنب خطأ null
document.addEventListener('DOMContentLoaded', () => {

    // التحقق من الصلاحية عند تحميل الصفحة
    auth.onAuthStateChanged(async user => {
        if(!user) { 
            window.location.href = "index.html"; 
            return; 
        }
        
        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                
                // التأكد من أن العناصر موجودة قبل استخدامها
                const adminPanel = document.getElementById('adminPanel');
                
                // إذا كان أدمن
                if(userData.role === 'admin') {
                    if(adminPanel) adminPanel.style.display = 'block';
                    loadAllSites();
                } else {
                    // مستخدم عادي
                    loadMySite(userData.assignedSiteId);
                }
            }
        } catch (error) { 
            console.error("Error in dashboard:", error); 
        }
    });

});

// ---------------------------------------------------
// الدوال (خارج الـ EventListener لتكون متاحة للأزرار)
// ---------------------------------------------------

function loadAllSites() {
    db.collection("budgets").orderBy("createdAt", "desc").onSnapshot(snap => renderSites(snap.docs));
}

function loadMySite(siteId) {
    const grid = document.getElementById('sitesGrid');
    if(!siteId) {
        if(grid) grid.innerHTML = "<p>لم يتم تعيين مشروع لك.</p>";
        return;
    }
    db.collection("budgets").doc(siteId).onSnapshot(doc => {
        if(doc.exists) renderSites([doc]);
        else if(grid) grid.innerHTML = "<p>المشروع غير موجود.</p>";
    });
}

// عرض الكروت
function renderSites(docs) {
    const container = document.getElementById('sitesGrid');
    if (!container) return; // حماية إضافية

    container.innerHTML = "";
    
    if(docs.length === 0) {
        container.innerHTML = "<p>لا توجد مشاريع حالياً.</p>";
        return;
    }

    docs.forEach(doc => {
        const d = doc.data();
        
        // حساب النسبة اللونية
        const percent = d.totalAllocatedAmount ? (d.currentBalance / d.totalAllocatedAmount) * 100 : 0;
        const balanceColor = percent < 20 ? 'var(--danger)' : 'var(--success)';

        // القيم الرقمية
        const displayProfit = d.totalProfit || 0;
        const displaySpent = d.totalSpent || 0;

        const html = `
        <div class="project-card">
            <div class="card-header">
                <h3>${d.itemName}</h3>
                <div class="icon-box"><i class="fa-solid fa-building"></i></div>
            </div>
            
            <div class="card-body">
                <div class="stat-row">
                    <div class="stat-item">
                        <label>الميزانية</label>
                        <span>${fmt(d.totalAllocatedAmount)}</span>
                    </div>
                    <div class="stat-item" style="text-align: left;">
                        <label>المصروف</label>
                        <span style="color: var(--danger);">${fmt(displaySpent)}</span>
                    </div>
                </div>

                <div class="profit-badge">
                    <label>أرباح الشركة الإجمالية</label>
                    <span>${fmt(displayProfit)} ريال</span>
                </div>

                <div style="text-align: center;">
                    <span style="font-size: 0.9rem; color: #888;">الرصيد المتبقي</span>
                    <div style="font-size: 1.8rem; font-weight: 800; color: ${balanceColor}; line-height: 1;">
                        ${fmt(d.currentBalance)}
                    </div>
                </div>
            </div>

            <div class="card-footer">
                <a href="details.html?id=${doc.id}" class="btn-view">
                    إدارة العمليات والتفاصيل <i class="fa-solid fa-arrow-left" style="margin-right: 5px;"></i>
                </a>
            </div>
        </div>`;
        container.innerHTML += html;
    });
}

function addSite() {
    const name = document.getElementById('newSiteName').value;
    const budget = Number(document.getElementById('newSiteBudget').value);
    if(!name || !budget) return alert("البيانات ناقصة");
    
    db.collection("budgets").add({
        itemName: name, 
        totalAllocatedAmount: budget, 
        currentBalance: budget,
        totalSpent: 0, 
        totalProfit: 0, 
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => { 
        alert("تمت إضافة المشروع"); 
        document.getElementById('newSiteName').value=""; 
        document.getElementById('newSiteBudget').value=""; 
    });
}

async function recalculateAllProjects() {
    if(!confirm("هل أنت متأكد من إعادة الحساب؟")) return;

    const loader = document.getElementById('loader');
    if(loader) loader.style.display = 'flex';

    try {
        const budgetsSnapshot = await db.collection('budgets').get();
        
        const promises = budgetsSnapshot.docs.map(async (budgetDoc) => {
            const budgetRef = budgetDoc.ref;
            const originalBudget = budgetDoc.data().totalAllocatedAmount || 0;
            const transactionsSnapshot = await budgetRef.collection('transactions').get();

            let totalProfit = 0;
            let totalSpent = 0;

            transactionsSnapshot.forEach(doc => {
                const t = doc.data();
                const amount = Number(t.amountExclTax) || 0;
                const profit = Number(t.companyProfit) || 0;
                totalSpent += amount;
                totalProfit += profit;
            });

            return budgetRef.update({
                totalSpent: totalSpent,
                totalProfit: totalProfit,
                currentBalance: originalBudget - totalSpent
            });
        });

        await Promise.all(promises);
        alert("✅ تم التحديث بنجاح!");

    } catch (e) {
        console.error(e);
        alert("حدث خطأ: " + e.message);
    } finally {
        if(loader) loader.style.display = 'none';
    }
}

// -------------------------------------------------------------
// إدارة المستخدمين
// -------------------------------------------------------------
let allBudgets = []; 

function loadBudgetsForDropdown() {
    db.collection('budgets').onSnapshot(snapshot => {
        allBudgets = [];
        snapshot.forEach(doc => {
            allBudgets.push({ id: doc.id, name: doc.data().itemName });
        });
    });
}

async function openUsersModal() {
    const modal = document.getElementById('usersModal');
    if(modal) modal.style.display = 'flex';
    
    const tbody = document.getElementById('usersTableBody');
    if(tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">جاري التحميل...</td></tr>';

    loadBudgetsForDropdown(); // تحديث القائمة

    try {
        const usersSnap = await db.collection('users').orderBy('createdAt', 'desc').get();
        if(tbody) tbody.innerHTML = '';

        usersSnap.forEach(doc => {
            const u = doc.data();
            const userId = doc.id;
            
            let sitesOptions = `<option value="">-- بدون مشروع --</option>`;
            allBudgets.forEach(site => {
                const selected = u.assignedSiteId === site.id ? 'selected' : '';
                sitesOptions += `<option value="${site.id}" ${selected}>${site.name}</option>`;
            });

            const roleUserSel = u.role === 'user' ? 'selected' : '';
            const roleAdminSel = u.role === 'admin' ? 'selected' : '';

            const row = `
            <tr>
                <td>${u.email}</td>
                <td>
                    <select id="role-${userId}">
                        <option value="user" ${roleUserSel}>مستخدم عادي</option>
                        <option value="admin" ${roleAdminSel}>مدير (Admin)</option>
                    </select>
                </td>
                <td>
                    <select id="site-${userId}">
                        ${sitesOptions}
                    </select>
                </td>
                <td>
                    <button onclick="saveUserChanges('${userId}')" class="save-user-btn">حفظ</button>
                </td>
            </tr>`;
            if(tbody) tbody.innerHTML += row;
        });
    } catch (e) {
        console.error(e);
        if(tbody) tbody.innerHTML = '<tr><td colspan="4" style="color:red">خطأ</td></tr>';
    }
}

async function saveUserChanges(userId) {
    const newRole = document.getElementById(`role-${userId}`).value;
    const newSite = document.getElementById(`site-${userId}`).value;
    try {
        await db.collection('users').doc(userId).update({
            role: newRole,
            assignedSiteId: newSite
        });
        alert("تم الحفظ");
    } catch (e) {
        alert("خطأ: " + e.message);
    }
}
