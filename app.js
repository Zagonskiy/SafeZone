// Import the functions from the SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    collection, 
    query, 
    where, 
    getDocs,
    getDoc,
    addDoc,
    serverTimestamp,
    orderBy,
    onSnapshot,
    deleteDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- КОНФИГУРАЦИЯ ---
const firebaseConfig = {
  apiKey: "AIzaSyDa1-4bIIU_dcYe8z3UPpDj_aOAgLuKBjY",
  authDomain: "safezone-91a89.firebaseapp.com",
  projectId: "safezone-91a89",
  storageBucket: "safezone-91a89.firebasestorage.app",
  messagingSenderId: "708254103270",
  appId: "1:708254103270:web:007d8a39c52f8f73ae6d27",
  measurementId: "G-BSERQ5X1CF"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Глобальные переменные
let currentChatId = null;
let unsubscribeMessages = null; 
let unsubscribeChats = null; 
let currentUserData = null; 

// --- DOM ЭЛЕМЕНТЫ ---
const authScreen = document.getElementById('auth-screen');
const hqScreen = document.getElementById('hq-screen');
const chatScreen = document.getElementById('chat-screen');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const errorLog = document.getElementById('error-log');
const userDisplay = document.getElementById('user-display');
const emptyState = document.getElementById('empty-state');
const chatsContainer = document.getElementById('chats-container');

// Модальные элементы
const modalOverlay = document.getElementById('custom-modal');
const modalMsg = document.getElementById('modal-msg');
const modalInput = document.getElementById('modal-input-field');
const modalBtnConfirm = document.getElementById('modal-btn-confirm');
const modalBtnCancel = document.getElementById('modal-btn-cancel');

// --- УТИЛИТЫ ---
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

// --- СИСТЕМА МОДАЛЬНЫХ ОКОН ---
function showModal(text, type = 'alert', placeholder = '') {
    return new Promise((resolve) => {
        modalMsg.innerText = text;
        modalOverlay.classList.add('active');
        
        modalInput.value = '';
        modalInput.style.display = type === 'prompt' ? 'block' : 'none';
        if(type === 'prompt') modalInput.placeholder = placeholder;

        modalBtnCancel.style.display = type === 'alert' ? 'none' : 'block';
        modalBtnConfirm.innerText = type === 'alert' ? 'OK' : 'ПРИНЯТЬ';

        const cleanup = () => {
            modalOverlay.classList.remove('active');
            modalBtnConfirm.removeEventListener('click', onConfirm);
            modalBtnCancel.removeEventListener('click', onCancel);
        };

        const onConfirm = () => {
            cleanup();
            if (type === 'prompt') resolve(modalInput.value);
            else resolve(true);
        };

        const onCancel = () => {
            cleanup();
            resolve(null);
        };

        modalBtnConfirm.addEventListener('click', onConfirm);
        modalBtnCancel.addEventListener('click', onCancel);
    });
}

// --- РЕГИСТРАЦИЯ ---
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nickname = document.getElementById('reg-nick').value.trim();
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    const passConf = document.getElementById('reg-pass-conf').value;

    if (pass !== passConf) return logError("КОДЫ ДОСТУПА НЕ СОВПАДАЮТ");
    if (nickname.length < 3) return logError("ПОЗЫВНОЙ СЛИШКОМ КОРОТКИЙ");

    try {
        const q = query(collection(db, "users"), where("nickname", "==", nickname));
        const snap = await getDocs(q);
        if (!snap.empty) throw new Error("ПОЗЫВНОЙ ЗАНЯТ");

        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        const userData = { nickname, email, rank: "Recruit", createdAt: new Date() };
        
        await setDoc(doc(db, "users", cred.user.uid), userData);
        currentUserData = { uid: cred.user.uid, ...userData };
        
    } catch (error) {
        let msg = error.message;
        if (msg.includes("email-already-in-use")) msg = "EMAIL ЗАНЯТ";
        logError(msg);
    }
});

// --- ВХОД ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const loginInput = document.getElementById('login-id').value.trim();
    const password = document.getElementById('login-pass').value;

    try {
        let emailToUse = loginInput;
        if (!loginInput.includes('@')) {
            const q = query(collection(db, "users"), where("nickname", "==", loginInput));
            const snap = await getDocs(q);
            if (snap.empty) throw new Error("ПОЗЫВНОЙ НЕ НАЙДЕН");
            emailToUse = snap.docs[0].data().email;
        }
        await signInWithEmailAndPassword(auth, emailToUse, password);
    } catch (error) {
        logError("ДОСТУП ЗАПРЕЩЕН");
    }
});

// --- ГЛАВНЫЙ КОНТРОЛЛЕР ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        authScreen.classList.remove('active');
        hqScreen.classList.add('active');
        
        if (!currentUserData || currentUserData.uid !== user.uid) {
            const snap = await getDoc(doc(db, "users", user.uid));
            if (snap.exists()) {
                currentUserData = { uid: user.uid, ...snap.data() };
            }
        }
        userDisplay.innerText = currentUserData ? `БОЕЦ: ${currentUserData.nickname}` : `ID: ${user.uid}`;
        
        loadMyChats();

    } else {
        hqScreen.classList.remove('active');
        chatScreen.classList.remove('active');
        authScreen.classList.add('active');
        loginForm.reset();
        currentUserData = null;
        if (unsubscribeChats) unsubscribeChats();
    }
});

// --- ПОИСК И СОЗДАНИЕ ЧАТА ---
document.getElementById('btn-search').addEventListener('click', async () => {
    const targetNick = document.getElementById('search-nick').value.trim();
    if (!targetNick) return;

    const q = query(collection(db, "users"), where("nickname", "==", targetNick));
    const snap = await getDocs(q);

    if (snap.empty) {
        await showModal("БОЕЦ НЕ ОБНАРУЖЕН", 'alert');
        return;
    }

    const targetUser = snap.docs[0].data();
    const targetUid = snap.docs[0].id;

    if (targetUid === auth.currentUser.uid) {
        await showModal("САМОСТОЯТЕЛЬНАЯ СВЯЗЬ ЗАПРЕЩЕНА", 'alert');
        return;
    }

    const chatDocId = [auth.currentUser.uid, targetUid].sort().join("_");
    
    // Создаем или обновляем чат
    await setDoc(doc(db, "chats", chatDocId), {
        participants: [auth.currentUser.uid, targetUid],
        participantNames: [currentUserData.nickname, targetUser.nickname],
        lastUpdated: serverTimestamp()
    }, { merge: true });

    openChat(chatDocId, targetUser.nickname);
});

// --- СПИСОК ЧАТОВ ---
function loadMyChats() {
    if (!auth.currentUser) return;
    
    // ВНИМАНИЕ: Если чаты не грузятся, посмотри в консоль и нажми на ссылку для создания индекса!
    const q = query(
        collection(db, "chats"), 
        where("participants", "array-contains", auth.currentUser.uid),
        orderBy("lastUpdated", "desc")
    );

    unsubscribeChats = onSnapshot(q, (snapshot) => {
        chatsContainer.innerHTML = '';
        
        if (snapshot.empty) {
            emptyState.style.display = 'flex';
        } else {
            emptyState.style.display = 'none';
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const otherName = data.participantNames.find(n => n !== currentUserData.nickname) || "UNKNOWN";
                
                const el = document.createElement('div');
                el.className = 'chat-item';
                el.innerText = `>> СВЯЗЬ С: ${otherName}`;
                el.onclick = () => openChat(docSnap.id, otherName);
                chatsContainer.appendChild(el);
            });
        }
    }, (error) => {
        console.error("ОШИБКА ЗАГРУЗКИ ЧАТОВ:", error);
        if(error.message.includes("index")) {
            console.log("!!! СОЗДАТЕЛЬ, ТРЕБУЕТСЯ СОЗДАНИЕ ИНДЕКСА В FIREBASE. ССЫЛКА ВЫШЕ !!!");
        }
    });
}

// --- ЧАТ ---
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

document.getElementById('back-btn').addEventListener('click', () => {
    if (unsubscribeMessages) unsubscribeMessages(); 
    chatScreen.classList.remove('active');
    hqScreen.classList.add('active');
    currentChatId = null;
});

// --- ОТПРАВКА СООБЩЕНИЙ ---
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

// --- РЕНДЕР СООБЩЕНИЯ ---
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

// Глобальные функции для HTML onclick
window.deleteMsg = async (chatId, msgId) => {
    const confirmed = await showModal("УНИЧТОЖИТЬ СООБЩЕНИЕ?", 'confirm');
    if(confirmed) {
        await deleteDoc(doc(db, "chats", chatId, "messages", msgId));
    }
};

window.editMsg = async (chatId, msgId, oldText) => {
    const newText = await showModal("ВНЕСИТЕ КОРРЕКТИРОВКИ:", 'prompt', oldText);
    if (newText && newText !== oldText) {
        await updateDoc(doc(db, "chats", chatId, "messages", msgId), {
            text: newText,
            edited: true
        });
    }
};
