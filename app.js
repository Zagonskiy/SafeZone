// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    addDoc, 
    serverTimestamp, 
    orderBy, 
    onSnapshot, 
    deleteDoc, 
    updateDoc, 
    arrayUnion
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    collection, 
    query, 
    where, 
    getDocs,
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- КОНФИГУРАЦИЯ (ВСТАВЬ СВОИ ДАННЫЕ СЮДА) ---
const firebaseConfig = {
  apiKey: "AIzaSyDa1-4bIIU_dcYe8z3UPpDj_aOAgLuKBjY",
  authDomain: "safezone-91a89.firebaseapp.com",
  projectId: "safezone-91a89",
  storageBucket: "safezone-91a89.firebasestorage.app",
  messagingSenderId: "708254103270",
  appId: "1:708254103270:web:007d8a39c52f8f73ae6d27",
  measurementId: "G-BSERQ5X1CF"
};

// Инициализация
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- DOM ЭЛЕМЕНТЫ ---
const authScreen = document.getElementById('auth-screen');
const hqScreen = document.getElementById('hq-screen');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const errorLog = document.getElementById('error-log');
const userDisplay = document.getElementById('user-display');

// Переключатели
document.getElementById('to-register').addEventListener('click', () => toggleForms(false));
document.getElementById('to-login').addEventListener('click', () => toggleForms(true));
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

function toggleForms(showLogin) {
    loginForm.style.display = showLogin ? 'block' : 'none';
    registerForm.style.display = showLogin ? 'none' : 'block';
    errorLog.innerText = '';
}

function logError(msg) {
    errorLog.innerText = `>>> ОШИБКА: ${msg}`;
    // Звуковой эффект ошибки (по желанию)
}

// --- ЛОГИКА РЕГИСТРАЦИИ (ВЕРБОВКА) ---
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nickname = document.getElementById('reg-nick').value.trim();
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    const passConf = document.getElementById('reg-pass-conf').value;

    if (pass !== passConf) return logError("КОДЫ ДОСТУПА НЕ СОВПАДАЮТ");
    if (nickname.length < 3) return logError("ПОЗЫВНОЙ СЛИШКОМ КОРОТКИЙ");

    try {
        // 1. Проверяем, занят ли никнейм (через Firestore)
        const q = query(collection(db, "users"), where("nickname", "==", nickname));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            throw new Error("ПОЗЫВНОЙ УЖЕ ЗАНЯТ ДРУГИМ БОЙЦОМ");
        }

        // 2. Создаем пользователя в Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;

        // 3. Сохраняем никнейм в Firestore (для поиска при входе)
        await setDoc(doc(db, "users", user.uid), {
            nickname: nickname,
            email: email,
            rank: "Recruit", // для будущего
            createdAt: new Date()
        });

        console.log("Боец завербован:", user.uid);
        
    } catch (error) {
        let msg = error.message;
        if (msg.includes("email-already-in-use")) msg = "ЧАСТОТА (EMAIL) УЖЕ ИСПОЛЬЗУЕТСЯ";
        logError(msg);
    }
});

// --- ЛОГИКА ВХОДА (КПП) ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const loginInput = document.getElementById('login-id').value.trim();
    const password = document.getElementById('login-pass').value;

    try {
        let emailToUse = loginInput;

        // Проверяем: это Email или Позывной? (Если нет @, считаем позывным)
        if (!loginInput.includes('@')) {
            // Ищем email по позывному в базе
            const q = query(collection(db, "users"), where("nickname", "==", loginInput));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                throw new Error("ПОЗЫВНОЙ НЕ НАЙДЕН В БАЗЕ ДАННЫХ");
            }
            
            // Берем email из найденного документа
            querySnapshot.forEach((doc) => {
                emailToUse = doc.data().email;
            });
        }

        // Стандартный вход Firebase
        await signInWithEmailAndPassword(auth, emailToUse, password);

    } catch (error) {
        logError("ДОСТУП ЗАПРЕЩЕН. ПРОВЕРЬТЕ ДАННЫЕ.");
        console.error(error);
    }
});

// --- СЛУШАТЕЛЬ СОСТОЯНИЯ (СМЕНА ЭКРАНОВ) ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Боец в системе
        authScreen.classList.remove('active');
        hqScreen.classList.add('active');
        
        // Получаем позывной из базы
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            userDisplay.innerText = `БОЕЦ: ${userDoc.data().nickname}`;
        } else {
            userDisplay.innerText = `БОЕЦ: ${user.email}`;
        }

    } else {
        // Боец вышел
        hqScreen.classList.remove('active');
        authScreen.classList.add('active');
        loginForm.reset();
    }
});
