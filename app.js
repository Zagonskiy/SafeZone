// Import logic
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

// Глобальные
let currentChatId = null;
let unsubscribeMessages = null; 
let unsubscribeChats = null; 
let currentUserData = null; 

// --- DOM ЭЛЕМЕНТЫ ---
const authScreen = document.getElementById('auth-screen');
const appInterface = document.getElementById('app-interface');
const chatPanel = document.getElementById('chat-screen'); // Правая панель
const userDisplay = document.getElementById('user-display');

// --- ПЕРЕМЕННЫЕ ПОИСКА ---
const searchInput = document.getElementById('search-nick');
const searchIndicator = document.getElementById('search-indicator');
const searchResultsArea = document.getElementById('search-results');
const searchList = document.getElementById('search-list');

// --- ЖИВОЙ ПОИСК (LIVE RADAR) ---
let searchTimeout = null;

searchInput.addEventListener('input', (e) => {
    const text = e.target.value.trim();

    // 1. Если пусто — скрываем результаты моментально
    if (!text) {
        searchResultsArea.style.display = 'none';
        searchIndicator.classList.remove('active');
        return;
    }

    // 2. Визуальный эффект "сканирования"
    searchIndicator.classList.add('active');
    searchResultsArea.style.display = 'block';
    searchList.innerHTML = '<div style="padding:10px; opacity:0.5;">> СКАНИРОВАНИЕ...</div>';

    // 3. Debounce (Задержка), чтобы не бомбить базу на каждой букве (ждем 300мс после ввода)
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => executeSearch(text), 300);
});

// Функция выполнения запроса
async function executeSearch(queryText) {
    try {
        // Firebase трюк для поиска "начинается с..."
        // Ищем от queryText до queryText + специальный символ
        const endText = queryText + '\uf8ff';

        const q = query(
            collection(db, "users"),
            orderBy("nickname"), // Обязательно для range-поиска
            where("nickname", ">=", queryText),
            where("nickname", "<=", endText),
            limit(3) // Ограничиваем тремя бойцами
        );

        const snap = await getDocs(q);
        renderSearchResults(snap);
        
    } catch (error) {
        console.error("Radar Error:", error);
        searchList.innerHTML = '<div style="padding:10px; color:red;">СБОЙ РАДАРА</div>';
    } finally {
        searchIndicator.classList.remove('active');
    }
}

// Рендер результатов
function renderSearchResults(snapshot) {
    searchList.innerHTML = ''; // Очистка

    if (snapshot.empty) {
        searchList.innerHTML = '<div style="padding:10px; opacity:0.5;">> ЦЕЛЬ НЕ НАЙДЕНА</div>';
        return;
    }

    let count = 0;
    snapshot.forEach(docSnap => {
        const user = docSnap.data();
        const uid = docSnap.id;

        // Не показываем себя
        if (uid === auth.currentUser.uid) return;

        count++;
        const item = document.createElement('div');
        item.className = 'search-item';
        // Подсвечиваем совпадение (для красоты)
        item.innerHTML = `
            <span>${user.nickname}</span> 
            <span style="font-size:0.7rem; opacity:0.6; padding-top:2px;">[СВЯЗЬ]</span>
        `;
        
        item.onclick = () => {
            searchInput.value = ''; // Очистить поле
            searchResultsArea.style.display = 'none'; // Скрыть список
            startChat(uid, user.nickname);
        };
        
        searchList.appendChild(item);
    });

    if (count === 0) {
        searchList.innerHTML = '<div style="padding:10px; opacity:0.5;">> ТОЛЬКО ВЫ</div>';
    }
}

// Клик вне поиска закрывает его (UX)
document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResultsArea.contains(e.target)) {
        searchResultsArea.style.display = 'none';
    }
});

// Утилиты
const modalOverlay = document.getElementById('custom-modal');
const modalMsg = document.getElementById('modal-msg');
const modalInput = document.getElementById('modal-input-field');
const modalBtnConfirm = document.getElementById('modal-btn-confirm');
const modalBtnCancel = document.getElementById('modal-btn-cancel');

// --- НАВИГАЦИЯ ---

// Выход
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

// Переключение форм
document.getElementById('to-register').addEventListener('click', () => {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
});
document.getElementById('to-login').addEventListener('click', () => {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
});

// Кнопка НАЗАД (Только для мобильных)
document.getElementById('back-btn').addEventListener('click', () => {
    // На мобиле скрываем правую панель
    chatPanel.classList.remove('open');
    // Отписываемся от сообщений
    if (unsubscribeMessages) unsubscribeMessages();
    currentChatId = null;
    document.getElementById('msg-form').style.display = 'none';
    document.getElementById('chat-title').innerText = "КАНАЛ: НЕ ВЫБРАН";
    document.getElementById('messages-area').innerHTML = '<div class="no-chat-selected"><p>> СВЯЗЬ ПРЕРВАНА</p></div>';
});

// Закрытие поиска
closeSearchBtn.addEventListener('click', () => {
    searchResultsArea.style.display = 'none';
    document.getElementById('search-nick').value = '';
});

// --- СИСТЕМА MODAL ---
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

// --- AUTH STATE ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        authScreen.classList.remove('active');
        appInterface.classList.remove('hidden'); // Показываем интерфейс приложения
        
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

// --- ЛОГИКА АВТОРИЗАЦИИ (Login/Register) ---
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

// --- ПОИСК (НОВАЯ ЛОГИКА) ---
document.getElementById('btn-search').addEventListener('click', async () => {
    const nick = document.getElementById('search-nick').value.trim();
    if (!nick) return;

    // Очистка и показ блока
    searchList.innerHTML = '<div class="military-title small">СКАНИРОВАНИЕ...</div>';
    searchResultsArea.style.display = 'block';

    const q = query(collection(db, "users"), where("nickname", "==", nick));
    const snap = await getDocs(q);

    searchList.innerHTML = ''; // Очищаем статус

    if (snap.empty) {
        searchList.innerHTML = '<div style="text-align:center; padding:10px;">ЦЕЛЬ НЕ ОБНАРУЖЕНА</div>';
        return;
    }

    // Вывод списка найденных
    snap.forEach(docSnap => {
        const user = docSnap.data();
        const uid = docSnap.id;
        
        if (uid === auth.currentUser.uid) return; // Себя не показываем

        const item = document.createElement('div');
        item.className = 'search-item';
        item.innerHTML = `<span>${user.nickname}</span> <span style="opacity:0.5">[СВЯЗАТЬСЯ]</span>`;
        item.onclick = () => startChat(uid, user.nickname);
        searchList.appendChild(item);
    });

    if (searchList.children.length === 0) {
        searchList.innerHTML = '<div style="text-align:center; padding:10px;">ТОЛЬКО ВЫ</div>';
    }
});

// Создание/Открытие чата (вызывается из списка поиска)
async function startChat(targetUid, targetNick) {
    const chatDocId = [auth.currentUser.uid, targetUid].sort().join("_");
    
    await setDoc(doc(db, "chats", chatDocId), {
        participants: [auth.currentUser.uid, targetUid],
        participantNames: [currentUserData.nickname, targetNick],
        lastUpdated: serverTimestamp()
    }, { merge: true });

    searchResultsArea.style.display = 'none'; // Скрыть поиск
    document.getElementById('search-nick').value = '';
    openChat(chatDocId, targetNick);
}

// --- СПИСОК ЧАТОВ ---
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

// --- ОТКРЫТИЕ ЧАТА ---
function openChat(chatId, chatName) {
    currentChatId = chatId;
    
    // UI обновления
    document.getElementById('chat-title').innerText = `КАНАЛ: ${chatName}`;
    document.getElementById('msg-form').style.display = 'flex'; // Показать ввод
    document.getElementById('messages-area').innerHTML = ''; // Очистить
    
    // Анимация для мобильных (выезд панели)
    chatPanel.classList.add('open');

    if (unsubscribeMessages) unsubscribeMessages();
    
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"));
    unsubscribeMessages = onSnapshot(q, (snap) => {
        const area = document.getElementById('messages-area');
        area.innerHTML = '';
        snap.forEach(renderMessage);
        area.scrollTop = area.scrollHeight;
    });
}

// --- СООБЩЕНИЯ ---
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

function renderMessage(docSnap) {
    const msg = docSnap.data();
    const isMine = msg.senderId === auth.currentUser.uid;
    const div = document.createElement('div');
    div.className = `msg ${isMine ? 'my' : 'other'}`;
    
    const date = msg.createdAt ? msg.createdAt.toDate() : new Date();
    const time = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    
    div.innerHTML = `
        <div>${msg.text} ${msg.edited ? '<small>(РЕД.)</small>' : ''}</div>
        <div class="msg-meta">
            ${isMine ? `<span onclick="editMsg('${currentChatId}','${docSnap.id}','${msg.text}')">[E]</span> <span onclick="deleteMsg('${currentChatId}','${docSnap.id}')">[X]</span>` : ''}
            <span>${time}</span>
        </div>`;
    document.getElementById('messages-area').appendChild(div);
}

// Глобальные
window.deleteMsg = async (cId, mId) => { if (await showModal('УДАЛИТЬ?', 'confirm')) await deleteDoc(doc(db, "chats", cId, "messages", mId)); };
window.editMsg = async (cId, mId, old) => {
    const val = await showModal('ИЗМЕНИТЬ:', 'prompt', old);
    if (val && val !== old) await updateDoc(doc(db, "chats", cId, "messages", mId), { text: val, edited: true });
};
