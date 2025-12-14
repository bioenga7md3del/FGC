let isLoginMode = true;
let isSigningUp = false;

// مراقبة حالة المستخدم والتوجيه
function initAuthListener(currentPage) {
    auth.onAuthStateChanged(async user => {
        if (user && !isSigningUp) {
            // إذا كنا في صفحة الدخول، وجب التوجيه
            if (currentPage === 'login') {
                const userDoc = await db.collection('users').doc(user.uid).get();
                if (userDoc.exists) {
                    const role = userDoc.data().role;
                    const siteId = userDoc.data().assignedSiteId;
                    
                    if (role === 'admin') window.location.href = "dashboard.html";
                    else if (role === 'user' && siteId) window.location.href = "details.html?id=" + siteId;
                    else window.location.href = "dashboard.html";
                }
            }
        } else {
            // إذا لم يكن مسجلاً وحاول دخول صفحات النظام
            if (currentPage !== 'login') {
                window.location.href = "index.html";
            }
        }
    });
}

// دالة تسجيل الدخول وإنشاء الحساب (لصفحة index.html)
function handleAuth() {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    const btn = document.getElementById('actionBtn');
    const errorMsg = document.getElementById('errorMsg');

    if (!email || !pass) return errorMsg.innerText = "البيانات ناقصة";
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري العمل...';

    if (isLoginMode) {
        auth.signInWithEmailAndPassword(email, pass).catch(err => {
            btn.disabled = false;
            btn.innerHTML = 'دخول للنظام';
            errorMsg.innerText = "خطأ: " + err.message;
        });
    } else {
        isSigningUp = true;
        auth.createUserWithEmailAndPassword(email, pass)
            .then((cred) => {
                return db.collection('users').doc(cred.user.uid).set({
                    email: email, role: 'user', assignedSiteId: '', createdAt: new Date()
                });
            })
            .then(() => window.location.href = "dashboard.html")
            .catch(err => {
                isSigningUp = false;
                btn.disabled = false;
                errorMsg.innerText = err.message;
            });
    }
}

// دالة تسجيل الخروج (تستخدم في كل الصفحات)
function logout() {
    auth.signOut().then(() => window.location.href = "index.html");
}

// تبديل الواجهة
function toggleMode() {
    isLoginMode = !isLoginMode;
    const title = document.getElementById('formTitle');
    const btn = document.getElementById('actionBtn');
    const link = document.querySelector('.switch-mode a');
    
    if (isLoginMode) {
        title.innerText = "مرحباً بك مجدداً 👋";
        btn.innerText = "دخول للنظام";
        link.innerText = "إنشاء حساب جديد";
    } else {
        title.innerText = "إنشاء حساب جديد 🚀";
        btn.innerText = "تسجيل حساب";
        link.innerText = "تسجيل الدخول";
    }
}
