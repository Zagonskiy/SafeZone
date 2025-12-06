import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, collection, query, where, getDocs, getDoc,
    addDoc, serverTimestamp, orderBy, onSnapshot, deleteDoc, updateDoc, limit, arrayRemove, arrayUnion, writeBatch
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
let profileToEdit = null; 
let currentChatPartnerAvatar = null; 

// Переменные для записи аудио
let mediaRecorder = null;
let audioChunks = [];
let recStartTimePress = 0;
let isRecording = false;
let isLockedMode = false;
let detectedMimeType = '';

// --- ЗВОНКИ (НОВАЯ АРХИТЕКТУРА) ---
let peer = null; // Создается ТОЛЬКО во время активного звонка
let currentCall = null;
let localStream = null;
let incomingCallData = null;
let activeCallDocId = null;
let callTimerInterval = null;
let callSeconds = 0;
let isMicMuted = false;

// STUN Серверы (Google)
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};

const DEFAULT_AVATAR = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2333ff33' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='100%25' height='100%25' fill='%23111'/%3E%3Cpath d='M12 2C9 2 7 3.5 7 6v1c0 .5-.5 1-1 1s-1 .5-1 1v2c0 1.5 1 2.5 3 3'/%3E%3Cpath d='M12 2c3 0 5 1.5 5 4v1c0 .5.5 1 1 1s1 .5 1 1v2c0 1.5-1 2.5-3 3'/%3E%3Cpath d='M16 11c0 2.5-1.5 4-4 4s-4-1.5-4-4'/%3E%3Cpath d='M4 22v-2c0-2.5 2-4 4-5'/%3E%3Cpath d='M20 22v-2c0-2.5-2-4-4-5'/%3E%3Cpath d='M8 4h8'/%3E%3C/svg%3E";

// --- DOM ЭЛЕМЕНТЫ ---
const authScreen = document.getElementById('auth-screen');
const appInterface = document.getElementById('app-interface');
const chatPanel = document.getElementById('chat-screen');
const userDisplay = document.getElementById('user-display');
const myMiniAvatar = document.getElementById('my-mini-avatar');
const fullscreenBtn = document.getElementById('fullscreen-btn');

// Чат элементы
const msgInput = document.getElementById('msg-input');
const btnSendText = document.getElementById('btn-send-text'); 
const btnMicRec = document.getElementById('btn-mic-rec');     
const recordingOverlay = document.getElementById('recording-overlay'); 
const chatImgUpload = document.getElementById('chat-img-upload');
const btnAttachImg = document.getElementById('btn-attach-img');
const btnCall = document.getElementById('btn-call'); // Кнопка звонка

// Просмотрщик
const imageViewerModal = document.getElementById('image-viewer-modal');
const fullImageView = document.getElementById('full-image-view');
const fullVideoView = document.getElementById('full-video-view');
const imageCaptionView = document.getElementById('image-caption-view');
const closeImageViewer = document.getElementById('close-image-viewer');

// Поиск
const searchInput = document.getElementById('search-nick');
const searchIndicator = document.getElementById('search-indicator');
const searchResultsArea = document.getElementById('search-results');
const searchList = document.getElementById('search-list');

// Профиль
const profileModal = document.getElementById('profile-modal');
const profileNickInput = document.getElementById('profile-nick-input');
const profileDescInput = document.getElementById('profile-desc-input');
const profileImgPreview = document.getElementById('profile-img-preview');
const avatarPlaceholder = document.getElementById('avatar-placeholder');
const avatarUpload = document.getElementById('avatar-upload');
const btnUploadAvatar = document.getElementById('btn-upload-avatar');
const btnSaveProfile = document.getElementById('btn-save-profile');
const btnCloseProfile = document.getElementById('btn-close-profile');

// Утилиты
const modalOverlay = document.getElementById('custom-modal');
const modalMsg = document.getElementById('modal-msg');
const modalInput = document.getElementById('modal-input-field');
const modalBtnConfirm = document.getElementById('modal-btn-confirm');
const modalBtnCancel = document.getElementById('modal-btn-cancel');

// Удаление чата
const deleteChatModal = document.getElementById('delete-chat-modal');
let chatToDeleteId = null;

// Превью медиа
const photoModal = document.getElementById('photo-preview-modal');
const photoPreviewImg = document.getElementById('photo-preview-img');
const videoPreviewEl = document.getElementById('video-preview-el');
const photoCaptionInput = document.getElementById('photo-caption-input');
const btnCancelPhoto = document.getElementById('btn-cancel-photo');
const btnConfirmPhoto = document.getElementById('btn-confirm-photo');
let selectedFile = null;

// --- UTILS ---
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
// === ГЛАВНЫЙ КОНТРОЛЛЕР ВХОДА ===
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        authScreen.classList.remove('active');
        appInterface.classList.remove('hidden');
        
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                currentUserData = { uid: user.uid, ...userDoc.data() };
            } else {
                const newProfile = { 
                    nickname: "Soldier-" + user.uid.slice(0, 4), 
                    email: user.email, 
                    createdAt: new Date(), 
                    avatarBase64: null, 
                    description: "Восстановленный профиль" 
                };
                await setDoc(doc(db, "users", user.uid), newProfile);
                currentUserData = { uid: user.uid, ...newProfile };
            }
            updateMyDisplay();
            loadMyChats();
            listenForIncomingCalls(user.uid); // Слушаем вызовы, но Peer пока не создаем
        } catch (e) {
            console.error("Auth Error:", e);
        }
    } else {
        appInterface.classList.add('hidden');
        authScreen.classList.add('active');
        currentUserData = null;
    }
});

function updateMyDisplay() {
    if (currentUserData) {
        userDisplay.innerText = `БОЕЦ: ${currentUserData.nickname}`;
        if (currentUserData.avatarBase64) {
            myMiniAvatar.src = currentUserData.avatarBase64;
        } else {
            myMiniAvatar.src = DEFAULT_AVATAR;
        }
        myMiniAvatar.style.display = 'block';
    }
}

// --- LOGIN / REGISTER / NAV (Без изменений, сокращено для краткости) ---
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

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    // (Код регистрации без изменений)
    const nick = document.getElementById('reg-nick').value.trim();
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    if (pass !== document.getElementById('reg-pass-conf').value) return showModal('ПАРОЛИ НЕ СОВПАДАЮТ', 'alert');
    try {
        const q = query(collection(db, "users"), where("nickname", "==", nick));
        if (!(await getDocs(q)).empty) throw new Error("ПОЗЫВНОЙ ЗАНЯТ");
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        const newData = { nickname: nick, email, createdAt: new Date(), avatarBase64: null, description: "" };
        await setDoc(doc(db, "users", cred.user.uid), newData);
        currentUserData = { uid: cred.user.uid, ...newData };
        updateMyDisplay();
    } catch (err) { showModal(err.message, 'alert'); }
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));
document.getElementById('to-register').addEventListener('click', () => { 
    document.getElementById('login-form').style.display = 'none'; 
    document.getElementById('register-form').style.display = 'block'; 
});
document.getElementById('to-login').addEventListener('click', () => { 
    document.getElementById('login-form').style.display = 'block'; 
    document.getElementById('register-form').style.display = 'none'; 
});

// НАВИГАЦИЯ НАЗАД
document.getElementById('back-btn').addEventListener('click', () => { 
    chatPanel.classList.remove('open');
    if(btnCall) btnCall.style.display = 'none'; 
    if(document.getElementById('btn-toggle-search')) {
        document.getElementById('btn-toggle-search').style.display = 'none';
        document.getElementById('chat-search-bar').style.display = 'none';
    }
    if (unsubscribeMessages) unsubscribeMessages(); 
    currentChatId = null; 
    document.getElementById('msg-form').style.display = 'none'; 
    document.getElementById('chat-title').innerText = "КАНАЛ: НЕ ВЫБРАН"; 
    document.getElementById('messages-area').innerHTML = '<div class="no-chat-selected"><p>> СВЯЗЬ ПРЕРВАНА</p></div>'; 
});

// --- ЧАТ ФУНКЦИИ (Сокращены, без изменений) ---
function loadMyChats() {
    if (!auth.currentUser || !currentUserData) return;
    const q = query(collection(db, "chats"), where("participants", "array-contains", auth.currentUser.uid), orderBy("lastUpdated", "desc"));
    unsubscribeChats = onSnapshot(q, (snap) => {
        const container = document.getElementById('chats-container');
        container.innerHTML = '';
        const visibleChats = snap.docs.filter(doc => {
            const data = doc.data();
            return !data.hiddenFor || !data.hiddenFor.includes(auth.currentUser.uid);
        });
        if (visibleChats.length === 0) { document.getElementById('empty-state').style.display = 'flex'; } 
        else {
            document.getElementById('empty-state').style.display = 'none';
            visibleChats.forEach(async docSnap => {
                const data = docSnap.data();
                const otherName = data.participantNames.find(n => n !== currentUserData.nickname) || "UNKNOWN";
                const el = document.createElement('div');
                el.className = 'chat-item'; 
                el.innerHTML = `<img src="${DEFAULT_AVATAR}" class="chat-list-avatar"> <div style="flex:1;">${otherName}</div> <button class="btn-trash">×</button>`;
                el.onclick = () => openChat(docSnap.id, otherName);
                container.appendChild(el);
            });
        }
    });
}

async function openChat(chatId, chatName) {
    currentChatId = chatId;
    document.getElementById('chat-title').innerText = `КАНАЛ: ${chatName}`;
    document.getElementById('msg-form').style.display = 'flex'; 
    document.getElementById('messages-area').innerHTML = ''; 
    chatPanel.classList.add('open');
    if(btnCall) btnCall.style.display = 'flex';
    if(document.getElementById('btn-toggle-search')) document.getElementById('btn-toggle-search').style.display = 'block';
    
    // Подгрузка сообщений...
    if (unsubscribeMessages) unsubscribeMessages();
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"));
    unsubscribeMessages = onSnapshot(q, (snap) => {
        const area = document.getElementById('messages-area');
        area.innerHTML = '';
        snap.forEach((docSnap) => renderMessage(docSnap));
        setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
    });
}

// Отправка сообщений (базовая)
document.getElementById('msg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = msgInput.value.trim();
    if (!text || !currentChatId) return;
    await addDoc(collection(db, "chats", currentChatId, "messages"), {
        text, senderId: auth.currentUser.uid, senderNick: currentUserData.nickname, createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, "chats", currentChatId), { lastUpdated: serverTimestamp(), hiddenFor: [] });
    msgInput.value = '';
});

// ==========================================
// === НОВАЯ СИСТЕМА ЗВОНКОВ (REVERSE DIAL) ===
// ==========================================

// 1. Создание одноразового Peer объекта
function createOneTimePeer() {
    return new Promise((resolve, reject) => {
        // Уникальный ID для каждой сессии звонка
        const tempId = `call_${auth.currentUser.uid}_${Date.now()}`;
        console.log("🛠 Создание временного Peer ID:", tempId);
        
        const newPeer = new Peer(tempId, {
            debug: 1,
            config: ICE_SERVERS
        });

        newPeer.on('open', (id) => {
            console.log("✅ Временный Peer готов:", id);
            resolve(newPeer);
        });

        newPeer.on('error', (err) => {
            console.error("❌ Peer Init Error:", err);
            reject(err);
        });
    });
}

// 2. Слушаем входящие вызовы в базе (Пассивный режим)
function listenForIncomingCalls(myUid) {
    const q = query(
        collection(db, "calls"), 
        where("receiverId", "==", myUid), 
        where("status", "==", "offering")
    );
    
    onSnapshot(q, (snap) => {
        snap.docChanges().forEach((change) => {
            if (change.type === "added") {
                const data = change.doc.data();
                const now = Date.now();
                // Игнорируем старые вызовы (> 45 сек)
                if (data.timestamp && (now - data.timestamp.toMillis()) > 45000) return;
                
                showIncomingCallModal(change.doc.id, data);
            }
        });
    });
}

function showIncomingCallModal(docId, data) {
    if (activeCallDocId) return; // Уже занят
    incomingCallData = { id: docId, ...data };
    activeCallDocId = docId;
    document.getElementById('incoming-call-modal').classList.add('active');
    document.getElementById('incoming-caller-name').innerText = data.callerName;
}

// 3. НАЧАЛО ЗВОНКА (Инициатор - Создает комнату и ЖДЕТ)
if (btnCall) {
    btnCall.addEventListener('click', async () => {
        if (!currentChatId || !auth.currentUser) return;
        const chatDoc = await getDoc(doc(db, "chats", currentChatId));
        if (!chatDoc.exists()) return;
        const participants = chatDoc.data().participants;
        const receiverId = participants.find(id => id !== auth.currentUser.uid);
        if (!receiverId) return;

        startHostingCall(receiverId);
    });
}

async function startHostingCall(receiverId) {
    try {
        // 1. Получаем медиа
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch(e) {
        alert("Нет доступа к микрофону"); return;
    }

    showActiveCallScreen("АБОНЕНТ", "СОЗДАНИЕ КАНАЛА...");
    getDoc(doc(db, "users", receiverId)).then(s => {
        if(s.exists()) document.getElementById('call-partner-name').innerText = s.data().nickname;
    });

    try {
        // 2. Создаем Peer и ЖДЕМ подключения
        if (peer) peer.destroy();
        peer = await createOneTimePeer();

        // 3. Пишем в базу: "Я жду звонка здесь (callerPeerId)"
        const callDocRef = await addDoc(collection(db, "calls"), {
            callerId: auth.currentUser.uid,
            callerName: currentUserData.nickname,
            receiverId: receiverId,
            chatId: currentChatId,
            callerPeerId: peer.id, // <--- Ключевой момент: мы публикуем свой ID
            status: "offering",
            timestamp: serverTimestamp()
        });
        
        activeCallDocId = callDocRef.id;
        document.getElementById('call-status-text').innerText = "ОЖИДАНИЕ ОТВЕТА...";

        // 4. Настраиваем слушатель: когда друг ответит, он сам нам позвонит
        peer.on('call', (incomingCall) => {
            console.log("⚡ Получено входящее соединение от собеседника!");
            document.getElementById('call-status-text').innerText = "СОЕДИНЕНИЕ...";
            
            // Отвечаем на его звонок своим потоком
            incomingCall.answer(localStream);
            
            incomingCall.on('stream', (remoteStream) => {
                console.log("🔊 Поток получен!");
                setupRemoteAudio(remoteStream);
                startCallTimer();
            });
            
            incomingCall.on('close', () => endCallLocal());
            incomingCall.on('error', (e) => console.error("Media Error:", e));
            
            currentCall = incomingCall;
        });

        // Слушаем отмену/отклонение
        onSnapshot(doc(db, "calls", activeCallDocId), (snap) => {
            if(!snap.exists()) return;
            const d = snap.data();
            if (d.status === 'rejected') {
                document.getElementById('call-status-text').innerText = "ОТКЛОНЕНО";
                setTimeout(endCallLocal, 1500);
            } else if (d.status === 'ended') {
                endCallLocal();
            }
        });

    } catch (e) {
        console.error("Hosting Error:", e);
        alert("Ошибка создания звонка");
        endCallLocal();
    }
}

// 4. ОТВЕТ НА ЗВОНОК (Получатель - ИНИЦИИРУЕТ P2P)
document.getElementById('btn-answer-call').addEventListener('click', async () => {
    document.getElementById('incoming-call-modal').classList.remove('active');
    
    // Разблокировка аудио (iOS/Android)
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    try {
        showActiveCallScreen(incomingCallData.callerName, "ПОДКЛЮЧЕНИЕ...");
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // 1. Создаем свой Peer
        if (peer) peer.destroy();
        peer = await createOneTimePeer();

        // 2. Читаем ID Инициатора из базы (он там уже есть)
        // В incomingCallData уже могут быть старые данные, лучше обновить
        const callSnap = await getDoc(doc(db, "calls", activeCallDocId));
        if (!callSnap.exists()) { alert("Звонок отменен"); endCallLocal(); return; }
        
        const hostPeerId = callSnap.data().callerPeerId;
        console.log("📞 Звоню хосту по ID:", hostPeerId);

        // 3. Звоним Инициатору! (Reverse Dialing)
        const call = peer.call(hostPeerId, localStream);

        if (!call) {
            throw new Error("Не удалось начать вызов PeerJS");
        }

        call.on('stream', (remoteStream) => {
            console.log("🔊 Поток от хоста получен!");
            setupRemoteAudio(remoteStream);
            startCallTimer();
        });

        call.on('close', () => endCallLocal());
        call.on('error', (e) => console.error("Call Error:", e));
        
        currentCall = call;

        // 4. Обновляем статус в базе (чисто для галочки)
        await updateDoc(doc(db, "calls", activeCallDocId), { status: "answered" });
        
        // Слушаем завершение
        onSnapshot(doc(db, "calls", activeCallDocId), (snap) => {
            if (snap.exists() && snap.data().status === "ended") endCallLocal();
        });

    } catch (e) {
        console.error("Answer Error:", e);
        alert("Ошибка соединения: " + e.message);
        rejectCall();
    }
});

// Остальные кнопки управления
document.getElementById('btn-decline-call').addEventListener('click', async () => {
    document.getElementById('incoming-call-modal').classList.remove('active');
    if (activeCallDocId) {
        await updateDoc(doc(db, "calls", activeCallDocId), { status: "rejected" });
        activeCallDocId = null;
    }
});

document.getElementById('btn-hangup').addEventListener('click', async () => {
    if (activeCallDocId) {
        await updateDoc(doc(db, "calls", activeCallDocId), { status: "ended" });
    }
    endCallLocal();
});

// Общая очистка
function endCallLocal() {
    console.log("📴 Resetting Call State...");
    document.getElementById('active-call-screen').classList.remove('active');
    document.getElementById('incoming-call-modal').classList.remove('active');
    
    if (currentCall) { currentCall.close(); currentCall = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (peer) { peer.destroy(); peer = null; } // Уничтожаем peer полностью
    
    const el = document.getElementById('remote-audio');
    if (el) el.srcObject = null;
    
    if (callTimerInterval) clearInterval(callTimerInterval);
    activeCallDocId = null;
    incomingCallData = null;
}

function setupRemoteAudio(stream) {
    const audioEl = document.getElementById('remote-audio');
    audioEl.srcObject = stream;
    audioEl.volume = 1.0;
    audioEl.play().catch(() => {
        // Fallback для мобильных
        document.getElementById('call-status-text').innerText = "НАЖМИТЕ НА ЭКРАН";
        const unlock = () => {
            audioEl.play();
            document.removeEventListener('touchstart', unlock);
            document.removeEventListener('click', unlock);
        };
        document.addEventListener('touchstart', unlock);
        document.addEventListener('click', unlock);
    });
}

function showActiveCallScreen(name, status) {
    document.getElementById('active-call-screen').classList.add('active');
    document.getElementById('call-partner-name').innerText = name;
    document.getElementById('call-status-text').innerText = status;
    document.getElementById('call-timer').innerText = "00:00";
}

function startCallTimer() {
    if (callTimerInterval) clearInterval(callTimerInterval);
    callSeconds = 0;
    callTimerInterval = setInterval(() => {
        callSeconds++;
        const m = Math.floor(callSeconds / 60).toString().padStart(2, '0');
        const s = (callSeconds % 60).toString().padStart(2, '0');
        document.getElementById('call-timer').innerText = `${m}:${s}`;
    }, 1000);
}

document.getElementById('btn-mic-toggle').addEventListener('click', () => {
    if (localStream) {
        isMicMuted = !isMicMuted;
        localStream.getAudioTracks()[0].enabled = !isMicMuted;
        // (Тут можно добавить визуальную смену иконки)
    }
});

// Вспомогательные функции рендера сообщений (старые)...
function renderMessage(docSnap) {
    // (Код рендера, который был у вас выше - оставьте как есть или скопируйте из прошлого файла)
    // Чтобы не дублировать огромный кусок, я предполагаю он у вас есть.
    // Если нужно, я могу добавить базовый рендер.
    // ...
    // Вставляю базовый рендер для работоспособности:
    const msg = docSnap.data();
    const isMine = msg.senderId === auth.currentUser.uid;
    const row = document.createElement('div');
    row.className = `msg-row ${isMine ? 'my' : 'other'}`;
    if (!isMine) {
        const avatar = document.createElement('img');
        avatar.className = 'chat-avatar';
        avatar.src = msg.senderAvatar || DEFAULT_AVATAR;
        row.appendChild(avatar);
    }
    const div = document.createElement('div');
    div.className = `msg ${isMine ? 'my' : 'other'}`;
    if (msg.audioBase64) {
        div.innerHTML = `<audio controls src="${msg.audioBase64}"></audio>`;
    } else {
        div.innerText = msg.text;
    }
    row.appendChild(div);
    document.getElementById('messages-area').appendChild(row);
}

// Хак для Chrome Mobile (Audio Unlock)
document.body.addEventListener('touchstart', function() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) { const ctx = new AudioContext(); ctx.resume(); }
}, { once: true });
