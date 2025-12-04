// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

// 1. АВТОРИЗАЦИЯ (Только функции входа/выхода)
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 2. БАЗА ДАННЫХ (Все функции для работы с чатами и сообщениями перенесены сюда)
import { 
    getFirestore, 
    doc, 
    setDoc, 
    collection, 
    query, 
    where, 
    getDocs,
    getDoc,
    addDoc,             // <-- Перенесено сюда
    serverTimestamp,    // <-- Перенесено сюда
    orderBy,            // <-- Перенесено сюда
    onSnapshot,         // <-- Перенесено сюда
    deleteDoc,          // <-- Перенесено сюда
    updateDoc,          // <-- Перенесено сюда
    arrayUnion          // <-- Перенесено сюда
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

// Глобальные переменные
let currentChatId = null;
let unsubscribeMessages = null; 
let unsubscribeChats = null; // Для отключения прослушки списка чатов
let currentUserData = null; 

// --- DOM ЭЛЕМЕНТЫ ---
const authScreen = document.getElementById('auth-screen');
const hqScreen = document.getElementById('hq-screen');
const chatScreen = document.getElementById('chat-screen'); // Добавил экран чата
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
        // 1. Проверка уникальности никнейма
        const q = query(collection(db, "users"), where("nickname", "==", nickname));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            throw new Error("ПОЗЫВНОЙ УЖЕ ЗАНЯТ ДРУГИМ БОЙЦОМ");
        }

        // 2. Создание аккаунта Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;

        // 3. Запись в БД
        const userData = {
            nickname: nickname,
            email: email,
            rank: "Recruit",
            createdAt: new Date()
        };
        
        await setDoc(doc(db, "users", user.uid), userData);

        // Принудительно обновляем локальные данные, чтобы не ждать onAuthStateChanged
        currentUserData = { uid: user.uid, ...userData };
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

        // Вход по позывному
        if (!loginInput.includes('@')) {
            const q = query(collection(db, "users"), where("nickname", "==", loginInput));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                throw new Error("ПОЗЫВНОЙ НЕ НАЙДЕН В БАЗЕ ДАННЫХ");
            }
            
            querySnapshot.forEach((doc) => {
                emailToUse = doc.data().email;
            });
        }

        await signInWithEmailAndPassword(auth, emailToUse, password);

    } catch (error) {
        logError("ДОСТУП ЗАПРЕЩЕН. ПРОВЕРЬТЕ ДАННЫЕ.");
        console.error(error);
    }
});

// --- СЛУШАТЕЛЬ СОСТОЯНИЯ (СМЕНА ЭКРАНОВ) ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // 1. Боец вошел -> Показываем штаб
        authScreen.classList.remove('active');
        hqScreen.classList.add('active');
        
        // 2. Загружаем данные профиля
        // Если мы только что зарегистрировались, currentUserData может быть уже установлен вручную выше
        if (!currentUserData || currentUserData.uid !== user.uid) {
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                currentUserData = { uid: user.uid, ...userDoc.data() };
                userDisplay.innerText = `БОЕЦ: ${currentUserData.nickname}`;
            } else {
                // Если документ еще создается (гонка при регистрации), показываем email
                userDisplay.innerText = `БОЕЦ: ${user.email}`;
                // Можно добавить повторную попытку загрузки или слушатель, но для начала хватит этого
            }
        } else {
            // Если данные уже есть (установили при регистрации)
             userDisplay.innerText = `БОЕЦ: ${currentUserData.nickname}`;
        }

        // 3. Загружаем чаты в любом случае
        loadMyChats();

    } else {
        // Боец вышел
        hqScreen.classList.remove('active');
        chatScreen.classList.remove('active'); // Скрываем чат если был открыт
        authScreen.classList.add('active');
        
        loginForm.reset();
        currentUserData = null;
        if (unsubscribeChats) unsubscribeChats(); // Отключаем прослушку чатов
    }
});

// --- ФУНКЦИОНАЛ ЧАТОВ (ВСТАВЛЯЕМ СЮДА КОД ИЗ ПРЕДЫДУЩЕГО ОТВЕТА) ---

// 1. Поиск
document.getElementById('btn-search').addEventListener('click', async () => {
    const targetNick = document.getElementById('search-nick').value.trim();
    if (!targetNick) return;
    if (!currentUserData) return alert("ОШИБКА ДОСТУПА: ПРОФИЛЬ НЕ ЗАГРУЖЕН");

    const q = query(collection(db, "users"), where("nickname", "==", targetNick));
    const snap = await getDocs(q);

    if (snap.empty) {
        alert("БОЕЦ НЕ ОБНАРУЖЕН В СЕКТОРЕ");
        return;
    }

    const targetUser = snap.docs[0].data();
    const targetUid = snap.docs[0].id;

    if (targetUid === auth.currentUser.uid) {
        alert("НЕЛЬЗЯ СВЯЗАТЬСЯ С САМИМ СОБОЙ");
        return;
    }

    const chatDocId = [auth.currentUser.uid, targetUid].sort().join("_");
    
    await setDoc(doc(db, "chats", chatDocId), {
        participants: [auth.currentUser.uid, targetUid],
        participantNames: [currentUserData.nickname, targetUser.nickname],
        lastUpdated: serverTimestamp()
    }, { merge: true });

    openChat(chatDocId, targetUser.nickname);
});

// 2. Список чатов
function loadMyChats() {
    if (!auth.currentUser) return;

    const q = query(
        collection(db, "chats"), 
        where("participants", "array-contains", auth.currentUser.uid),
        orderBy("lastUpdated", "desc")
    );

    unsubscribeChats = onSnapshot(q, (snapshot) => {
        const container = document.getElementById('chats-container');
        container.innerHTML = ''; 
        
        if (snapshot.empty) {
            container.innerHTML = '<div class="chat-list-empty"><p>НЕТ АКТИВНЫХ СОЕДИНЕНИЙ</p></div>';
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const otherName = data.participantNames.find(n => n !== currentUserData.nickname) || "UNKNOWN";
            
            const el = document.createElement('div');
            el.className = 'chat-item';
            el.innerText = `>> СВЯЗЬ С: ${otherName}`;
            el.onclick = () => openChat(docSnap.id, otherName);
            container.appendChild(el);
        });
    }, (error) => {
        console.log("Ждем индекс...", error);
        // Если ошибка индекса - не пугаем пользователя
    });
}

// 3. Открытие чата
function openChat(chatId, chatName) {
    currentChatId = chatId;
    hqScreen.classList.remove('active');
    chatScreen.classList.add('active');
    document.getElementById('chat-title').innerText = `КАНАЛ: ${chatName}`;
    document.getElementById('messages-area').innerHTML = ''; 

    const q = query(
        collection(db, "chats", chatId, "messages"), 
        orderBy("createdAt", "asc")
    );

    if (unsubscribeMessages) unsubscribeMessages();

    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        document.getElementById('messages-area').innerHTML = '';
        snapshot.forEach((doc) => {
            renderMessage(doc);
        });
        const area = document.getElementById('messages-area');
        area.scrollTop = area.scrollHeight;
    });
}

// 4. Кнопка НАЗАД
document.getElementById('back-btn').addEventListener('click', () => {
    if (unsubscribeMessages) unsubscribeMessages(); 
    chatScreen.classList.remove('active');
    hqScreen.classList.add('active');
    currentChatId = null;
});

// 5. Отправка сообщения
document.getElementById('msg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !currentChatId) return;

    await addDoc(collection(db, "chats", currentChatId, "messages"), {
        text: text,
        senderId: auth.currentUser.uid,
        senderNick: currentUserData.nickname,
        createdAt: serverTimestamp(),
        edited: false
    });
    
    await updateDoc(doc(db, "chats", currentChatId), {
        lastUpdated: serverTimestamp()
    });

    input.value = '';
});

// 6. Рендер сообщения
function renderMessage(docSnap) {
    const msg = docSnap.data();
    const div = document.createElement('div');
    const isMine = msg.senderId === auth.currentUser.uid;
    
    div.classList.add('msg', isMine ? 'my' : 'other');
    
    let timeString = "...";
    if (msg.createdAt) {
        const date = msg.createdAt.toDate();
        timeString = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    }

    const content = `<div class="msg-text">${msg.text} ${msg.edited ? '<small>(РЕД.)</small>' : ''}</div>`;
    
    let controls = '';
    if (isMine) {
        controls = `
            <div class="msg-controls">
                <span class="btn-edit" onclick="editMsg('${currentChatId}', '${docSnap.id}', '${msg.text}')">[ИЗМ]</span>
                <span class="btn-del" onclick="deleteMsg('${currentChatId}', '${docSnap.id}')">[СТЕРЕТЬ]</span>
            </div>
        `;
    }

    div.innerHTML = `${content} <div class="msg-meta">${controls} ${timeString}</div>`;
    document.getElementById('messages-area').appendChild(div);
}

// Глобальные функции
window.deleteMsg = async (chatId, msgId) => {
    if(confirm("ПОДТВЕРДИТЕ УНИЧТОЖЕНИЕ СООБЩЕНИЯ")) {
        await deleteDoc(doc(db, "chats", chatId, "messages", msgId));
    }
};

window.editMsg = async (chatId, msgId, oldText) => {
    const newText = prompt("ВНЕСИТЕ КОРРЕКТИРОВКИ:", oldText);
    if (newText && newText !== oldText) {
        await updateDoc(doc(db, "chats", chatId, "messages", msgId), {
            text: newText,
            edited: true
        });
    }
};
