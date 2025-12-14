// إعدادات Firebase (مشتركة لكل الصفحات)
const firebaseConfig = {
    apiKey: "AIzaSyCHZsLreB9fd8fkjnj87miAPDrZsKMOrDI",
    authDomain: "fgcbio.firebaseapp.com",
    projectId: "fgcbio",
    storageBucket: "fgcbio.firebasestorage.app",
    messagingSenderId: "924334872806",
    appId: "1:924334872806:web:fac89ce388b1ff2de24327"
};

// تهيئة التطبيق
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// دالة مساعدة لتنسيق العملة والأرقام (نحتاجها في كل مكان)
function fmt(n) {
    if (isNaN(n) || n === null || n === undefined) return "0.00";
    return Number(n).toLocaleString('ar-EG', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}
