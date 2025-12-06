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

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
let currentChatId = null;
let unsubscribeMessages = null; 
let unsubscribeChats = null; 
let currentUserData = null; 
let searchTimeout = null;
let profileToEdit = null; 
let currentChatPartnerAvatar = null; 

// Аудио сообщения
let mediaRecorder = null;
let audioChunks = [];
let recStartTimePress = 0;
let isRecording = false;
let isLockedMode = false;
let detectedMimeType = '';

// Звонки (Глобальные)
let localStream = null;
let currentCall = null;
let peer = null;
let activeCallDocId = null;
let incomingCallData = null;
let callTimerInterval = null;
let callSeconds = 0;
let callUnsubscribe = null;

// Конфиг PeerJS (TURN серверы для работы через 4G)
const peerConfig = {
    debug: 1,
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            {
                urls: "turn:openrelay.metered.ca:80",
                username: "openrelayproject",
                credential: "openrelayproject"
            },
            {
                urls: "turn:openrelay.metered.ca:443",
                username: "openrelayproject",
                credential: "openrelayproject"
            },
            {
                urls: "turn:openrelay.metered.ca:443?transport=tcp",
                username: "openrelayproject",
                credential: "openrelayproject"
            }
        ]
    }
};

const DEFAULT_AVATAR = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2333ff33' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='100%25' height='100%25' fill='%23111'/%3E%3Cpath d='M12 2C9 2 7 3.5 7 6v1c0 .5-.5 1-1 1s-1 .5-1 1v2c0 1.5 1 2.5 3 3'/%3E%3Cpath d='M12 2c3 0 5 1.5 5 4v1c0 .5.5 1 1 1s1 .5 1 1v2c0 1.5-1 2.5-3 3'/%3E%3Cpath d='M16 11c0 2.5-1.5 4-4 4s-4-1.5-4-4'/%3E%3Cpath d='M4 22v-2c0-2.5 2-4 4-5'/%3E%3Cpath d='M20 22v-2c0-2.5-2-4-4-5'/%3E%3Cpath d='M8 4h8'/%3E%3C/svg%3E";

// --- DOM ЭЛЕМЕНТЫ ---
const authScreen = document.getElementById('auth-screen');
const appInterface = document.getElementById('app-interface');
const chatPanel = document.getElementById('chat-screen');
const userDisplay = document.getElementById('user-display');
const myMiniAvatar = document.getElementById('my-mini-avatar');
const fullscreenBtn = document.getElementById('fullscreen-btn');

// Чат
const msgInput = document.getElementById('msg-input');
const btnSendText = document.getElementById('btn-send-text'); 
const btnMicRec = document.getElementById('btn-mic-rec');     
const recordingOverlay = document.getElementById('recording-overlay'); 
const chatImgUpload = document.getElementById('chat-img-upload');
const btnAttachImg = document.getElementById('btn-attach-img');
const btnCall = document.getElementById('btn-call');

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

// Превью медиа
const photoModal = document.getElementById('photo-preview-modal');
const photoPreviewImg = document.getElementById('photo-preview-img');
const videoPreviewEl = document.getElementById('video-preview-el');
const photoCaptionInput = document.getElementById('photo-caption-input');
const btnCancelPhoto = document.getElementById('btn-cancel-photo');
const btnConfirmPhoto = document.getElementById('btn-confirm-photo');

// Поиск в чате
const btnToggleSearch = document.getElementById('btn-toggle-search');
const searchBar = document.getElementById('chat-search-bar');
const searchInputChat = document.getElementById('chat-search-input');
const btnSearchUp = document.getElementById('btn-search-up');
const btnSearchDown = document.getElementById('btn-search-down');
const btnCloseSearch = document.getElementById('btn-close-search');
const searchCountLabel = document.getElementById('search-count');

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
// === 1. ГЛАВНЫЙ КОНТРОЛЛЕР ВХОДА (ИЗОЛИРОВАННЫЙ) ===
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        authScreen.classList.remove('active');
        appInterface.classList.remove('hidden');
        
        // ШАГ 1: ЗАГРУЗКА ПРОФИЛЯ (Критическая секция)
        // Оборачиваем в try-catch только загрузку данных, чтобы звонки не влияли
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            
            if (userDoc.exists()) {
                currentUserData = { uid: user.uid, ...userDoc.data() };
            } else {
                console.log("Профиль не найден. Создаю новый...");
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
            
        } catch (e) {
            console.error("Critical Profile Error:", e);
            showModal("ОШИБКА ЗАГРУЗКИ ПРОФИЛЯ. ОБНОВИТЕ СТРАНИЦУ.", "alert");
            return; // STOP! Дальше не идем
        }

        // ШАГ 2: ИНИЦИАЛИЗАЦИЯ ЗВОНКОВ (Второстепенная секция)
        // Запускаем отдельно. Если упадет - чат продолжит работать.
        try {
            if (navigator.mediaDevices && window.Peer) {
                console.log("🚀 Init Call System...");
                initIncomingCallListener(user.uid);
            } else {
                console.warn("WebRTC не поддерживается в этом окружении");
            }
        } catch (callErr) {
            console.error("Call System Error (Ignored):", callErr);
        }

    } else {
        // LOGOUT
        appInterface.classList.add('hidden');
        authScreen.classList.add('active');
        currentUserData = null;
        if (peer) peer.destroy();
        if (callUnsubscribe) callUnsubscribe();
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

// ==========================================
// === 2. ЛОГИКА АВТОРИЗАЦИИ ===
// ==========================================
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
    } catch (err) { 
        console.error(err);
        showModal("ОШИБКА ДОСТУПА. ПРОВЕРЬТЕ ДАННЫЕ.", 'alert'); 
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

// ==========================================
// === 3. ЛОГИКА ЧАТОВ ===
// ==========================================
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

        if (visibleChats.length === 0) { 
            document.getElementById('empty-state').style.display = 'flex'; 
        } else {
            document.getElementById('empty-state').style.display = 'none';
            visibleChats.forEach(async docSnap => {
                const data = docSnap.data();
                const otherUid = data.participants.find(uid => uid !== auth.currentUser.uid);
                const otherName = data.participantNames.find(n => n !== currentUserData.nickname) || "UNKNOWN";
                const el = document.createElement('div');
                el.className = 'chat-item'; 
                const imgId = `avatar-chat-${docSnap.id}`;
                el.innerHTML = `
                    <img id="${imgId}" src="${DEFAULT_AVATAR}" class="chat-list-avatar">
                    <div style="flex:1;">${otherName}</div>
                    <button class="btn-trash" onclick="event.stopPropagation(); confirmDeleteChat('${docSnap.id}')">×</button>
                `;
                el.onclick = () => openChat(docSnap.id, otherName);
                container.appendChild(el);
                if (otherUid) {
                    const userSnap = await getDoc(doc(db, "users", otherUid));
                    if (userSnap.exists()) {
                        const uData = userSnap.data();
                        const imgEl = document.getElementById(imgId);
                        if (imgEl && uData.avatarBase64) imgEl.src = uData.avatarBase64;
                    }
                }
            });
        }
    });
}

document.getElementById('back-btn').addEventListener('click', () => { 
    chatPanel.classList.remove('open');
    if(btnCall) btnCall.style.display = 'none'; 
    if(btnToggleSearch) {
        btnToggleSearch.style.display = 'none';
        searchBar.style.display = 'none';
    }
    if (unsubscribeMessages) unsubscribeMessages(); 
    currentChatId = null; 
    document.getElementById('msg-form').style.display = 'none'; 
    document.getElementById('chat-title').innerText = "КАНАЛ: НЕ ВЫБРАН"; 
    document.getElementById('messages-area').innerHTML = '<div class="no-chat-selected"><p>> СВЯЗЬ ПРЕРВАНА</p></div>'; 
});

async function openChat(chatId, chatName) {
    currentChatId = chatId;
    currentChatPartnerAvatar = null;
    let myClearedAt = null;
    
    document.getElementById('chat-title').innerText = `КАНАЛ: ${chatName}`;
    document.getElementById('msg-form').style.display = 'flex'; 
    document.getElementById('messages-area').innerHTML = ''; 
    chatPanel.classList.add('open');
    
    if(btnCall) btnCall.style.display = 'flex';
    if(btnToggleSearch) btnToggleSearch.style.display = 'block';
    if(searchInput) searchInput.blur(); 

    try {
        const chatSnap = await getDoc(doc(db, "chats", chatId));
        if (chatSnap.exists()) {
            const data = chatSnap.data();
            if (data.clearedAt && data.clearedAt[auth.currentUser.uid]) {
                myClearedAt = data.clearedAt[auth.currentUser.uid];
            }
            const partnerUid = data.participants.find(uid => uid !== auth.currentUser.uid);
            if (partnerUid) {
                const userSnap = await getDoc(doc(db, "users", partnerUid));
                if (userSnap.exists() && userSnap.data().avatarBase64) {
                    currentChatPartnerAvatar = userSnap.data().avatarBase64;
                }
            }
        }
    } catch (e) { console.error(e); }

    if (unsubscribeMessages) unsubscribeMessages();
    
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"));
    
    unsubscribeMessages = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
        const area = document.getElementById('messages-area');
        area.innerHTML = '';
        snap.forEach((docSnap) => {
            const msg = docSnap.data();
            if (myClearedAt && msg.createdAt && msg.createdAt.toMillis() <= myClearedAt.toMillis()) return;
            if (msg.senderId !== auth.currentUser.uid && !msg.read && !docSnap.metadata.hasPendingWrites) {
                updateDoc(doc(db, "chats", chatId, "messages", docSnap.id), { read: true });
            }
            renderMessage(docSnap);
        });
        setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
    });
}

// ==========================================
// === 4. СООБЩЕНИЯ И МЕДИА ===
// ==========================================
// (Обработчики ввода и отправки)
if (msgInput) {
    msgInput.addEventListener('input', () => {
        const text = msgInput.value.trim();
        if (text.length > 0) {
            btnSendText.style.display = 'flex';
            btnMicRec.style.display = 'none';
        } else {
            btnSendText.style.display = 'none';
            btnMicRec.style.display = 'flex';
        }
    });
}

document.getElementById('msg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = msgInput.value.trim();
    if (!text || !currentChatId) return;
    await addDoc(collection(db, "chats", currentChatId, "messages"), {
        text, 
        senderId: auth.currentUser.uid, 
        senderNick: currentUserData.nickname,
        senderAvatar: currentUserData.avatarBase64 || null, 
        createdAt: serverTimestamp(), 
        edited: false, read: false
    });
    await updateDoc(doc(db, "chats", currentChatId), { lastUpdated: serverTimestamp(), hiddenFor: [] });
    msgInput.value = '';
    btnSendText.style.display = 'none'; btnMicRec.style.display = 'flex';
});

// === ЗАПИСЬ ГОЛОСОВОГО ===
const startRecording = async (e) => {
    if(e.type === 'touchstart') e.preventDefault();
    if (isRecording) { if (isLockedMode) stopAndSend(); return; }
    recStartTimePress = Date.now();
    if (!navigator.mediaDevices) return alert("Микрофон недоступен");

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        detectedMimeType = mediaRecorder.mimeType; 
        audioChunks = [];
        mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunks.push(event.data); };
        mediaRecorder.onstop = async () => {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
            const finalType = detectedMimeType || 'audio/mp4'; 
            const audioBlob = new Blob(audioChunks, { type: finalType });
            if (audioBlob.size < 500) return; 
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = async () => {
                const base64Audio = reader.result;
                try {
                    await addDoc(collection(db, "chats", currentChatId, "messages"), {
                        text: "[ГОЛОСОВОЕ]", audioBase64: base64Audio,
                        senderId: auth.currentUser.uid, senderNick: currentUserData.nickname,
                        senderAvatar: currentUserData.avatarBase64 || null,
                        createdAt: serverTimestamp(), edited: false, read: false
                    });
                    await updateDoc(doc(db, "chats", currentChatId), { lastUpdated: serverTimestamp(), hiddenFor: [] });
                } catch (e) { showModal("СБОЙ ОТПРАВКИ", "alert"); }
            };
        };
        mediaRecorder.start(100); 
        isRecording = true; isLockedMode = false;
        if(recordingOverlay) { recordingOverlay.style.display = 'flex'; document.getElementById('rec-status-text').innerText = "ЗАПИСЬ..."; }
    } catch (err) { console.error("Mic Error:", err); }
};

const handleRelease = (e) => {
    if (e.type === 'touchend') e.preventDefault();
    if (!isRecording) return;
    const pressDuration = Date.now() - recStartTimePress;
    if (pressDuration < 500 && !isLockedMode) {
        isLockedMode = true;
        document.getElementById('rec-status-text').innerText = "НАЖМИТЕ ДЛЯ ОТПРАВКИ";
        if(btnMicRec) btnMicRec.style.border = "1px solid red"; 
        return;
    }
    if (!isLockedMode) stopAndSend();
};

const stopAndSend = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    isRecording = false; isLockedMode = false;
    if(recordingOverlay) recordingOverlay.style.display = 'none';
    if(btnMicRec) btnMicRec.style.border = "";
};

if (btnMicRec) {
    btnMicRec.addEventListener('mousedown', startRecording);
    btnMicRec.addEventListener('touchstart', startRecording);
    btnMicRec.addEventListener('mouseup', handleRelease);
    btnMicRec.addEventListener('touchend', handleRelease);
    btnMicRec.addEventListener('mouseleave', (e) => { if (isRecording && !isLockedMode) stopAndSend(); });
}

// === ЗАГРУЗКА ФОТО/ВИДЕО ===
const CHUNK_SIZE = 500 * 1024; 
async function uploadFileInChunks(file, parentDocId) {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const batch = writeBatch(db);
    for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const blob = file.slice(start, end);
        const chunkBase64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(blob);
        });
        const chunkRef = doc(collection(db, "chats", currentChatId, "messages", parentDocId, "chunks"));
        batch.set(chunkRef, { index: i, data: chunkBase64 });
    }
    await batch.commit();
}
async function loadVideoFromChunks(msgId, mimeType) {
    const q = query(collection(db, "chats", currentChatId, "messages", msgId, "chunks"), orderBy("index"));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    let parts = [];
    snap.forEach(d => { parts.push(fetch(d.data().data).then(res => res.blob())); });
    const blobs = await Promise.all(parts);
    return new Blob(blobs, { type: mimeType });
}
function compressChatImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image(); img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas'); const MAX_SIZE = 600; 
                let w = img.width; let h = img.height;
                if (w > h) { if (w > MAX_SIZE) { h *= MAX_SIZE / w; w = MAX_SIZE; } } else { if (h > MAX_SIZE) { w *= MAX_SIZE / h; h = MAX_SIZE; } }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/jpeg", 0.6));
            }; img.onerror = (err) => reject(err);
        };
    });
}
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image(); img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas'); const MAX_WIDTH = 300; let w = img.width; let h = img.height;
                if (w > h) { if (w > MAX_WIDTH) { h *= MAX_WIDTH / w; w = MAX_WIDTH; } } else { if (h > MAX_WIDTH) { w *= MAX_WIDTH / h; h = MAX_WIDTH; } }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/jpeg", 0.7));
            }; img.onerror = (err) => reject(err);
        };
    });
}
function generateVideoThumbnail(file) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = URL.createObjectURL(file);
        video.muted = true; video.playsInline = true; video.currentTime = 1;
        video.onloadeddata = () => { if (video.duration < 1) video.currentTime = 0; };
        video.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.5));
        };
        video.onerror = () => { resolve(null); };
    });
}

btnAttachImg.addEventListener('click', () => { chatImgUpload.value=''; chatImgUpload.click(); });
chatImgUpload.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return; selectedFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const result = ev.target.result;
        if (file.type.startsWith('video/')) {
            photoPreviewImg.style.display = 'none'; videoPreviewEl.style.display = 'block'; videoPreviewEl.src = result;
        } else {
            videoPreviewEl.style.display = 'none'; photoPreviewImg.style.display = 'block'; photoPreviewImg.src = result;
        }
        photoCaptionInput.value = ''; photoModal.classList.add('active'); 
    };
    reader.readAsDataURL(file);
});
btnCancelPhoto.addEventListener('click', () => { photoModal.classList.remove('active'); chatImgUpload.value=''; selectedFile = null; });
btnConfirmPhoto.addEventListener('click', async () => {
    if (!selectedFile || !currentChatId) return;
    const isVideo = selectedFile.type.startsWith('video/');
    btnConfirmPhoto.innerText = isVideo ? "ЗАГРУЗКА..." : "СЖАТИЕ..."; btnConfirmPhoto.disabled = true;
    try {
        let contentBase64 = null; let isChunked = false; let videoThumb = null;
        const caption = photoCaptionInput.value.trim() || (isVideo ? "[ВИДЕО]" : "[ФОТО]");
        if (isVideo) {
            isChunked = true; videoThumb = await generateVideoThumbnail(selectedFile);
        } else {
            contentBase64 = await compressChatImage(selectedFile);
        }
        const msgData = {
            text: caption, senderId: auth.currentUser.uid, senderNick: currentUserData.nickname,
            senderAvatar: currentUserData.avatarBase64 || null, createdAt: serverTimestamp(), edited: false, read: false,
            type: isVideo ? 'video' : 'image', mimeType: selectedFile.type
        };
        if (isChunked) {
            msgData.isChunked = true; msgData.fileSize = selectedFile.size; msgData.videoThumbnail = videoThumb;
        } else {
            msgData.imageBase64 = contentBase64;
        }
        const msgRef = await addDoc(collection(db, "chats", currentChatId, "messages"), msgData);
        if (isChunked) await uploadFileInChunks(selectedFile, msgRef.id);
        await updateDoc(doc(db, "chats", currentChatId), { lastUpdated: serverTimestamp(), hiddenFor: [] });
        photoModal.classList.remove('active'); chatImgUpload.value = ''; selectedFile = null;
    } catch (err) { console.error(err); alert("ОШИБКА"); } 
    finally { btnConfirmPhoto.innerText = "ОТПРАВИТЬ"; btnConfirmPhoto.disabled = false; }
});

// ==========================================
// === 5. РЕНДЕР СООБЩЕНИЙ ===
// ==========================================
function renderMessage(docSnap) {
    const msg = docSnap.data();
    const isMine = msg.senderId === auth.currentUser.uid;
    const row = document.createElement('div');
    row.className = `msg-row ${isMine ? 'my' : 'other'}`;

    if (!isMine) {
        const avatar = document.createElement('img');
        avatar.className = 'chat-avatar';
        if (currentChatPartnerAvatar) avatar.src = currentChatPartnerAvatar;
        else if (msg.senderAvatar) avatar.src = msg.senderAvatar;
        else avatar.src = DEFAULT_AVATAR;
        avatar.onclick = () => openProfile(msg.senderId, false);
        row.appendChild(avatar);
    }

    const div = document.createElement('div');
    div.className = `msg ${isMine ? 'my' : 'other'}`;
    
    if (!isMine) {
        const nickSpan = document.createElement('div');
        nickSpan.innerText = msg.senderNick;
        nickSpan.style.fontSize = '0.7rem'; nickSpan.style.marginBottom = '2px'; nickSpan.style.color = '#888'; nickSpan.style.cursor = 'pointer';
        nickSpan.onclick = () => openProfile(msg.senderId, false);
        div.appendChild(nickSpan);
    }

    const contentDiv = document.createElement('div');
    if (msg.audioBase64) {
        const audioWrapper = document.createElement('div');
        audioWrapper.className = 'audio-player-wrapper';
        const audio = document.createElement('audio');
        audio.controls = true; audio.src = msg.audioBase64;
        audioWrapper.appendChild(audio);
        contentDiv.appendChild(audioWrapper);
    } else if (msg.type === 'video' && msg.isChunked) {
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-msg-container';
        const thumbSrc = msg.videoThumbnail || DEFAULT_AVATAR; 
        videoContainer.innerHTML = `<img src="${thumbSrc}" class="msg-video-thumb"><div class="play-icon-overlay"></div>`;
        videoContainer.onclick = async () => {
            if (videoContainer.dataset.blobUrl) { viewMedia('video', videoContainer.dataset.blobUrl, msg.text); return; }
            const playIcon = videoContainer.querySelector('.play-icon-overlay');
            playIcon.style.border = "2px dashed yellow";
            try {
                const videoBlob = await loadVideoFromChunks(docSnap.id, msg.mimeType);
                if (videoBlob) {
                    const vidUrl = URL.createObjectURL(videoBlob);
                    videoContainer.dataset.blobUrl = vidUrl; 
                    viewMedia('video', vidUrl, msg.text);
                    playIcon.style.border = "2px solid #fff";
                } else alert("ОШИБКА ВИДЕО");
            } catch (e) { alert("СБОЙ СЕТИ"); }
        };
        contentDiv.appendChild(videoContainer);
        if(msg.text && msg.text !== "[ВИДЕО]") {
            const caption = document.createElement('div'); caption.innerText = msg.text; caption.style.marginTop = "5px"; contentDiv.appendChild(caption);
        }
    } else if (msg.imageBase64 || msg.type === 'image') {
        const img = document.createElement('img');
        img.src = msg.imageBase64; img.className = 'msg-image-content';
        img.onclick = () => viewMedia('image', msg.imageBase64, msg.text);
        contentDiv.appendChild(img);
        if(msg.text && msg.text !== "[ФОТО]") {
            const caption = document.createElement('div'); caption.innerText = msg.text; caption.style.marginTop = "5px"; contentDiv.appendChild(caption);
        }
    } else {
        contentDiv.innerHTML = `${msg.text} ${msg.edited ? '<small>(РЕД.)</small>' : ''}`;
    }
    div.appendChild(contentDiv);

    const metaDiv = document.createElement('div'); metaDiv.className = 'msg-meta';
    if (isMine && !msg.imageBase64 && !msg.audioBase64 && !msg.videoBase64 && msg.type !== 'video') {
        const editBtn = document.createElement('span'); editBtn.innerText = '[E]'; editBtn.style.cursor = 'pointer'; editBtn.style.marginRight = '5px';
        editBtn.onclick = () => editMsg(currentChatId, docSnap.id, msg.text);
        metaDiv.appendChild(editBtn);
    }
    if (isMine) {
        const delBtn = document.createElement('span'); delBtn.innerText = '[X]'; delBtn.style.cursor = 'pointer'; delBtn.style.marginRight = '5px';
        delBtn.onclick = () => deleteMsg(currentChatId, docSnap.id);
        metaDiv.appendChild(delBtn);
    }
    const timeSpan = document.createElement('span');
    const date = msg.createdAt ? msg.createdAt.toDate() : new Date();
    timeSpan.innerText = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    metaDiv.appendChild(timeSpan);
    if (isMine) {
        const statusSpan = document.createElement('span'); statusSpan.className = 'msg-status';
        if (docSnap.metadata.hasPendingWrites) { statusSpan.innerHTML = '🕒'; statusSpan.className += ' status-wait'; }
        else if (msg.read) { statusSpan.innerHTML = '✓✓'; statusSpan.className += ' status-read'; }
        else { statusSpan.innerHTML = '✓'; statusSpan.className += ' status-sent'; }
        metaDiv.appendChild(statusSpan);
    }
    div.appendChild(metaDiv);
    row.appendChild(div);
    const messagesArea = document.getElementById('messages-area');
    if (messagesArea) messagesArea.appendChild(row);
}

// ==========================================
// === 6. ПРОСМОТРЩИК И ПОИСК ===
// ==========================================
function closeLightbox() {
    imageViewerModal.classList.remove('active');
    fullImageView.src = "";
    try { fullVideoView.pause(); fullVideoView.currentTime = 0; fullVideoView.src = ""; fullVideoView.removeAttribute('src'); } catch (e) {}
}
function viewMedia(type, src, caption) {
    fullImageView.style.display = 'none'; fullVideoView.style.display = 'none';
    if (type === 'video') { fullVideoView.style.display = 'block'; fullVideoView.src = src; fullVideoView.play().catch(() => {}); }
    else { try { fullVideoView.pause(); } catch(e){} fullImageView.style.display = 'block'; fullImageView.src = src; }
    const cleanCaption = (caption && caption !== "[ФОТО]" && caption !== "[ВИДЕО]") ? caption : "";
    imageCaptionView.innerText = cleanCaption;
    imageViewerModal.classList.add('active');
}
if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', (e) => {
        e.stopPropagation(); const v = fullVideoView;
        if (v.requestFullscreen) v.requestFullscreen(); else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    });
}
if (closeImageViewer) closeImageViewer.onclick = closeLightbox;
imageViewerModal.addEventListener('click', (e) => { if (e.target === imageViewerModal) closeLightbox(); });

// ПРОФИЛЬ И ПОИСК
async function openProfile(uid, isMy) {
    profileToEdit=uid; let d=null;
    if(isMy) d=currentUserData; else {const s=await getDoc(doc(db,"users",uid)); if(s.exists()) d=s.data();}
    if(!d) return;
    profileNickInput.value=d.nickname; profileDescInput.value=d.description||"";
    if(d.avatarBase64){profileImgPreview.src=d.avatarBase64; profileImgPreview.style.display='block'; avatarPlaceholder.style.display='none';}
    else{profileImgPreview.src=DEFAULT_AVATAR; profileImgPreview.style.display='block'; avatarPlaceholder.style.display='none';}
    if(isMy){profileNickInput.disabled=false; profileDescInput.disabled=false; btnUploadAvatar.style.display='inline-block'; btnSaveProfile.style.display='inline-block';}
    else{profileNickInput.disabled=true; profileDescInput.disabled=true; btnUploadAvatar.style.display='none'; btnSaveProfile.style.display='none';}
    profileModal.classList.add('active');
}
btnUploadAvatar.addEventListener('click', () => avatarUpload.click());
avatarUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if(file) { try { const b = await compressImage(file); profileImgPreview.src=b; profileImgPreview.style.display='block'; avatarPlaceholder.style.display='none'; } catch(e){ alert("Err"); } }
});
btnSaveProfile.addEventListener('click', async()=>{
    const n=profileNickInput.value.trim(); const desc=profileDescInput.value.trim(); const av=profileImgPreview.src.startsWith('data:')?profileImgPreview.src:null;
    if(n.length<3) return alert("Короткий ник");
    await updateDoc(doc(db,"users",auth.currentUser.uid),{nickname:n, description:desc, avatarBase64:av});
    currentUserData.nickname=n; currentUserData.description=desc; currentUserData.avatarBase64=av;
    updateMyDisplay(); profileModal.classList.remove('active');
});
btnCloseProfile.addEventListener('click',()=>profileModal.classList.remove('active'));

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const text = e.target.value.trim();
        if (!text) { searchResultsArea.style.display = 'none'; if(searchIndicator) searchIndicator.classList.remove('active'); return; }
        if(searchIndicator) searchIndicator.classList.add('active');
        searchResultsArea.style.display = 'block'; searchList.innerHTML = '<div style="padding:15px; opacity:0.7;">>> СКАНИРОВАНИЕ...</div>';
        clearTimeout(searchTimeout); searchTimeout = setTimeout(() => executeSearch(text), 500);
    });
}
async function executeSearch(qT) {
    try { const end=qT+'\uf8ff'; const q=query(collection(db,"users"),orderBy("nickname"),where("nickname",">=",qT),where("nickname","<=",end),limit(3)); const s=await getDocs(q); renderSearchResults(s); }
    catch(e){searchList.innerHTML=`<div style="color:red">ERROR</div>`;} finally{if(searchIndicator)searchIndicator.classList.remove('active');}
}
function renderSearchResults(s) {
    searchList.innerHTML=''; if(s.empty){searchList.innerHTML='<div style="padding:15px;opacity:0.5">НЕТ ЦЕЛИ</div>'; return;}
    s.forEach(d=>{
        const u=d.data(); const uid=d.id; if(uid===auth.currentUser.uid)return;
        const div=document.createElement('div'); div.className='search-item';
        const av=u.avatarBase64||DEFAULT_AVATAR;
        div.innerHTML=`<span><img src="${av}" style="width:25px;height:25px;border-radius:50%;vertical-align:middle;margin-right:5px;border:1px solid #33ff33">${u.nickname}</span> <span style="font-size:0.7rem;opacity:0.6">[СВЯЗЬ]</span>`;
        div.onclick=()=>{searchInput.value=''; searchResultsArea.style.display='none'; startChat(uid,u.nickname);};
        searchList.appendChild(div);
    });
}
document.addEventListener('click',(e)=>{if(searchInput&&!searchInput.contains(e.target)&&!searchResultsArea.contains(e.target))searchResultsArea.style.display='none';});
async function startChat(tUid, tNick){
    const cid=[auth.currentUser.uid,tUid].sort().join("_");
    await setDoc(doc(db,"chats",cid),{participants:[auth.currentUser.uid,tUid],participantNames:[currentUserData.nickname,tNick],lastUpdated:serverTimestamp()}, {merge:true});
    openChat(cid,tNick);
}
window.confirmDeleteChat=(cid)=>{chatToDeleteId=cid; deleteChatModal.classList.add('active');};
document.getElementById('btn-del-cancel').addEventListener('click',()=>{deleteChatModal.classList.remove('active'); chatToDeleteId=null;});
document.getElementById('btn-del-me').addEventListener('click',async()=>{
    if(!chatToDeleteId)return;
    await updateDoc(doc(db,"chats",chatToDeleteId),{hiddenFor:arrayUnion(auth.currentUser.uid),[`clearedAt.${auth.currentUser.uid}`]:serverTimestamp()});
    deleteChatModal.classList.remove('active'); if(currentChatId===chatToDeleteId)document.getElementById('back-btn').click();
});
document.getElementById('btn-del-all').addEventListener('click',async()=>{
    if(!chatToDeleteId)return; if(!confirm("УНИЧТОЖИТЬ?"))return;
    const s=await getDocs(query(collection(db,"chats",chatToDeleteId,"messages")));
    s.forEach(d=>deleteDoc(d.ref)); await deleteDoc(doc(db,"chats",chatToDeleteId));
    deleteChatModal.classList.remove('active'); if(currentChatId===chatToDeleteId)document.getElementById('back-btn').click();
});
window.deleteMsg=async(c,m)=>{if(await showModal('УДАЛИТЬ?','confirm'))await deleteDoc(doc(db,"chats",c,"messages",m));};
window.editMsg=async(c,m,o)=>{const v=await showModal('ИЗМЕНИТЬ:','prompt',o); if(v&&v!==o)await updateDoc(doc(db,"chats",c,"messages",m),{text:v,edited:true});};

// ==========================================
// === 7. ПОИСК В ЧАТЕ ===
// ==========================================
let searchMatches = []; let currentMatchIndex = -1;
if (btnToggleSearch) { btnToggleSearch.addEventListener('click', () => { searchBar.style.display = 'flex'; searchInputChat.focus(); }); }
if (btnCloseSearch) { btnCloseSearch.addEventListener('click', closeSearch); }
function closeSearch() {
    searchBar.style.display = 'none'; clearHighlights(); searchInputChat.value = ''; searchMatches = []; currentMatchIndex = -1; updateSearchCount();
}
if (searchInputChat) {
    searchInputChat.addEventListener('input', (e) => {
        const text = e.target.value.trim().toLowerCase(); clearHighlights();
        if (text.length < 2) { searchMatches = []; currentMatchIndex = -1; updateSearchCount(); return; }
        performChatSearch(text);
    });
    searchInputChat.addEventListener('keydown', (e) => { if (e.key === 'Enter') navigateSearch(1); });
}
function performChatSearch(text) {
    const messages = document.querySelectorAll('#messages-area .msg'); searchMatches = [];
    messages.forEach(msgDiv => {
        const content = msgDiv.innerText; 
        if (content.toLowerCase().includes(text)) highlightTextInNode(msgDiv, text);
    });
    searchMatches = Array.from(document.querySelectorAll('.highlight-match'));
    if (searchMatches.length > 0) { currentMatchIndex = searchMatches.length - 1; focusMatch(currentMatchIndex); }
    updateSearchCount();
}
function highlightTextInNode(element, text) {
    if (!element.querySelector('img') && !element.querySelector('video') && !element.querySelector('.audio-player-wrapper')) {
        const innerHTML = element.innerHTML;
        const regex = new RegExp(`(${escapeRegExp(text)})`, 'gi');
        element.innerHTML = innerHTML.replace(regex, '<span class="highlight-match">$1</span>');
    } else {
        const children = element.childNodes;
        children.forEach(child => {
            if (child.nodeType === 3 && child.textContent.toLowerCase().includes(text)) {
                const span = document.createElement('span');
                span.innerHTML = child.textContent.replace(new RegExp(`(${escapeRegExp(text)})`, 'gi'), '<span class="highlight-match">$1</span>');
                element.replaceChild(span, child);
            }
        });
    }
}
function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function clearHighlights() {
    const highlights = document.querySelectorAll('.highlight-match, .highlight-current');
    highlights.forEach(span => { const parent = span.parentNode; parent.replaceChild(document.createTextNode(span.textContent), span); parent.normalize(); });
}
function focusMatch(index) {
    document.querySelectorAll('.highlight-current').forEach(el => el.classList.remove('highlight-current'));
    const el = searchMatches[index];
    if (el) { el.classList.add('highlight-current'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    updateSearchCount();
}
function navigateSearch(direction) {
    if (searchMatches.length === 0) return;
    currentMatchIndex += direction;
    if (currentMatchIndex >= searchMatches.length) currentMatchIndex = 0;
    if (currentMatchIndex < 0) currentMatchIndex = searchMatches.length - 1;
    focusMatch(currentMatchIndex);
}
function updateSearchCount() {
    if (searchMatches.length === 0) searchCountLabel.innerText = "0/0";
    else searchCountLabel.innerText = `${currentMatchIndex + 1}/${searchMatches.length}`;
}
if(btnSearchUp) btnSearchUp.addEventListener('click', () => navigateSearch(-1));
if(btnSearchDown) btnSearchDown.addEventListener('click', () => navigateSearch(1));

// ==========================================
// === 8. СИСТЕМА ЗВОНКОВ (V3 STABLE - FRESH PEER) ===
// ==========================================

// Агрессивная разблокировка аудио (iOS Fix)
function unlockAudioEngine() {
    const audioEl = document.getElementById('remote-audio');
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) { const ctx = new AudioContext(); if (ctx.state === 'suspended') ctx.resume(); }
    if (audioEl) {
        audioEl.srcObject = null; audioEl.muted = true;
        audioEl.play().then(() => { audioEl.muted = false; console.log("🔊 Audio Engine Unlocked"); })
        .catch(e => console.warn("Audio unlock pending interaction"));
    }
}

async function getMediaStream() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false
        });
        return stream;
    } catch (err) {
        alert("ОШИБКА МИКРОФОНА: " + err.message); throw err;
    }
}

// Создаем НОВЫЙ Peer для каждого соединения (решает проблему зомби-сессий)
function createPeer() {
    return new Promise((resolve, reject) => {
        if (peer) peer.destroy();
        peer = new Peer(peerConfig);
        peer.on('open', (id) => { console.log('✅ Fresh Peer ID:', id); resolve(id); });
        peer.on('error', (err) => { console.error("Peer Error:", err); });
        peer.on('call', (call) => {
            console.log("⚡ Incoming P2P Connection");
            if (localStream) { call.answer(localStream); setupCallEvents(call); }
        });
    });
}

function setupCallEvents(call) {
    currentCall = call;
    call.on('stream', (remoteStream) => {
        console.log("🎧 Stream Received");
        const audioEl = document.getElementById('remote-audio');
        if (audioEl) { audioEl.srcObject = remoteStream; audioEl.play().catch(e => console.error("Play error:", e)); }
        startCallTimer();
        document.getElementById('call-status-text').innerText = "В ЭФИРЕ";
        document.getElementById('call-status-text').style.color = "#33ff33";
    });
    call.on('close', () => endCallLocal());
    call.on('error', () => endCallLocal());
}

// --- КНОПКА ПОЗВОНИТЬ ---
if (btnCall) {
    btnCall.addEventListener('click', async () => {
        if (!currentChatId) return;
        unlockAudioEngine(); // Разблокируем аудио СРАЗУ

        const chatDoc = await getDoc(doc(db, "chats", currentChatId));
        const receiverId = chatDoc.data().participants.find(id => id !== auth.currentUser.uid);
        if (!receiverId) return;

        try { localStream = await getMediaStream(); } catch(e) { return; }

        showActiveCallScreen(currentUserData.nickname, "ИНИЦИАЛИЗАЦИЯ...");
        
        // 1. Создаем свой Peer
        await createPeer();

        // 2. Создаем документ вызова
        const callDocRef = await addDoc(collection(db, "calls"), {
            callerId: auth.currentUser.uid, callerName: currentUserData.nickname, callerAvatar: currentUserData.avatarBase64 || null,
            receiverId: receiverId, status: "offering", pickupId: null, timestamp: serverTimestamp()
        });
        activeCallDocId = callDocRef.id;
        document.getElementById('call-status-text').innerText = "ОЖИДАНИЕ ОТВЕТА...";

        // 3. Ждем, пока собеседник ответит и пришлет СВОЙ ID
        callUnsubscribe = onSnapshot(doc(db, "calls", activeCallDocId), (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();
            if (data.status === "answered" && data.pickupId && !currentCall) {
                document.getElementById('call-status-text').innerText = "СОЕДИНЕНИЕ...";
                console.log(`📞 Calling remote peer: ${data.pickupId}`);
                setTimeout(() => { const call = peer.call(data.pickupId, localStream); setupCallEvents(call); }, 500);
            } else if (data.status === "rejected" || data.status === "ended") { endCallLocal(); }
        });
    });
}

// --- СЛУШАТЕЛЬ ВХОДЯЩИХ ---
function initIncomingCallListener(myUid) {
    if (peer) peer.destroy();
    const q = query(collection(db, "calls"), where("receiverId", "==", myUid), where("status", "==", "offering"));
    onSnapshot(q, (snap) => {
        snap.docChanges().forEach((change) => {
            if (change.type === "added") {
                const data = change.doc.data();
                if (data.timestamp && (Date.now() - data.timestamp.toMillis() > 45000)) return; // Игнор старых
                showIncomingCallModal(change.doc.id, data);
            }
        });
    });
}

// --- КНОПКА ОТВЕТИТЬ ---
document.getElementById('btn-answer-call').addEventListener('click', async () => {
    document.getElementById('incoming-call-modal').classList.remove('active');
    unlockAudioEngine(); // Разблокируем аудио СРАЗУ

    try {
        showActiveCallScreen(incomingCallData.callerName, "ПОДКЛЮЧЕНИЕ...");
        localStream = await getMediaStream();

        // 1. Создаем СВЕЖИЙ Peer
        const myPickupId = await createPeer();

        // 2. Передаем свой ID звонящему через базу
        await updateDoc(doc(db, "calls", activeCallDocId), { status: "answered", pickupId: myPickupId });

        callUnsubscribe = onSnapshot(doc(db, "calls", activeCallDocId), (snap) => {
            if (!snap.exists() || snap.data().status === "ended") endCallLocal();
        });

    } catch (e) { console.error(e); rejectCall(); }
});

// UI Звонков
function showIncomingCallModal(docId, data) {
    if (activeCallDocId) return;
    incomingCallData = data; activeCallDocId = docId;
    document.getElementById('incoming-call-modal').classList.add('active');
    document.getElementById('incoming-caller-name').innerText = data.callerName;
    document.getElementById('incoming-call-avatar').src = data.callerAvatar || DEFAULT_AVATAR;
    if (navigator.vibrate) navigator.vibrate([200, 200, 200]);
}
document.getElementById('btn-decline-call').addEventListener('click', rejectCall);
async function rejectCall() {
    document.getElementById('incoming-call-modal').classList.remove('active');
    if (activeCallDocId) { try { await updateDoc(doc(db, "calls", activeCallDocId), { status: "rejected" }); } catch(e){} }
    activeCallDocId = null;
}
document.getElementById('btn-hangup').addEventListener('click', async () => {
    if (activeCallDocId) { try { await updateDoc(doc(db, "calls", activeCallDocId), { status: "ended" }); } catch(e){} }
    endCallLocal();
});
function endCallLocal() {
    document.getElementById('active-call-screen').classList.remove('active');
    document.getElementById('incoming-call-modal').classList.remove('active');
    if (currentCall) { currentCall.close(); currentCall = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (peer) { peer.destroy(); peer = null; }
    if (callUnsubscribe) { callUnsubscribe(); callUnsubscribe = null; }
    const audioEl = document.getElementById('remote-audio');
    if (audioEl) { audioEl.pause(); audioEl.srcObject = null; }
    stopCallTimer(); activeCallDocId = null; incomingCallData = null;
}
function showActiveCallScreen(name, status) {
    document.getElementById('active-call-screen').classList.add('active');
    document.getElementById('call-partner-name').innerText = name;
    document.getElementById('call-status-text').innerText = status;
    document.getElementById('call-status-text').style.color = "#888";
    callSeconds = 0; document.getElementById('call-timer').innerText = "00:00";
}
function startCallTimer() {
    stopCallTimer();
    callTimerInterval = setInterval(() => {
        callSeconds++;
        const m = Math.floor(callSeconds / 60).toString().padStart(2, '0');
        const s = (callSeconds % 60).toString().padStart(2, '0');
        document.getElementById('call-timer').innerText = `${m}:${s}`;
    }, 1000);
}
function stopCallTimer() { if (callTimerInterval) clearInterval(callTimerInterval); }
document.getElementById('btn-mic-toggle').addEventListener('click', () => {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (track) {
        track.enabled = !track.enabled;
        const btn = document.getElementById('btn-mic-toggle');
        if (!track.enabled) {
            btn.classList.add('muted');
            btn.innerHTML = `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path></svg>`;
        } else {
            btn.classList.remove('muted');
            btn.innerHTML = `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
        }
    }
});
