// ============================================================
// 1. الإعدادات والتحقق الأولي
// ============================================================

// جلب معرف الموقع (Site ID) من رابط الصفحة
const siteId = new URLSearchParams(window.location.search).get('id');

// إذا لم يوجد معرف، نعود للصفحة الرئيسية فوراً
if (!siteId) {
    window.location.href = "dashboard.html";
}

// دالة مساعدة: تنسيق التاريخ ليناسب حقول الإدخال (YYYY-MM-DD)
function formatDateForInput(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ============================================================
// 2. مراقبة المستخدم وتحميل البيانات
// ============================================================
auth.onAuthStateChanged(async user => {
    if (user) {
        // جلب بيانات المستخدم لتحديد الصلاحيات
        const u = await db.collection('users').doc(user.uid).get();
        if (u.exists) {
            const userData = u.data();

            // إظهار الأزرار بناءً على الصلاحية
            if (userData.role === 'admin') {
                document.getElementById('adminButtons').style.display = 'flex';
                document.getElementById('adminButtons').style.gap = '10px';
            } else if (userData.role === 'user' && userData.assignedSiteId === siteId) {
                // المستخدم العادي في موقعه المخصص يرى الأزرار أيضاً
                document.getElementById('adminButtons').style.display = 'flex';
                document.getElementById('adminButtons').style.gap = '10px';
            }
        }

        // بدء تحميل البيانات (مشترك للجميع)
        loadPageData();
    } else {
        // غير مسجل دخول
        window.location.href = "index.html";
    }
});

function loadPageData() {
    // أ- مراقبة إحصائيات الموقع (الميزانية، المصروف، المتبقي)
    db.collection("budgets").doc(siteId).onSnapshot(doc => {
        if (!doc.exists) return;
        const d = doc.data();
        
        document.getElementById('siteTitle').innerText = d.itemName;
        document.getElementById('statBudget').innerText = fmt(d.totalAllocatedAmount);
        document.getElementById('statSpent').innerText = fmt(d.totalSpent);
        document.getElementById('statBalance').innerText = fmt(d.currentBalance);
        document.getElementById('statProfit').innerText = fmt(d.totalProfit);
    });

    // ب- مراقبة جدول المعاملات
    db.collection("budgets").doc(siteId).collection("transactions")
        .orderBy("orderNumber", "desc")
        .onSnapshot(snap => {
            const tbody = document.getElementById('tableBody');
            tbody.innerHTML = "";
            
            snap.forEach(doc => {
                const val = doc.data();
                
                // بناء صف الجدول
                const row = `
                <tr class="data-row">
                    <td>${val.orderNumber}</td>
                    <td class="col-date">${val.date}</td>
                    <td class="col-po">${val.poNumber || '-'}</td>
                    <td class="col-supplier">${val.supplierName}</td>
                    <td class="col-invoice">${val.invoiceNum || '-'}</td>
                    <td class="col-invoice-date">${val.invoiceDate || '-'}</td>
                    <td style="font-weight:bold;">${fmt(val.amountExclTax)}</td>
                    <td>${val.companyRatio || 0}</td>
                    <td style="color:var(--accent-gold); font-weight:bold;">${fmt(val.companyProfit)}</td>
                    <td>
                        <button onclick="editTrans('${doc.id}')" class="btn btn-secondary" style="padding:5px 8px; font-size:0.8em;">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button onclick="deleteTrans('${doc.id}', ${val.amountExclTax}, ${val.companyProfit})" class="btn btn-danger" style="padding:5px 8px; font-size:0.8em;">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>`;
                
                tbody.innerHTML += row;
            });
            
            // إعادة تطبيق الفلتر (إذا كان المستخدم يبحث عن شيء)
            applyFilters();
        });
}

// ============================================================
// 3. إدارة النوافذ المنبثقة (Modals)
// ============================================================
function openModal() {
    // تصفير النموذج
    document.getElementById('editTransId').value = "";
    document.getElementById('modalTitle').innerText = "تسجيل معاملة جديدة";
    document.querySelectorAll('#transactionModal input').forEach(i => i.value = "");
    // إظهار النافذة
    document.getElementById('transactionModal').classList.add('show');
}

function closeModal() {
    document.getElementById('transactionModal').classList.remove('show');
}

// ============================================================
// 4. العمليات الرئيسية (CRUD)
// ============================================================

// --- حفظ (إضافة جديد أو تعديل) ---
async function saveTransaction() {
    const id = document.getElementById('editTransId').value;
    
    // قراءة القيم وتجنب NaN
    const amount = parseFloat(document.getElementById('amount').value) || 0;
    const ratio = parseFloat(document.getElementById('ratio').value) || 0;

    const data = {
        orderNumber: Number(document.getElementById('orderNum').value),
        date: document.getElementById('orderDate').value,
        supplierName: document.getElementById('supplier').value,
        amountExclTax: amount,
        companyRatio: ratio,
        companyProfit: amount * ratio, // الحساب التلقائي للربح
        batchNumber: document.getElementById('batch').value,
        invoiceNum: document.getElementById('invoiceNum').value,
        invoiceDate: document.getElementById('invoiceDate').value,
        poNumber: document.getElementById('poNumber').value,
    };

    if (!amount || !data.orderNumber) {
        return alert("يرجى إدخال البيانات الأساسية (رقم التعميد والمبلغ)");
    }

    try {
        await db.runTransaction(async (t) => {
            const siteRef = db.collection("budgets").doc(siteId);
            const siteDoc = await t.get(siteRef);
            const currentSite = siteDoc.data();
            
            let newSpent = currentSite.totalSpent || 0;
            let newProfit = currentSite.totalProfit || 0;
            let newBalance = currentSite.currentBalance || 0;

            if (id) {
                // حالة التعديل: نحذف تأثير القيم القديمة أولاً
                const oldDoc = await t.get(siteRef.collection("transactions").doc(id));
                const oldData = oldDoc.data();
                
                newSpent -= (oldData.amountExclTax || 0);
                newProfit -= (oldData.companyProfit || 0);
                newBalance += (oldData.amountExclTax || 0);
                
                // تحديث المعاملة
                t.update(siteRef.collection("transactions").doc(id), data);
            } else {
                // حالة الإضافة: إنشاء مستند جديد
                data.createdAt = new Date();
                t.set(siteRef.collection("transactions").doc(), data);
            }

            // تطبيق القيم الجديدة
            newSpent += data.amountExclTax;
            newProfit += data.companyProfit;
            newBalance -= data.amountExclTax;

            // تحديث الإجماليات في المستند الرئيسي
            t.update(siteRef, {
                totalSpent: newSpent,
                totalProfit: newProfit,
                currentBalance: newBalance
            });
        });
        
        closeModal(); // إغلاق النافذة بنجاح

    } catch (e) {
        console.error(e);
        alert("خطأ: " + e.message);
    }
}

// --- تحضير التعديل (Fetch & Populate) ---
async function editTrans(id) {
    document.getElementById('modalTitle').innerText = "جاري جلب البيانات...";
    document.getElementById('transactionModal').classList.add('show');

    try {
        const doc = await db.collection("budgets").doc(siteId).collection("transactions").doc(id).get();
        if (!doc.exists) {
            alert("المعاملة غير موجودة");
            closeModal();
            return;
        }

        const d = doc.data();
        
        // تعبئة الحقول
        document.getElementById('editTransId').value = id;
        document.getElementById('modalTitle').innerText = "تعديل المعاملة";
        
        document.getElementById('orderNum').value = d.orderNumber;
        document.getElementById('supplier').value = d.supplierName;
        document.getElementById('amount').value = d.amountExclTax;
        document.getElementById('ratio').value = d.companyRatio;
        document.getElementById('batch').value = d.batchNumber || '';
        document.getElementById('invoiceNum').value = d.invoiceNum || '';
        document.getElementById('poNumber').value = d.poNumber || '';

        // استخدام دالة إصلاح التاريخ
        document.getElementById('orderDate').value = formatDateForInput(d.date);
        document.getElementById('invoiceDate').value = formatDateForInput(d.invoiceDate);

    } catch (e) {
        console.error(e);
        closeModal();
        alert("خطأ في تحميل البيانات");
    }
}

// --- الحذف ---
async function deleteTrans(id, amount, profit) {
    if (!confirm("هل أنت متأكد من الحذف؟ سيتم استرجاع المبلغ للميزانية.")) return;

    try {
        await db.runTransaction(async (t) => {
            const siteRef = db.collection("budgets").doc(siteId);
            const siteDoc = await t.get(siteRef);
            
            // عكس العمليات الحسابية
            t.delete(siteRef.collection("transactions").doc(id));
            t.update(siteRef, {
                totalSpent: (siteDoc.data().totalSpent || 0) - (amount || 0),
                totalProfit: (siteDoc.data().totalProfit || 0) - (profit || 0),
                currentBalance: (siteDoc.data().currentBalance || 0) + (amount || 0)
            });
        });
    } catch (e) {
        alert("خطأ في الحذف: " + e.message);
    }
}

// ============================================================
// 5. الاستيراد (Import CSV)
// ============================================================
function processCSV() {
    const file = document.getElementById('csvFile').files[0];
    if (!file) return alert("يرجى اختيار ملف CSV أولاً");

    Papa.parse(file, {
        header: false,
        encoding: "windows-1256", // لدعم اللغة العربية في ملفات Excel القديمة
        skipEmptyLines: true,
        complete: async function(results) {
            const rows = results.data;
            const batch = db.batch();
            const siteRef = db.collection("budgets").doc(siteId);
            
            let batchSpent = 0;
            let batchProfit = 0;
            
            // البدء من 1 لتجاهل صف العناوين
            for (let i = 1; i < rows.length; i++) {
                const r = rows[i];
                // التأكد من وجود رقم تعميد ومبلغ صالح
                if (!r[0] || isNaN(parseFloat(r[3]))) continue;

                const amount = parseFloat(r[3]) || 0;
                const ratio = parseFloat(r[4]) || 0;
                const profit = amount * ratio;

                const newRef = siteRef.collection("transactions").doc();
                batch.set(newRef, {
                    orderNumber: Number(r[0]),
                    date: r[1],
                    supplierName: r[2],
                    amountExclTax: amount,
                    companyRatio: ratio,
                    companyProfit: profit,
                    invoiceNum: r[5] || '',
                    invoiceDate: r[6] || '',
                    poNumber: r[7] || '',
                    batchNumber: r[8] || '',
                    importedAt: new Date()
                });

                batchSpent += amount;
                batchProfit += profit;
            }

            // تحديث المستند الرئيسي مرة واحدة
            const curDoc = await siteRef.get();
            const curData = curDoc.data();
            
            batch.update(siteRef, {
                totalSpent: (curData.totalSpent || 0) + batchSpent,
                totalProfit: (curData.totalProfit || 0) + batchProfit,
                currentBalance: (curData.currentBalance || 0) - batchSpent
            });

            await batch.commit();
            alert("تم استيراد البيانات بنجاح!");
            location.reload();
        }
    });
}

// ============================================================
// 6. تصفير البيانات (Clear All)
// ============================================================
async function clearAllData() {
    if (!confirm("تحذير خطير! ⚠️\nهل أنت متأكد من حذف جميع المعاملات وتصفير الموقع؟\nلا يمكن التراجع عن هذه الخطوة.")) return;

    try {
        const siteRef = db.collection("budgets").doc(siteId);
        const snapshot = await siteRef.collection("transactions").get();
        
        // استخدام Batch للحذف السريع
        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        // إعادة الأرصدة للبداية
        const siteDoc = await siteRef.get();
        const originalBudget = siteDoc.data().totalAllocatedAmount;

        batch.update(siteRef, {
            totalSpent: 0,
            totalProfit: 0,
            currentBalance: originalBudget
        });

        await batch.commit();
        alert("تم تصفير الموقع بنجاح.");
        location.reload();

    } catch (e) {
        console.error(e);
        alert("حدث خطأ: " + e.message);
    }
}

// ============================================================
// 7. وظيفة الفلترة (Search)
// ============================================================
function applyFilters() {
    const invFilter = document.getElementById('filterInvoice').value.toLowerCase();
    const poFilter = document.getElementById('filterPO').value.toLowerCase();
    const supFilter = document.getElementById('filterSupplier').value.toLowerCase();
    const dateFilter = document.getElementById('filterDate').value;

    const rows = document.querySelectorAll('.data-row');

    rows.forEach(row => {
        const invText = row.querySelector('.col-invoice').innerText.toLowerCase();
        const poText = row.querySelector('.col-po').innerText.toLowerCase();
        const supText = row.querySelector('.col-supplier').innerText.toLowerCase();
        const dateText = row.querySelector('.col-date').innerText;

        let show = true;

        if (invFilter && !invText.includes(invFilter)) show = false;
        if (poFilter && !poText.includes(poFilter)) show = false;
        if (supFilter && !supText.includes(supFilter)) show = false;
        if (dateFilter && dateText !== dateFilter) show = false;

        row.style.display = show ? '' : 'none';
    });
}
