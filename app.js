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

// Дефолт аватар
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
// === ГЛАВНЫЙ КОНТРОЛЛЕР ВХОДА (САМОЛЕЧЕНИЕ) ===
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        authScreen.classList.remove('active');
        appInterface.classList.remove('hidden');
        
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            
            if (userDoc.exists()) {
                // Если профиль есть - грузим
                currentUserData = { uid: user.uid, ...userDoc.data() };
            } else {
                // ЕСЛИ ПРОФИЛЯ НЕТ (БАГ "UNKNOWN") -> СОЗДАЕМ АВТОМАТИЧЕСКИ
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
            console.error("Critical Auth Error:", e);
            showModal("СБОЙ СИСТЕМЫ ПРИ ЗАГРУЗКЕ ПРОФИЛЯ", "alert");
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

// ==========================================
// === ВХОД И РЕГИСТРАЦИЯ ===
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
        // Сразу создаем профиль
        const newData = { nickname: nick, email, createdAt: new Date(), avatarBase64: null, description: "" };
        await setDoc(doc(db, "users", cred.user.uid), newData);
        currentUserData = { uid: cred.user.uid, ...newData };
        
        updateMyDisplay(); // Обновляем сразу
        
    } catch (err) { showModal(err.message, 'alert'); }
});

// Навигация
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

// ==========================================
// === СПИСОК ЧАТОВ ===
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

// ==========================================
// === ОТКРЫТИЕ ЧАТА ===
// ==========================================
async function openChat(chatId, chatName) {
    currentChatId = chatId;
    currentChatPartnerAvatar = null;
    let myClearedAt = null;
    
    document.getElementById('chat-title').innerText = `КАНАЛ: ${chatName}`;
    document.getElementById('msg-form').style.display = 'flex'; 
    document.getElementById('messages-area').innerHTML = ''; 
    
    chatPanel.classList.add('open');
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
// === ЛОГИКА ОТПРАВКИ И ЗАПИСИ ===
// ==========================================
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
        edited: false,
        read: false
    });
    
    await updateDoc(doc(db, "chats", currentChatId), { 
        lastUpdated: serverTimestamp(),
        hiddenFor: [] 
    });
    
    msgInput.value = '';
    btnSendText.style.display = 'none';
    btnMicRec.style.display = 'flex';
});

// ГИБРИДНАЯ ЗАПИСЬ
const startRecording = async (e) => {
    if(e.type === 'touchstart') e.preventDefault();
    if (isRecording) {
        if (isLockedMode) stopAndSend();
        return;
    }
    recStartTimePress = Date.now();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return alert("Микрофон недоступен");

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
        if(recordingOverlay) {
            recordingOverlay.style.display = 'flex';
            document.getElementById('rec-status-text').innerText = "ЗАПИСЬ...";
        }
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

// ==========================================
// === ОТПРАВКА ФОТО/ВИДЕО (CHUNKING) ===
// ==========================================
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
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image(); img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas'); const MAX_SIZE = 600; 
                let w = img.width; let h = img.height;
                if (w > h) { if (w > MAX_SIZE) { h *= MAX_SIZE / w; w = MAX_SIZE; } } 
                else { if (h > MAX_SIZE) { w *= MAX_SIZE / h; h = MAX_SIZE; } }
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
// === РЕНДЕР И ПРОСМОТР ===
// ==========================================
// ==========================================
// === ПРОСМОТРЩИК (LIGHTBOX) ===
// ==========================================

// Функция принудительного закрытия
function closeLightbox() {
    imageViewerModal.classList.remove('active');
    fullImageView.src = "";
    try {
        fullVideoView.pause();
        fullVideoView.currentTime = 0;
        fullVideoView.src = ""; 
        fullVideoView.removeAttribute('src'); 
    } catch (e) { console.log("Видео остановлено"); }
}

function viewMedia(type, src, caption) {
    // Сбрасываем всё
    fullImageView.style.display = 'none';
    fullVideoView.style.display = 'none';
    
    // Управление кнопкой полного экрана
    if (fullscreenBtn) fullscreenBtn.style.display = 'none'; 

    if (type === 'video') {
        fullVideoView.style.display = 'block';
        fullVideoView.src = src;
        
        // Показываем кнопку полного экрана только для видео
        if (fullscreenBtn) fullscreenBtn.style.display = 'block';
        
        fullVideoView.play().catch(() => {}); 
    } else {
        try { fullVideoView.pause(); } catch(e){}
        fullImageView.style.display = 'block';
        fullImageView.src = src;
    }
    
    const cleanCaption = (caption && caption !== "[ФОТО]" && caption !== "[ВИДЕО]") ? caption : "";
    imageCaptionView.innerText = cleanCaption;
    imageViewerModal.classList.add('active');
}

// ЛОГИКА КНОПКИ ПОЛНОГО ЭКРАНА (УНИВЕРСАЛЬНАЯ)
if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Чтобы не закрылось окно при клике
        const v = fullVideoView;
        
        if (v.requestFullscreen) {
            v.requestFullscreen(); // Стандарт (Android/PC)
        } else if (v.webkitEnterFullscreen) {
            v.webkitEnterFullscreen(); // iOS (iPhone)
        } else if (v.webkitRequestFullscreen) {
            v.webkitRequestFullscreen(); // Старые Android
        } else if (v.mozRequestFullScreen) {
            v.mozRequestFullScreen(); // Firefox
        }
    });
}

// Привязка событий закрытия
if (closeImageViewer) closeImageViewer.onclick = closeLightbox;

imageViewerModal.addEventListener('click', (e) => {
    // Не закрываем, если нажали на кнопку полного экрана (на всякий случай)
    if (e.target === imageViewerModal) closeLightbox();
});
// ==========================================
// === РЕНДЕР СООБЩЕНИЙ (ИСПРАВЛЕНО) ===
// ==========================================
function renderMessage(docSnap) {
    const msg = docSnap.data();
    const isMine = msg.senderId === auth.currentUser.uid;
    
    // 1. Контейнер строки
    const row = document.createElement('div');
    row.className = `msg-row ${isMine ? 'my' : 'other'}`;

    // 2. Аватар (только для чужих)
    if (!isMine) {
        const avatar = document.createElement('img');
        avatar.className = 'chat-avatar';
        
        if (currentChatPartnerAvatar) {
            avatar.src = currentChatPartnerAvatar;
        } else if (msg.senderAvatar) {
            avatar.src = msg.senderAvatar;
        } else {
            avatar.src = DEFAULT_AVATAR;
        }
        
        avatar.onclick = () => openProfile(msg.senderId, false);
        row.appendChild(avatar);
    }

    // 3. Пузырь сообщения
    const div = document.createElement('div');
    div.className = `msg ${isMine ? 'my' : 'other'}`;
    
    // Имя над сообщением (для чужих)
    if (!isMine) {
        const nickSpan = document.createElement('div');
        nickSpan.innerText = msg.senderNick;
        nickSpan.style.fontSize = '0.7rem'; 
        nickSpan.style.marginBottom = '2px'; 
        nickSpan.style.color = '#888'; 
        nickSpan.style.cursor = 'pointer';
        nickSpan.onclick = () => openProfile(msg.senderId, false);
        div.appendChild(nickSpan);
    }

    // 4. Контент (Видео / Аудио / Фото / Текст)
    const contentDiv = document.createElement('div');
    
    if (msg.audioBase64) {
        // --- АУДИО ---
        const audioWrapper = document.createElement('div');
        audioWrapper.className = 'audio-player-wrapper';
        const audio = document.createElement('audio');
        audio.controls = true; 
        audio.src = msg.audioBase64;
        audioWrapper.appendChild(audio);
        contentDiv.appendChild(audioWrapper);

    } else if (msg.type === 'video' && msg.isChunked) {
        // --- ВИДЕО ---
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-msg-container';
        
        const thumbSrc = msg.videoThumbnail || DEFAULT_AVATAR; 
        videoContainer.innerHTML = `<img src="${thumbSrc}" class="msg-video-thumb"><div class="play-icon-overlay"></div>`;
        
        videoContainer.onclick = async () => {
            if (videoContainer.dataset.blobUrl) {
                viewMedia('video', videoContainer.dataset.blobUrl, msg.text);
                return;
            }
            const playIcon = videoContainer.querySelector('.play-icon-overlay');
            playIcon.style.border = "2px dashed yellow";
            
            try {
                const videoBlob = await loadVideoFromChunks(docSnap.id, msg.mimeType);
                if (videoBlob) {
                    const vidUrl = URL.createObjectURL(videoBlob);
                    videoContainer.dataset.blobUrl = vidUrl; 
                    viewMedia('video', vidUrl, msg.text);
                    playIcon.style.border = "2px solid #fff";
                } else {
                    alert("ОШИБКА ВИДЕО");
                }
            } catch (e) {
                alert("СБОЙ СЕТИ");
            }
        };
        contentDiv.appendChild(videoContainer);
        
        if(msg.text && msg.text !== "[ВИДЕО]") {
            const caption = document.createElement('div');
            caption.innerText = msg.text; 
            caption.style.marginTop = "5px";
            contentDiv.appendChild(caption);
        }

    } else if (msg.imageBase64 || msg.type === 'image') {
        // --- ФОТО ---
        const img = document.createElement('img');
        img.src = msg.imageBase64; 
        img.className = 'msg-image-content';
        img.onclick = () => viewMedia('image', msg.imageBase64, msg.text);
        contentDiv.appendChild(img);
        
        if(msg.text && msg.text !== "[ФОТО]") {
            const caption = document.createElement('div');
            caption.innerText = msg.text; 
            caption.style.marginTop = "5px";
            contentDiv.appendChild(caption);
        }
    } else {
        // --- ТЕКСТ ---
        contentDiv.innerHTML = `${msg.text} ${msg.edited ? '<small>(РЕД.)</small>' : ''}`;
    }
    
    div.appendChild(contentDiv);

    // 5. Мета-данные (Время, Ред, Удалить, Статус)
    const metaDiv = document.createElement('div');
    metaDiv.className = 'msg-meta';
    
    if (isMine && !msg.imageBase64 && !msg.audioBase64 && !msg.videoBase64 && msg.type !== 'video') {
        const editBtn = document.createElement('span');
        editBtn.innerText = '[E]'; 
        editBtn.style.cursor = 'pointer'; 
        editBtn.style.marginRight = '5px';
        editBtn.onclick = () => editMsg(currentChatId, docSnap.id, msg.text);
        metaDiv.appendChild(editBtn);
    }
    if (isMine) {
        const delBtn = document.createElement('span');
        delBtn.innerText = '[X]'; 
        delBtn.style.cursor = 'pointer'; 
        delBtn.style.marginRight = '5px';
        delBtn.onclick = () => deleteMsg(currentChatId, docSnap.id);
        metaDiv.appendChild(delBtn);
    }

    const timeSpan = document.createElement('span');
    const date = msg.createdAt ? msg.createdAt.toDate() : new Date();
    timeSpan.innerText = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    metaDiv.appendChild(timeSpan);

    if (isMine) {
        const statusSpan = document.createElement('span');
        statusSpan.className = 'msg-status';
        if (docSnap.metadata.hasPendingWrites) {
            statusSpan.innerHTML = '🕒'; 
            statusSpan.className += ' status-wait';
        } else if (msg.read) {
            statusSpan.innerHTML = '✓✓'; 
            statusSpan.className += ' status-read';
        } else {
            statusSpan.innerHTML = '✓'; 
            statusSpan.className += ' status-sent';
        }
        metaDiv.appendChild(statusSpan);
    }

    div.appendChild(metaDiv);
    row.appendChild(div);
    
    // 6. ВАЖНО: ДОБАВЛЕНИЕ В HTML
    const messagesArea = document.getElementById('messages-area');
    if (messagesArea) {
        messagesArea.appendChild(row);
    }
}

// ==========================================
// === ПРОФИЛЬ, ПОИСК, УДАЛЕНИЕ ===
// ==========================================
document.getElementById('my-profile-link').addEventListener('click', () => { if(currentUserData) openProfile(currentUserData.uid, true); });
btnUploadAvatar.addEventListener('click', () => avatarUpload.click());
avatarUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if(file) { try { const b = await compressImage(file); profileImgPreview.src=b; profileImgPreview.style.display='block'; avatarPlaceholder.style.display='none'; } catch(e){ alert("Err"); } }
});
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
