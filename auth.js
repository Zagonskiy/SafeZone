// auth.js
import { 
    auth, db, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
    onAuthStateChanged, doc, setDoc, 
    collection, query, where, getDocs // <--- ДОБАВЛЕНО
} from "./firebase-config.js";

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

// --- РЕГИСТРАЦИЯ (С ОТЛАДКОЙ) ---
const btnRegister = document.getElementById('btn-register');
if (btnRegister) {
    btnRegister.addEventListener('click', async () => {
        console.log("1. Нажата кнопка регистрации");
        
        const nick = document.getElementById('reg-nick').value;
        const email = document.getElementById('reg-email').value;
        const pass = document.getElementById('reg-pass').value;
        const passConfirm = document.getElementById('reg-pass-confirm').value;
        const errorMsg = document.getElementById('reg-error');

        errorMsg.innerText = "";

        if(pass !== passConfirm) {
            errorMsg.innerText = "Пароли не совпадают!";
            return;
        }

        if(!nick) {
            errorMsg.innerText = "Введите позывной!";
            return;
        }

        try {
            console.log("2. Пытаюсь создать пользователя в Auth...");
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            const user = userCredential.user;
            console.log("3. Пользователь в Auth создан! UID:", user.uid);

            console.log("4. Пытаюсь записать данные в Firestore...");
            
            // Внимание: проверь, что 'users' написано так же, как в правилах
            await setDoc(doc(db, "users", user.uid), {
                nickname: nick,
                email: email,
                createdAt: new Date().toISOString() // Используем строку для надежности
            });
            
            console.log("5. УРА! Запись в базу прошла успешно!");
            alert("Доступ разрешен. Позывной: " + nick);
            
        } catch (error) {
            console.error("КРИТИЧЕСКАЯ ОШИБКА:", error);
            
            // Расшифровка ошибок для тебя
            if (error.code === 'auth/email-already-in-use') {
                errorMsg.innerText = "Эта почта уже занята (удали её в Authentication).";
            } else if (error.code === 'permission-denied') {
                errorMsg.innerText = "Ошибка прав доступа (проверь Rules).";
            } else {
                errorMsg.innerText = "Ошибка: " + error.message;
            }
        }
    });
}

// --- ВХОД (ОБНОВЛЕННЫЙ) ---
document.getElementById('btn-login').addEventListener('click', async () => {
    const inputVal = document.getElementById('login-email').value; // Тут может быть ник или почта
    const pass = document.getElementById('login-password').value;
    const errorMsg = document.getElementById('login-error');
    
    errorMsg.innerText = ""; // Очистить старые ошибки

    let emailToUse = inputVal;

    try {
        // Проверяем: это почта или ник? (есть ли символ @)
        if (!inputVal.includes('@')) {
            // Если нет @, значит это ник. Ищем почту в базе.
            const usersRef = collection(db, "users");
            // Запрос: найди документы, где поле nickname равно введенному значению
            const q = query(usersRef, where("nickname", "==", inputVal));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                throw new Error("Позывной не найден.");
            }

            // Берем почту первого найденного пользователя
            emailToUse = querySnapshot.docs[0].data().email;
        }

        // Теперь у нас точно есть почта (либо ввели сразу, либо нашли по нику)
        // Выполняем обычный вход
        await signInWithEmailAndPassword(auth, emailToUse, pass);
        // Если успех - сработает onAuthStateChanged и перекинет на app.html

    } catch (error) {
        console.error(error); // Полезно смотреть в консоль (F12)
        
        let message = "Ошибка доступа.";
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            message = "Неверный пароль или логин.";
        } else if (error.message === "Позывной не найден.") {
            message = "Такой позывной не зарегистрирован.";
        }
        
        errorMsg.innerText = message;
    }
});

// --- ПРОВЕРКА СТАТУСА ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Если пользователь вошел, перекидываем на SafeZone
        window.location.href = "app.html";
    }
});
