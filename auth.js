// auth.js
import { auth, db, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, doc, setDoc } from "./firebase-config.js";

// Элементы DOM
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const goToRegister = document.getElementById('go-to-register');
const goToLogin = document.getElementById('go-to-login');

// Переключение между формами
goToRegister.addEventListener('click', () => {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
});

goToLogin.addEventListener('click', () => {
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
});

// --- РЕГИСТРАЦИЯ ---
document.getElementById('btn-register').addEventListener('click', async () => {
    const nick = document.getElementById('reg-nick').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    const passConfirm = document.getElementById('reg-pass-confirm').value;
    const errorMsg = document.getElementById('reg-error');

    errorMsg.innerText = "";

    if(pass !== passConfirm) {
        errorMsg.innerText = "Ошибка: Пароли не совпадают!";
        return;
    }

    if(!nick) {
        errorMsg.innerText = "Ошибка: Введите позывной!";
        return;
    }

    try {
        // 1. Создаем пользователя в Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;

        // 2. Сохраняем ник и почту в Firestore (коллекция "users")
        await setDoc(doc(db, "users", user.uid), {
            nickname: nick,
            email: email,
            createdAt: new Date()
        });

        alert("Доступ разрешен. Добро пожаловать, " + nick);
        // Переадресация произойдет автоматически через onAuthStateChanged
    } catch (error) {
        errorMsg.innerText = "Ошибка системы: " + error.message;
    }
});

// --- ВХОД ---
document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    const errorMsg = document.getElementById('login-error');

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        // Успех
    } catch (error) {
        errorMsg.innerText = "Ошибка доступа: Неверные данные.";
    }
});

// --- ПРОВЕРКА СТАТУСА ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Если пользователь вошел, перекидываем на SafeZone
        window.location.href = "app.html";
    }
});
