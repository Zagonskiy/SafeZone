import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, collection, query, where, getDocs, getDoc,
    addDoc, serverTimestamp, orderBy, onSnapshot, deleteDoc, updateDoc, limit
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
let searchTimeout = null;

// --- DOM ЭЛЕМЕНТЫ ---
const authScreen = document.getElementById('auth-screen');
const appInterface = document.getElementById('app-interface');
const chatPanel = document.getElementById('chat-screen');
const userDisplay = document.getElementById('user-display');
const searchInput = document.getElementById('search-nick');
const searchIndicator = document.getElementById('search-indicator');
const searchResultsArea = document.getElementById('search-results');
const searchList = document.getElementById('search-list');

// --- УТИЛИТЫ (MODAL) ---
const modalOverlay = document.getElementById('custom-modal');
const modalMsg = document.getElementById('modal-msg');
const modalInput = document.getElementById('modal-input-field');
const modalBtnConfirm = document.getElementById('modal-btn-confirm');
const modalBtnCancel = document.getElementById('modal-btn-cancel');

function showModal(text, type = 'alert', placeholder = '') {
    return new Promise((resolve) => {
        modalMsg.innerText = text;
        modalOverlay.classList.add('active');
        modalInput.value = '';
        modalInput.style.display = type === 'prompt' ? 'block' : 'none';
        if(type === 'prompt') modalInput.placeholder = placeholder;
        modalBtnCancel.style.display = type === 'alert' ? 'none' : 'block';
        modalBtnConfirm.innerText = 'OK';
        const cleanup = () => {
            modalOverlay.classList.remove('active');
            modalBtnConfirm.removeEventListener('click', onConfirm);
            modalBtnCancel.removeEventListener('click', onCancel);
        };
        const onConfirm = () => { cleanup(); resolve(type === 'prompt' ? modalInput.value : true); };
        const onCancel = () => { cleanup(); resolve(null); };
        modalBtnConfirm.addEventListener('click', onConfirm);
        modalBtnCancel.addEventListener('click', onCancel);
    });
}

// --- ЖИВОЙ ПОИСК (РАДАР) ---
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const text = e.target.value.trim();
        
        if (!text) {
            searchResultsArea.style.display = 'none';
            if(searchIndicator) searchIndicator.classList.remove('active');
            return;
        }

        if(searchIndicator) searchIndicator.classList.add('active');
        searchResultsArea.style.display = 'block';
        searchList.innerHTML = '<div style="padding:15px; opacity:0.7;">>> СКАНИРОВАНИЕ...</div>';

        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => executeSearch(text), 500);
    });
}

async function executeSearch(queryText) {
    try {
        const endText = queryText + '\uf8ff';
        
        const q = query(
            collection(db, "users"),
            orderBy("nickname"), 
            where("nickname", ">=", queryText),
            where("nickname", "<=", endText),
            limit(3)
        );

        const snap = await getDocs(q);
        renderSearchResults(snap, queryText);
        
    } catch (error) {
        console.error("ОШИБКА ПОИСКА:", error);
        let errorMsg = "СБОЙ СИСТЕМЫ";
        if (error.message.includes("index")) {
            errorMsg = "ТРЕБУЕТСЯ ИНДЕКС (СМ. КОНСОЛЬ F12)";
        }
        searchList.innerHTML = `<div style="padding:15px; color:red;">${errorMsg}</div>`;
    } finally {
        if(searchIndicator) searchIndicator.classList.remove('active');
    }
}

function renderSearchResults(snapshot, queryText) {
    searchList.innerHTML = ''; 

    if (snapshot.empty) {
        searchList.innerHTML = `
            <div style="padding:15px; opacity:0.5; text-align:center;">
                ЦЕЛЬ НЕ ОБНАРУЖЕНА<br>
                <span style="font-size:0.7rem; color:red;">(Учитывайте регистр букв!)</span>
            </div>`;
        return;
    }

    let count = 0;
    snapshot.forEach(docSnap => {
        const user = docSnap.data();
        const uid = docSnap.id;

        if (uid === auth.currentUser.uid) return; 

        count++;
        const item = document.createElement('div');
        item.className = 'search-item';
        item.innerHTML = `
            <span>${user.nickname}</span> 
            <span style="font-size:0.8rem; opacity:0.6;">[СВЯЗАТЬСЯ]</span>
        `;
        
        item.onclick = () => {
            searchInput.value = '';
            searchResultsArea.style.display = 'none';
            startChat(uid, user.nickname);
        };
        
        searchList.appendChild(item);
    });

    if (count === 0) {
        searchList.innerHTML = '<div style="padding:15px; opacity:0.5;">ТОЛЬКО ВЫ</div>';
    }
}

// Создание Чата
async function startChat(targetUid, targetNick) {
    const chatDocId = [auth.currentUser.uid, targetUid].sort().join("_");
    
    await setDoc(doc(db, "chats", chatDocId), {
        participants: [auth.currentUser.uid, targetUid],
        participantNames: [currentUserData.nickname, targetNick],
        lastUpdated: serverTimestamp()
    }, { merge: true });

    openChat(chatDocId, targetNick);
}

// Клик вне зоны поиска
document.addEventListener('click', (e) => {
    if (searchInput && !searchInput.contains(e.target) && !searchResultsArea.contains(e.target)) {
        searchResultsArea.style.display = 'none';
    }
});

// --- ОСТАЛЬНАЯ ЛОГИКА ---

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));
document.getElementById('to-register').addEventListener('click', () => {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
});
document.getElementById('to-login').addEventListener('click', () => {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
});
document.getElementById('back-btn').addEventListener('click', () => {
    chatPanel.classList.remove('open');
    if (unsubscribeMessages) unsubscribeMessages();
    currentChatId = null;
    document.getElementById('msg-form').style.display = 'none';
    document.getElementById('chat-title').innerText = "КАНАЛ: НЕ ВЫБРАН";
    document.getElementById('messages-area').innerHTML = '<div class="no-chat-selected"><p>> СВЯЗЬ ПРЕРВАНА</p></div>';
});

// Авторизация
onAuthStateChanged(auth, async (user) => {
    if (user) {
        authScreen.classList.remove('active');
        appInterface.classList.remove('hidden'); 
        if (!currentUserData || currentUserData.uid !== user.uid) {
            const snap = await getDoc(doc(db, "users", user.uid));
            if (snap.exists()) currentUserData = { uid: user.uid, ...snap.data() };
        }
        userDisplay.innerText = currentUserData ? `БОЕЦ: ${currentUserData.nickname}` : `ID: UNKNOWN`;
        loadMyChats();
    } else {
        appInterface.classList.add('hidden');
        authScreen.classList.add('active');
        currentUserData = null;
    }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nick = document.getElementById('reg-nick').value.trim();
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    if (pass !== document.getElementById('reg-pass-conf').value) return showModal('ПАРОЛИ НЕ СОВПАДАЮТ', 'alert');
    try {
        const q = query(collection(db, "users"), where("nickname", "==", nick));
        if (!(await getDocs(q)).empty) throw new Error("ПОЗЫВНОЙ ЗАНЯТ");
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await setDoc(doc(db, "users", cred.user.uid), { nickname: nick, email, createdAt: new Date() });
        currentUserData = { uid: cred.user.uid, nickname: nick, email };
    } catch (err) { showModal(err.message, 'alert'); }
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('login-id').value.trim();
    const pass = document.getElementById('login-pass').value;
    try {
        let email = id;
        if (!id.includes('@')) {
            const q = query(collection(db, "users"), where("nickname", "==", id));
            const snap = await getDocs(q);
            if (snap.empty) throw new Error("ПОЗЫВНОЙ НЕ НАЙДЕН");
            email = snap.docs[0].data().email;
        }
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) { showModal("ОШИБКА ДОСТУПА", 'alert'); }
});

// Список чатов
function loadMyChats() {
    if (!auth.currentUser) return;
    const q = query(collection(db, "chats"), where("participants", "array-contains", auth.currentUser.uid), orderBy("lastUpdated", "desc"));
    unsubscribeChats = onSnapshot(q, (snap) => {
        const container = document.getElementById('chats-container');
        container.innerHTML = '';
        if (snap.empty) {
            document.getElementById('empty-state').style.display = 'flex';
        } else {
            document.getElementById('empty-state').style.display = 'none';
            snap.forEach(d => {
                const data = d.data();
                const name = data.participantNames.find(n => n !== currentUserData.nickname) || "UNKNOWN";
                const el = document.createElement('div');
                el.className = 'chat-item';
                el.innerHTML = `<span>${name}</span>`;
                el.onclick = () => openChat(d.id, name);
                container.appendChild(el);
            });
        }
    });
}

// Сообщения
function openChat(chatId, chatName) {
    currentChatId = chatId;
    document.getElementById('chat-title').innerText = `КАНАЛ: ${chatName}`;
    document.getElementById('msg-form').style.display = 'flex'; 
    document.getElementById('messages-area').innerHTML = ''; 
    chatPanel.classList.add('open');
    
    // Скрываем клавиатуру/поиск на мобильных
    if(searchInput) searchInput.blur(); 

    if (unsubscribeMessages) unsubscribeMessages();
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"));
    unsubscribeMessages = onSnapshot(q, (snap) => {
        const area = document.getElementById('messages-area');
        area.innerHTML = '';
        snap.forEach(renderMessage);
        area.scrollTop = area.scrollHeight;
    });
}

document.getElementById('msg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !currentChatId) return;
    await addDoc(collection(db, "chats", currentChatId, "messages"), {
        text, senderId: auth.currentUser.uid, senderNick: currentUserData.nickname,
        createdAt: serverTimestamp(), edited: false
    });
    await updateDoc(doc(db, "chats", currentChatId), { lastUpdated: serverTimestamp() });
    input.value = '';
});

// --- ВАЖНОЕ ИСПРАВЛЕНИЕ: ОТРИСОВКА СООБЩЕНИЙ ---
// Теперь кнопки создаются программно, а не строкой HTML
function renderMessage(docSnap) {
    const msg = docSnap.data();
    const isMine = msg.senderId === auth.currentUser.uid;
    
    // Создаем контейнер сообщения
    const div = document.createElement('div');
    div.className = `msg ${isMine ? 'my' : 'other'}`;
    
    // Текст сообщения
    const textDiv = document.createElement('div');
    textDiv.innerHTML = `${msg.text} ${msg.edited ? '<small>(РЕД.)</small>' : ''}`;
    
    // Мета-данные (время и кнопки)
    const metaDiv = document.createElement('div');
    metaDiv.className = 'msg-meta';
    
    // Добавляем кнопки управления ТОЛЬКО для своих сообщений
    if (isMine) {
        // Кнопка [E]dit
        const editBtn = document.createElement('span');
        editBtn.innerText = '[E]';
        editBtn.style.cursor = 'pointer';
        editBtn.style.marginRight = '8px';
        editBtn.onclick = () => editMsg(currentChatId, docSnap.id, msg.text); // Событие напрямую

        // Кнопка [X] Delete
        const delBtn = document.createElement('span');
        delBtn.innerText = '[X]';
        delBtn.style.cursor = 'pointer';
        delBtn.style.marginRight = '8px';
        delBtn.onclick = () => deleteMsg(currentChatId, docSnap.id); // Событие напрямую

        metaDiv.appendChild(editBtn);
        metaDiv.appendChild(delBtn);
    }

    // Время
    const timeSpan = document.createElement('span');
    const date = msg.createdAt ? msg.createdAt.toDate() : new Date();
    timeSpan.innerText = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    metaDiv.appendChild(timeSpan);

    // Собираем всё вместе
    div.appendChild(textDiv);
    div.appendChild(metaDiv);
    
    document.getElementById('messages-area').appendChild(div);
}

// Функции управления сообщениями (Локальные)
async function deleteMsg(cId, mId) { 
    if (await showModal('УДАЛИТЬ?', 'confirm')) {
        await deleteDoc(doc(db, "chats", cId, "messages", mId)); 
    }
}

async function editMsg(cId, mId, old) {
    const val = await showModal('ИЗМЕНИТЬ:', 'prompt', old);
    if (val && val !== old) {
        await updateDoc(doc(db, "chats", cId, "messages", mId), { text: val, edited: true });
    }
}
