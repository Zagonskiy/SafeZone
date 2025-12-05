import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged 
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
let searchTimeout = null;
let profileToEdit = null; // Для хранения ID профиля, который смотрим

// --- DOM ЭЛЕМЕНТЫ ---
const authScreen = document.getElementById('auth-screen');
const appInterface = document.getElementById('app-interface');
const chatPanel = document.getElementById('chat-screen');
const userDisplay = document.getElementById('user-display');
const myMiniAvatar = document.getElementById('my-mini-avatar');

const searchInput = document.getElementById('search-nick');
const searchIndicator = document.getElementById('search-indicator');
const searchResultsArea = document.getElementById('search-results');
const searchList = document.getElementById('search-list');

// --- ПРОФИЛЬ ЭЛЕМЕНТЫ ---
const profileModal = document.getElementById('profile-modal');
const profileNickInput = document.getElementById('profile-nick-input');
const profileDescInput = document.getElementById('profile-desc-input');
const profileImgPreview = document.getElementById('profile-img-preview');
const avatarPlaceholder = document.getElementById('avatar-placeholder');
const avatarUpload = document.getElementById('avatar-upload');
const btnUploadAvatar = document.getElementById('btn-upload-avatar');
const btnSaveProfile = document.getElementById('btn-save-profile');
const btnCloseProfile = document.getElementById('btn-close-profile');

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

// ==========================================
// === СИСТЕМА СЖАТИЯ ИЗОБРАЖЕНИЙ (Base64) ===
// ==========================================
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Ограничиваем размер до 300x300 пикселей (чтобы влезло в БД)
                const MAX_WIDTH = 300;
                const MAX_HEIGHT = 300;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);
                // Сжимаем в JPEG с качеством 0.7
                const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
                resolve(dataUrl);
            };
            img.onerror = (err) => reject(err);
        };
    });
}

// ==========================================
// === ЛОГИКА ПРОФИЛЯ ===
// ==========================================

// Открытие моего профиля
document.getElementById('my-profile-link').addEventListener('click', () => {
    if(currentUserData) openProfile(currentUserData.uid, true);
});

// Загрузка фото (Кнопка)
btnUploadAvatar.addEventListener('click', () => avatarUpload.click());
avatarUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        try {
            const base64 = await compressImage(file);
            profileImgPreview.src = base64;
            profileImgPreview.style.display = 'block';
            avatarPlaceholder.style.display = 'none';
        } catch (err) {
            showModal("ОШИБКА ОБРАБОТКИ ФОТО", "alert");
        }
    }
});

// Функция открытия профиля (свой или чужой)
async function openProfile(uid, isMyProfile) {
    profileToEdit = uid;
    let data = null;

    if (isMyProfile) {
        data = currentUserData;
    } else {
        // Загружаем чужие данные
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) data = snap.data();
    }

    if (!data) return showModal("БОЕЦ НЕ НАЙДЕН", "alert");

    // Заполняем форму
    profileNickInput.value = data.nickname || "Без имени";
    profileDescInput.value = data.description || "";
    
    // Аватар
    if (data.avatarBase64) {
        profileImgPreview.src = data.avatarBase64;
        profileImgPreview.style.display = 'block';
        avatarPlaceholder.style.display = 'none';
    } else {
        profileImgPreview.src = "";
        profileImgPreview.style.display = 'none';
        avatarPlaceholder.style.display = 'flex';
    }

    // Режим редактирования
    if (isMyProfile) {
        profileNickInput.disabled = false;
        profileDescInput.disabled = false;
        btnUploadAvatar.style.display = 'inline-block';
        btnSaveProfile.style.display = 'inline-block';
    } else {
        profileNickInput.disabled = true;
        profileDescInput.disabled = true;
        btnUploadAvatar.style.display = 'none';
        btnSaveProfile.style.display = 'none';
    }

    profileModal.classList.add('active');
}

// Сохранение профиля
btnSaveProfile.addEventListener('click', async () => {
    const newNick = profileNickInput.value.trim();
    const newDesc = profileDescInput.value.trim();
    const newAvatar = profileImgPreview.src.startsWith('data:') ? profileImgPreview.src : null;

    if (newNick.length < 3) return showModal("ПОЗЫВНОЙ СЛИШКОМ КОРОТКИЙ", "alert");

    try {
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
            nickname: newNick,
            description: newDesc,
            avatarBase64: newAvatar
        });
        
        // Обновляем локальные данные
        currentUserData.nickname = newNick;
        currentUserData.description = newDesc;
        currentUserData.avatarBase64 = newAvatar;
        
        updateMyDisplay(); // Обновить шапку
        profileModal.classList.remove('active');
        showModal("ДОСЬЕ ОБНОВЛЕНО", "alert");

    } catch (err) {
        console.error(err);
        showModal("ОШИБКА СОХРАНЕНИЯ", "alert");
    }
});

btnCloseProfile.addEventListener('click', () => profileModal.classList.remove('active'));

// Обновление шапки (мой аватар и ник)
function updateMyDisplay() {
    if (currentUserData) {
        userDisplay.innerText = `БОЕЦ: ${currentUserData.nickname}`;
        if (currentUserData.avatarBase64) {
            myMiniAvatar.src = currentUserData.avatarBase64;
            myMiniAvatar.style.display = 'block';
        } else {
            myMiniAvatar.style.display = 'none';
        }
    }
}

// ==========================================
// === ЖИВОЙ ПОИСК ===
// ==========================================
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
        const q = query(collection(db, "users"), orderBy("nickname"), where("nickname", ">=", queryText), where("nickname", "<=", endText), limit(3));
        const snap = await getDocs(q);
        renderSearchResults(snap);
    } catch (error) {
        let errorMsg = "СБОЙ СИСТЕМЫ";
        if (error.message && error.message.includes("index")) errorMsg = "ТРЕБУЕТСЯ ИНДЕКС (СМ. КОНСОЛЬ)";
        searchList.innerHTML = `<div style="padding:15px; color:red;">${errorMsg}</div>`;
    } finally {
        if(searchIndicator) searchIndicator.classList.remove('active');
    }
}

function renderSearchResults(snapshot) {
    searchList.innerHTML = ''; 
    if (snapshot.empty) {
        searchList.innerHTML = `<div style="padding:15px; opacity:0.5; text-align:center;">ЦЕЛЬ НЕ ОБНАРУЖЕНА<br><span style="font-size:0.7rem; color:red;">(Учитывайте регистр!)</span></div>`;
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
        // Если есть аватарка в поиске - показываем
        const avatarHTML = user.avatarBase64 
            ? `<img src="${user.avatarBase64}" style="width:20px; height:20px; border-radius:50%; margin-right:5px; vertical-align:middle;">` 
            : '';
        
        item.innerHTML = `<span>${avatarHTML}${user.nickname}</span> <span style="font-size:0.8rem; opacity:0.6;">[СВЯЗАТЬСЯ]</span>`;
        item.onclick = () => {
            searchInput.value = ''; searchResultsArea.style.display = 'none';
            startChat(uid, user.nickname);
        };
        searchList.appendChild(item);
    });
    if (count === 0) searchList.innerHTML = '<div style="padding:15px; opacity:0.5;">ТОЛЬКО ВЫ</div>';
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

document.addEventListener('click', (e) => {
    if (searchInput && !searchInput.contains(e.target) && !searchResultsArea.contains(e.target)) {
        searchResultsArea.style.display = 'none';
    }
});

// ==========================================
// === ОСНОВНАЯ ЛОГИКА ===
// ==========================================
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
        updateMyDisplay(); // Обновить шапку
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
        await setDoc(doc(db, "users", cred.user.uid), { nickname: nick, email, createdAt: new Date(), avatarBase64: null, description: "" });
        currentUserData = { uid: cred.user.uid, nickname: nick, email, avatarBase64: null, description: "" };
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

// --- СПИСОК ЧАТОВ (С АВАТАРКАМИ) ---
function loadMyChats() {
    if (!auth.currentUser) return;
    
    // Запрос к базе: ищем чаты, где я есть, сортируем по свежести
    const q = query(
        collection(db, "chats"), 
        where("participants", "array-contains", auth.currentUser.uid),
        orderBy("lastUpdated", "desc")
    );
    
    unsubscribeChats = onSnapshot(q, (snap) => {
        const container = document.getElementById('chats-container');
        container.innerHTML = ''; // Очищаем список перед обновлением
        
        if (snap.empty) {
            document.getElementById('empty-state').style.display = 'flex';
        } else {
            document.getElementById('empty-state').style.display = 'none';
            
            snap.forEach(async docSnap => {
                const data = docSnap.data();
                
                // 1. Ищем ID и Имя собеседника
                const otherUid = data.participants.find(uid => uid !== auth.currentUser.uid);
                const otherName = data.participantNames.find(n => n !== currentUserData.nickname) || "UNKNOWN";
                
                // 2. Создаем сам блок (ПРЯМОУГОЛЬНИК)
                const el = document.createElement('div');
                el.className = 'chat-item'; // <--- ВОТ ЗДЕСЬ МЫ ПРИСВАИВАЕМ КЛАСС
                
                // Уникальный ID для картинки, чтобы потом ее найти и обновить
                const imgId = `avatar-chat-${docSnap.id}`;
                
                // 3. Вставляем HTML внутрь прямоугольника
                el.innerHTML = `
                    <img id="${imgId}" src="" class="chat-list-avatar" style="display:none">
                    <div>${otherName}</div>
                `;
                
                // Клик открывает чат
                el.onclick = () => openChat(docSnap.id, otherName);
                container.appendChild(el);

                // 4. Отдельно подгружаем аватарку собеседника из его профиля
                if (otherUid) {
                    const userSnap = await getDoc(doc(db, "users", otherUid));
                    if (userSnap.exists()) {
                        const uData = userSnap.data();
                        const imgEl = document.getElementById(imgId);
                        
                        // Если фото найдено и элемент еще существует
                        if (imgEl && uData.avatarBase64) {
                            imgEl.src = uData.avatarBase64;
                            imgEl.style.display = 'block';
                        } else if (imgEl) {
                            // Если фото нет - показываем пустой серый круг
                             imgEl.style.display = 'block';
                             imgEl.style.backgroundColor = '#222';
                             imgEl.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="; // Пустой пиксель
                        }
                    }
                }
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
    if(searchInput) searchInput.blur(); 
    if (unsubscribeMessages) unsubscribeMessages();
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"));
    unsubscribeMessages = onSnapshot(q, (snap) => {
        const area = document.getElementById('messages-area');
        area.innerHTML = '';
        // ВАЖНО: Мы получаем всех пользователей чата, чтобы найти их аватарки
        // Для простоты, пока рендерим без аватарок (или аватарки надо хранить в самом сообщении)
        // Чтобы сделать красиво, сохраним аватар в сообщении при отправке.
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
        text, 
        senderId: auth.currentUser.uid, 
        senderNick: currentUserData.nickname,
        // Добавляем аватарку в сообщение, чтобы не грузить её каждый раз
        senderAvatar: currentUserData.avatarBase64 || null, 
        createdAt: serverTimestamp(), 
        edited: false
    });
    await updateDoc(doc(db, "chats", currentChatId), { lastUpdated: serverTimestamp() });
    input.value = '';
});

function renderMessage(docSnap) {
    const msg = docSnap.data();
    const isMine = msg.senderId === auth.currentUser.uid;
    
    // Контейнер строки (чтобы аватар был рядом)
    const row = document.createElement('div');
    row.className = `msg-row ${isMine ? 'my' : 'other'}`;

    // Аватарка (только если чужое сообщение)
    if (!isMine) {
        const avatar = document.createElement('img');
        avatar.className = 'chat-avatar';
        // Если есть аватарка в сообщении - ставим, если нет - заглушка
        if (msg.senderAvatar) {
            avatar.src = msg.senderAvatar;
        } else {
            // Генерируем цветной кружок или пустую картинку
            avatar.style.background = '#333';
        }
        // Клик по аватарке -> Профиль
        avatar.onclick = () => openProfile(msg.senderId, false);
        row.appendChild(avatar);
    }

    const div = document.createElement('div');
    div.className = `msg ${isMine ? 'my' : 'other'}`;
    
    const textDiv = document.createElement('div');
    textDiv.innerHTML = `${msg.text} ${msg.edited ? '<small>(РЕД.)</small>' : ''}`;
    
    // Клик по НИКУ -> Профиль (добавим имя над сообщением если это не я)
    if (!isMine) {
        const nickSpan = document.createElement('div');
        nickSpan.style.fontSize = '0.7rem';
        nickSpan.style.marginBottom = '2px';
        nickSpan.style.color = '#fff';
        nickSpan.style.cursor = 'pointer';
        nickSpan.style.textDecoration = 'underline';
        nickSpan.innerText = msg.senderNick;
        nickSpan.onclick = () => openProfile(msg.senderId, false);
        div.prepend(nickSpan);
    }

    const metaDiv = document.createElement('div');
    metaDiv.className = 'msg-meta';
    
    if (isMine) {
        const editBtn = document.createElement('span');
        editBtn.innerText = '[E]'; editBtn.style.cursor = 'pointer'; editBtn.style.marginRight = '8px';
        editBtn.onclick = () => editMsg(currentChatId, docSnap.id, msg.text);
        const delBtn = document.createElement('span');
        delBtn.innerText = '[X]'; delBtn.style.cursor = 'pointer'; delBtn.style.marginRight = '8px';
        delBtn.onclick = () => deleteMsg(currentChatId, docSnap.id);
        metaDiv.appendChild(editBtn); metaDiv.appendChild(delBtn);
    }

    const timeSpan = document.createElement('span');
    const date = msg.createdAt ? msg.createdAt.toDate() : new Date();
    timeSpan.innerText = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    metaDiv.appendChild(timeSpan);
    div.appendChild(textDiv); div.appendChild(metaDiv);
    row.appendChild(div);
    
    document.getElementById('messages-area').appendChild(row);
}

// Глобальные функции
window.deleteMsg = async (cId, mId) => { if (await showModal('УДАЛИТЬ?', 'confirm')) await deleteDoc(doc(db, "chats", cId, "messages", mId)); };
window.editMsg = async (cId, mId, old) => {
    const val = await showModal('ИЗМЕНИТЬ:', 'prompt', old);
    if (val && val !== old) await updateDoc(doc(db, "chats", cId, "messages", mId), { text: val, edited: true });
};
