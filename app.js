import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, collection, query, where, getDocs, getDoc,
    addDoc, serverTimestamp, orderBy, onSnapshot, deleteDoc, updateDoc, limit, arrayUnion, writeBatch
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

// Запись аудио
let mediaRecorder = null;
let audioChunks = [];
let recStartTimePress = 0;
let isRecording = false;
let isLockedMode = false;
let detectedMimeType = '';

// --- ЗВОНКИ (WEBRTC FIXED) ---
let peer = null;
let currentCall = null;
let localStream = null;
let incomingCallData = null; 
let activeCallDocId = null; 
let callTimerInterval = null;
let callSeconds = 0;
let isMicMuted = false;

// Аватар
const DEFAULT_AVATAR = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2333ff33' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='100%25' height='100%25' fill='%23111'/%3E%3Cpath d='M12 2C9 2 7 3.5 7 6v1c0 .5-.5 1-1 1s-1 .5-1 1v2c0 1.5 1 2.5 3 3'/%3E%3Cpath d='M12 2c3 0 5 1.5 5 4v1c0 .5.5 1 1 1s1 .5 1 1v2c0 1.5-1 2.5-3 3'/%3E%3Cpath d='M16 11c0 2.5-1.5 4-4 4s-4-1.5-4-4'/%3E%3Cpath d='M4 22v-2c0-2.5 2-4 4-5'/%3E%3Cpath d='M20 22v-2c0-2.5-2-4-4-5'/%3E%3Cpath d='M8 4h8'/%3E%3C/svg%3E";

// DOM
const authScreen = document.getElementById('auth-screen');
const appInterface = document.getElementById('app-interface');
const chatPanel = document.getElementById('chat-screen');
const userDisplay = document.getElementById('user-display');
const myMiniAvatar = document.getElementById('my-mini-avatar');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const msgInput = document.getElementById('msg-input');
const btnSendText = document.getElementById('btn-send-text'); 
const btnMicRec = document.getElementById('btn-mic-rec');     
const recordingOverlay = document.getElementById('recording-overlay'); 
const chatImgUpload = document.getElementById('chat-img-upload');
const btnAttachImg = document.getElementById('btn-attach-img');
const btnCall = document.getElementById('btn-call');
const imageViewerModal = document.getElementById('image-viewer-modal');
const fullImageView = document.getElementById('full-image-view');
const fullVideoView = document.getElementById('full-video-view');
const imageCaptionView = document.getElementById('image-caption-view');
const closeImageViewer = document.getElementById('close-image-viewer');
const searchInput = document.getElementById('search-nick');
const searchIndicator = document.getElementById('search-indicator');
const searchResultsArea = document.getElementById('search-results');
const searchList = document.getElementById('search-list');
const profileModal = document.getElementById('profile-modal');
const profileNickInput = document.getElementById('profile-nick-input');
const profileDescInput = document.getElementById('profile-desc-input');
const profileImgPreview = document.getElementById('profile-img-preview');
const avatarPlaceholder = document.getElementById('avatar-placeholder');
const avatarUpload = document.getElementById('avatar-upload');
const btnUploadAvatar = document.getElementById('btn-upload-avatar');
const btnSaveProfile = document.getElementById('btn-save-profile');
const btnCloseProfile = document.getElementById('btn-close-profile');
const modalOverlay = document.getElementById('custom-modal');
const modalMsg = document.getElementById('modal-msg');
const modalInput = document.getElementById('modal-input-field');
const modalBtnConfirm = document.getElementById('modal-btn-confirm');
const modalBtnCancel = document.getElementById('modal-btn-cancel');
const deleteChatModal = document.getElementById('delete-chat-modal');
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
// === AUTH & INIT ===
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
                const newProfile = { nickname: "Soldier-" + user.uid.slice(0, 4), email: user.email, createdAt: new Date(), avatarBase64: null, description: "" };
                await setDoc(doc(db, "users", user.uid), newProfile);
                currentUserData = { uid: user.uid, ...newProfile };
            }
            updateMyDisplay();
            loadMyChats();
            initPeer(user.uid);
            listenForIncomingCalls(user.uid);
        } catch (e) { console.error("Auth Error:", e); }
    } else {
        appInterface.classList.add('hidden');
        authScreen.classList.add('active');
        currentUserData = null;
    }
});

function updateMyDisplay() {
    if (currentUserData) {
        userDisplay.innerText = `БОЕЦ: ${currentUserData.nickname}`;
        myMiniAvatar.src = currentUserData.avatarBase64 || DEFAULT_AVATAR;
        myMiniAvatar.style.display = 'block';
    }
}

// ==========================================
// === AUTH FORMS ===
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
    } catch (err) { showModal("ОШИБКА ДОСТУПА", 'alert'); }
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
document.getElementById('to-register').addEventListener('click', () => { document.getElementById('login-form').style.display = 'none'; document.getElementById('register-form').style.display = 'block'; });
document.getElementById('to-login').addEventListener('click', () => { document.getElementById('login-form').style.display = 'block'; document.getElementById('register-form').style.display = 'none'; });
document.getElementById('back-btn').addEventListener('click', () => { 
    chatPanel.classList.remove('open');
    if(btnCall) btnCall.style.display = 'none'; 
    if(document.getElementById('btn-toggle-search')) {
        document.getElementById('btn-toggle-search').style.display = 'none';
        document.getElementById('chat-search-bar').style.display = 'none';
        document.getElementById('chat-search-input').value = '';
    }
    if (unsubscribeMessages) unsubscribeMessages(); 
    currentChatId = null; 
    document.getElementById('msg-form').style.display = 'none'; 
    document.getElementById('chat-title').innerText = "КАНАЛ: НЕ ВЫБРАН"; 
    document.getElementById('messages-area').innerHTML = '<div class="no-chat-selected"><p>> СВЯЗЬ ПРЕРВАНА</p></div>'; 
});

// ==========================================
// === CHAT LIST ===
// ==========================================
function loadMyChats() {
    if (!auth.currentUser) return;
    const q = query(collection(db, "chats"), where("participants", "array-contains", auth.currentUser.uid), orderBy("lastUpdated", "desc"));
    unsubscribeChats = onSnapshot(q, (snap) => {
        const container = document.getElementById('chats-container');
        container.innerHTML = '';
        const visibleChats = snap.docs.filter(doc => !doc.data().hiddenFor || !doc.data().hiddenFor.includes(auth.currentUser.uid));
        if (visibleChats.length === 0) document.getElementById('empty-state').style.display = 'flex'; 
        else {
            document.getElementById('empty-state').style.display = 'none';
            visibleChats.forEach(async docSnap => {
                const data = docSnap.data();
                const otherName = data.participantNames.find(n => n !== currentUserData.nickname) || "UNKNOWN";
                const el = document.createElement('div');
                el.className = 'chat-item'; 
                const imgId = `avatar-chat-${docSnap.id}`;
                el.innerHTML = `<img id="${imgId}" src="${DEFAULT_AVATAR}" class="chat-list-avatar"><div style="flex:1;">${otherName}</div><button class="btn-trash" onclick="event.stopPropagation(); confirmDeleteChat('${docSnap.id}')">×</button>`;
                el.onclick = () => openChat(docSnap.id, otherName);
                container.appendChild(el);
                const otherUid = data.participants.find(uid => uid !== auth.currentUser.uid);
                if (otherUid) {
                    const userSnap = await getDoc(doc(db, "users", otherUid));
                    if (userSnap.exists() && userSnap.data().avatarBase64) document.getElementById(imgId).src = userSnap.data().avatarBase64;
                }
            });
        }
    });
}

// ==========================================
// === CHAT LOGIC ===
// ==========================================
async function openChat(chatId, chatName) {
    currentChatId = chatId;
    currentChatPartnerAvatar = null;
    let myClearedAt = null;
    document.getElementById('chat-title').innerText = `КАНАЛ: ${chatName}`;
    document.getElementById('msg-form').style.display = 'flex'; 
    document.getElementById('messages-area').innerHTML = ''; 
    chatPanel.classList.add('open');
    if(btnCall) btnCall.style.display = 'flex';
    if(document.getElementById('btn-toggle-search')) document.getElementById('btn-toggle-search').style.display = 'block';
    
    try {
        const chatSnap = await getDoc(doc(db, "chats", chatId));
        if (chatSnap.exists()) {
            const data = chatSnap.data();
            if (data.clearedAt && data.clearedAt[auth.currentUser.uid]) myClearedAt = data.clearedAt[auth.currentUser.uid];
            const partnerUid = data.participants.find(uid => uid !== auth.currentUser.uid);
            if (partnerUid) {
                const userSnap = await getDoc(doc(db, "users", partnerUid));
                if (userSnap.exists() && userSnap.data().avatarBase64) currentChatPartnerAvatar = userSnap.data().avatarBase64;
            }
        }
    } catch (e) {}

    if (unsubscribeMessages) unsubscribeMessages();
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"));
    unsubscribeMessages = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
        const area = document.getElementById('messages-area');
        area.innerHTML = '';
        snap.forEach((docSnap) => {
            const msg = docSnap.data();
            if (myClearedAt && msg.createdAt && msg.createdAt.toMillis() <= myClearedAt.toMillis()) return;
            if (msg.senderId !== auth.currentUser.uid && !msg.read && !docSnap.metadata.hasPendingWrites) updateDoc(doc(db, "chats", chatId, "messages", docSnap.id), { read: true });
            renderMessage(docSnap);
        });
        setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
    });
}

if (msgInput) {
    msgInput.addEventListener('input', () => {
        if (msgInput.value.trim().length > 0) { btnSendText.style.display = 'flex'; btnMicRec.style.display = 'none'; } 
        else { btnSendText.style.display = 'none'; btnMicRec.style.display = 'flex'; }
    });
}

document.getElementById('msg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = msgInput.value.trim();
    if (!text || !currentChatId) return;
    await addDoc(collection(db, "chats", currentChatId, "messages"), {
        text, senderId: auth.currentUser.uid, senderNick: currentUserData.nickname,
        senderAvatar: currentUserData.avatarBase64 || null, createdAt: serverTimestamp(), edited: false, read: false
    });
    await updateDoc(doc(db, "chats", currentChatId), { lastUpdated: serverTimestamp(), hiddenFor: [] });
    msgInput.value = ''; btnSendText.style.display = 'none'; btnMicRec.style.display = 'flex';
});

// AUDIO REC
const startRecording = async (e) => {
    if(e.type === 'touchstart') e.preventDefault();
    if (isRecording) { if (isLockedMode) stopAndSend(); return; }
    recStartTimePress = Date.now();
    if (!navigator.mediaDevices) return alert("Микрофон недоступен");
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        detectedMimeType = mediaRecorder.mimeType; audioChunks = [];
        mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunks.push(event.data); };
        mediaRecorder.onstop = async () => {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
            const audioBlob = new Blob(audioChunks, { type: detectedMimeType || 'audio/mp4' });
            if (audioBlob.size < 500) return; 
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = async () => {
                await addDoc(collection(db, "chats", currentChatId, "messages"), {
                    text: "[ГОЛОСОВОЕ]", audioBase64: reader.result, senderId: auth.currentUser.uid, 
                    senderNick: currentUserData.nickname, senderAvatar: currentUserData.avatarBase64,
                    createdAt: serverTimestamp(), edited: false, read: false
                });
                await updateDoc(doc(db, "chats", currentChatId), { lastUpdated: serverTimestamp(), hiddenFor: [] });
            };
        };
        mediaRecorder.start(100); isRecording = true; isLockedMode = false;
        if(recordingOverlay) { recordingOverlay.style.display = 'flex'; document.getElementById('rec-status-text').innerText = "ЗАПИСЬ..."; }
    } catch (err) {}
};
const handleRelease = (e) => {
    if (e.type === 'touchend') e.preventDefault();
    if (!isRecording) return;
    if (Date.now() - recStartTimePress < 500 && !isLockedMode) {
        isLockedMode = true; document.getElementById('rec-status-text').innerText = "НАЖМИТЕ ДЛЯ ОТПРАВКИ";
        if(btnMicRec) btnMicRec.style.border = "1px solid red"; return;
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
    btnMicRec.addEventListener('mousedown', startRecording); btnMicRec.addEventListener('touchstart', startRecording);
    btnMicRec.addEventListener('mouseup', handleRelease); btnMicRec.addEventListener('touchend', handleRelease);
}

// MEDIA UPLOAD
const CHUNK_SIZE = 500 * 1024; 
async function uploadFileInChunks(file, parentDocId) {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const batch = writeBatch(db);
    for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE; const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunkBase64 = await new Promise((r) => { const rd = new FileReader(); rd.onload = (e) => r(e.target.result); rd.readAsDataURL(file.slice(start, end)); });
        batch.set(doc(collection(db, "chats", currentChatId, "messages", parentDocId, "chunks")), { index: i, data: chunkBase64 });
    }
    await batch.commit();
}
async function loadVideoFromChunks(msgId, mimeType) {
    const s = await getDocs(query(collection(db, "chats", currentChatId, "messages", msgId, "chunks"), orderBy("index")));
    if (s.empty) return null;
    let p = []; s.forEach(d => p.push(fetch(d.data().data).then(res => res.blob())));
    return new Blob(await Promise.all(p), { type: mimeType });
}
function compressImage(file, quality=0.7) {
    return new Promise((r, j) => {
        const rd = new FileReader(); rd.readAsDataURL(file);
        rd.onload = (e) => { const i = new Image(); i.src = e.target.result; i.onload = () => {
            const c = document.createElement('canvas'); const MAX = 600; let w = i.width, h = i.height;
            if (w>h){if(w>MAX){h*=MAX/w;w=MAX}}else{if(h>MAX){w*=MAX/h;h=MAX}}
            c.width=w;c.height=h; c.getContext("2d").drawImage(i,0,0,w,h); r(c.toDataURL("image/jpeg", quality));
        }; i.onerror=j; };
    });
}
function generateVideoThumbnail(file) {
    return new Promise((r) => {
        const v = document.createElement('video'); v.src = URL.createObjectURL(file); v.muted=true; v.currentTime=1;
        v.onseeked = () => { const c=document.createElement('canvas'); c.width=v.videoWidth; c.height=v.videoHeight; c.getContext('2d').drawImage(v,0,0); r(c.toDataURL('image/jpeg',0.5)); };
        v.onerror=()=>r(null);
    });
}
btnAttachImg.addEventListener('click', () => { chatImgUpload.value=''; chatImgUpload.click(); });
chatImgUpload.addEventListener('change', (e) => {
    selectedFile = e.target.files[0]; if (!selectedFile) return;
    const r = new FileReader(); r.onload = (ev) => {
        if (selectedFile.type.startsWith('video/')) { photoPreviewImg.style.display='none'; videoPreviewEl.style.display='block'; videoPreviewEl.src=ev.target.result; }
        else { videoPreviewEl.style.display='none'; photoPreviewImg.style.display='block'; photoPreviewImg.src=ev.target.result; }
        photoModal.classList.add('active'); 
    };
    r.readAsDataURL(selectedFile);
});
btnCancelPhoto.addEventListener('click', () => { photoModal.classList.remove('active'); selectedFile = null; });
btnConfirmPhoto.addEventListener('click', async () => {
    if (!selectedFile || !currentChatId) return;
    const isVideo = selectedFile.type.startsWith('video/');
    btnConfirmPhoto.innerText = "ЗАГРУЗКА..."; btnConfirmPhoto.disabled = true;
    try {
        let content = null, isChunked = false, thumb = null;
        const cap = photoCaptionInput.value.trim() || (isVideo ? "[ВИДЕО]" : "[ФОТО]");
        if (isVideo) { isChunked = true; thumb = await generateVideoThumbnail(selectedFile); }
        else { content = await compressImage(selectedFile, 0.6); }
        const m = { text: cap, senderId: auth.currentUser.uid, senderNick: currentUserData.nickname, senderAvatar: currentUserData.avatarBase64, createdAt: serverTimestamp(), type: isVideo ? 'video' : 'image', mimeType: selectedFile.type };
        if (isChunked) { m.isChunked = true; m.fileSize = selectedFile.size; m.videoThumbnail = thumb; } else { m.imageBase64 = content; }
        const ref = await addDoc(collection(db, "chats", currentChatId, "messages"), m);
        if (isChunked) await uploadFileInChunks(selectedFile, ref.id);
        await updateDoc(doc(db, "chats", currentChatId), { lastUpdated: serverTimestamp(), hiddenFor: [] });
        photoModal.classList.remove('active'); selectedFile = null;
    } catch (e) { alert("ERR"); } finally { btnConfirmPhoto.innerText = "ОТПРАВИТЬ"; btnConfirmPhoto.disabled = false; }
});

// MEDIA VIEWER
function closeLightbox() { imageViewerModal.classList.remove('active'); fullImageView.src=""; fullVideoView.src=""; fullVideoView.removeAttribute('src'); }
function viewMedia(t, s, c) {
    fullImageView.style.display='none'; fullVideoView.style.display='none';
    if(t==='video'){ fullVideoView.style.display='block'; fullVideoView.src=s; fullVideoView.play().catch(()=>{}); }
    else{ fullImageView.style.display='block'; fullImageView.src=s; }
    imageCaptionView.innerText = c || ""; imageViewerModal.classList.add('active');
}
if(closeImageViewer) closeImageViewer.onclick = closeLightbox;

// RENDER MSG
function renderMessage(docSnap) {
    const msg = docSnap.data();
    const isMine = msg.senderId === auth.currentUser.uid;
    const row = document.createElement('div'); row.className = `msg-row ${isMine ? 'my' : 'other'}`;
    if (!isMine) {
        const av = document.createElement('img'); av.className = 'chat-avatar'; av.src = msg.senderAvatar || DEFAULT_AVATAR;
        av.onclick = () => openProfile(msg.senderId, false); row.appendChild(av);
    }
    const div = document.createElement('div'); div.className = `msg ${isMine ? 'my' : 'other'}`;
    if (!isMine) { const n = document.createElement('div'); n.innerText = msg.senderNick; n.style.fontSize='0.7rem'; n.style.color='#888'; div.appendChild(n); }
    const cDiv = document.createElement('div');
    if (msg.audioBase64) {
        cDiv.innerHTML = `<div class="audio-player-wrapper"><audio controls src="${msg.audioBase64}"></audio></div>`;
    } else if (msg.type === 'video' && msg.isChunked) {
        const v = document.createElement('div'); v.className = 'video-msg-container';
        v.innerHTML = `<img src="${msg.videoThumbnail||DEFAULT_AVATAR}" class="msg-video-thumb"><div class="play-icon-overlay"></div>`;
        v.onclick = async () => {
            if(v.dataset.url) return viewMedia('video', v.dataset.url, msg.text);
            try { const b = await loadVideoFromChunks(docSnap.id, msg.mimeType); if(b){ const u=URL.createObjectURL(b); v.dataset.url=u; viewMedia('video', u, msg.text); } } catch(e){alert("ERR");}
        }; cDiv.appendChild(v);
        if(msg.text && msg.text!=="[ВИДЕО]") { const t=document.createElement('div'); t.innerText=msg.text; cDiv.appendChild(t); }
    } else if (msg.imageBase64 || msg.type === 'image') {
        const i = document.createElement('img'); i.src = msg.imageBase64; i.className = 'msg-image-content';
        i.onclick = () => viewMedia('image', msg.imageBase64, msg.text); cDiv.appendChild(i);
        if(msg.text && msg.text!=="[ФОТО]") { const t=document.createElement('div'); t.innerText=msg.text; cDiv.appendChild(t); }
    } else { cDiv.innerHTML = `${msg.text} ${msg.edited?'<small>(РЕД.)</small>':''}`; }
    div.appendChild(cDiv);
    const mDiv = document.createElement('div'); mDiv.className = 'msg-meta';
    if(isMine && !msg.type){ const e=document.createElement('span'); e.innerText='[E]'; e.onclick=()=>editMsg(currentChatId, docSnap.id, msg.text); mDiv.appendChild(e); }
    if(isMine){ const d=document.createElement('span'); d.innerText='[X]'; d.onclick=()=>deleteMsg(currentChatId, docSnap.id); mDiv.appendChild(d); }
    const tm=msg.createdAt?msg.createdAt.toDate():new Date(); mDiv.appendChild(document.createTextNode(`${tm.getHours()}:${tm.getMinutes().toString().padStart(2,'0')}`));
    if(isMine) mDiv.innerHTML+= msg.read ? '<span class="msg-status status-read">✓✓</span>' : '<span class="msg-status status-sent">✓</span>';
    div.appendChild(mDiv); row.appendChild(div);
    document.getElementById('messages-area').appendChild(row);
}

// PROFILE & SEARCH
document.getElementById('my-profile-link').addEventListener('click', () => { if(currentUserData) openProfile(currentUserData.uid, true); });
btnUploadAvatar.addEventListener('click', () => avatarUpload.click());
avatarUpload.addEventListener('change', async (e) => { const f=e.target.files[0]; if(f) profileImgPreview.src=await compressImage(f); });
async function openProfile(uid, isMy) {
    profileToEdit=uid; let d=isMy?currentUserData: (await getDoc(doc(db,"users",uid))).data();
    if(!d) return;
    profileNickInput.value=d.nickname; profileDescInput.value=d.description||""; profileImgPreview.src=d.avatarBase64||DEFAULT_AVATAR;
    profileModal.classList.add('active');
    if(isMy){profileNickInput.disabled=false;btnSaveProfile.style.display='inline';} else {profileNickInput.disabled=true;btnSaveProfile.style.display='none';}
}
btnSaveProfile.addEventListener('click', async()=>{
    const n=profileNickInput.value.trim(); if(n.length<3)return;
    await updateDoc(doc(db,"users",auth.currentUser.uid),{nickname:n, description:profileDescInput.value, avatarBase64:profileImgPreview.src});
    location.reload();
});
btnCloseProfile.addEventListener('click',()=>profileModal.classList.remove('active'));

if(searchInput) searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout); 
    if(!e.target.value.trim()){searchResultsArea.style.display='none';return;}
    searchResultsArea.style.display='block'; searchList.innerHTML='SCANNING...';
    searchTimeout=setTimeout(async()=>{
        const t=e.target.value.trim(); const q=query(collection(db,"users"),orderBy("nickname"),where("nickname",">=",t),where("nickname","<=",t+'\uf8ff'),limit(5));
        const s=await getDocs(q); searchList.innerHTML='';
        s.forEach(d=>{
            if(d.id===auth.currentUser.uid)return;
            const dv=document.createElement('div'); dv.className='search-item'; dv.innerHTML=`${d.data().nickname}`;
            dv.onclick=async()=>{
                const cid=[auth.currentUser.uid,d.id].sort().join("_");
                await setDoc(doc(db,"chats",cid),{participants:[auth.currentUser.uid,d.id], participantNames:[currentUserData.nickname,d.data().nickname], lastUpdated:serverTimestamp()}, {merge:true});
                searchResultsArea.style.display='none'; openChat(cid,d.data().nickname);
            }; searchList.appendChild(dv);
        });
    },500);
});

window.confirmDeleteChat=(cid)=>{chatToDeleteId=cid; deleteChatModal.classList.add('active');};
document.getElementById('btn-del-cancel').addEventListener('click',()=>{deleteChatModal.classList.remove('active');});
document.getElementById('btn-del-me').addEventListener('click',async()=>{
    await updateDoc(doc(db,"chats",chatToDeleteId),{hiddenFor:arrayUnion(auth.currentUser.uid)});
    deleteChatModal.classList.remove('active'); document.getElementById('back-btn').click();
});
window.deleteMsg=async(c,m)=>{if(confirm('DEL?'))await deleteDoc(doc(db,"chats",c,"messages",m));};
window.editMsg=async(c,m,o)=>{const v=prompt('Edit:',o);if(v&&v!==o)await updateDoc(doc(db,"chats",c,"messages",m),{text:v,edited:true});};

// =================================================================
// === ULTRA ROBUST WEBRTC (FIXED FOR 4G/MOBILE) ===
// =================================================================

function initPeer(uid) {
    if (peer) return;
    console.log("🚀 Init High-Availability Peer...");

    // АГРЕССИВНЫЙ КОНФИГ ДЛЯ ПРОБИВАНИЯ NAT
    const iceConfig = {
        iceServers: [
            // 1. Google STUN (UDP) - Основа
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            
            // 2. Дополнительные STUN (если Google заблокирован)
            { urls: 'stun:global.stun.twilio.com:3478' },
            { urls: 'stun:stun.framasoft.org:3478' },

            // 3. OpenRelay (Бесплатный TURN) - Надежда для 4G
            // ВАЖНО: Пробуем и UDP и TCP
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
        ],
        iceTransportPolicy: 'all', // Разрешить всё
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle'
    };

    peer = new Peer(uid, {
        debug: 1,
        config: iceConfig,
        // Оставляем сервер PeerJS по умолчанию, он надежнее всего
    }); 
    
    peer.on('open', (id) => console.log('✅ ID OK:', id));
    peer.on('error', (err) => {
        console.error("🚨 PEER ERR:", err.type);
        if (err.type === 'disconnected') peer.reconnect();
    });

    // Обработка ВХОДЯЩЕГО звонка (P2P часть)
    peer.on('call', (call) => {
        console.log("📞 SIGNAL RECEIVED");
        
        // Автоответчик с задержкой (чтобы UI успел отработать)
        setTimeout(() => {
             navigator.mediaDevices.getUserMedia({ 
                 audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
             }).then(stream => {
                 localStream = stream;
                 call.answer(stream); // Отправляем свой поток
                 
                 call.on('stream', (remoteStream) => {
                    console.log("✅ VOICE CONNECTED");
                    setupRemoteAudio(remoteStream);
                    startCallTimer();
                    // Чистим UI
                    document.getElementById('incoming-call-modal').classList.remove('active');
                    if(!document.getElementById('active-call-screen').classList.contains('active')) {
                         showActiveCallScreen("Собеседник", "В РАЗГОВОРЕ");
                    } else {
                         document.getElementById('call-status-text').innerText = "В РАЗГОВОРЕ";
                         document.getElementById('call-status-text').style.color = "#33ff33";
                    }
                });
             }).catch(e => console.error("Mic Err:", e));
             
             call.on('close', () => endCallLocal());
             currentCall = call;
        }, 500);
    });
}

// Слушаем базу (Сигнализация)
function listenForIncomingCalls(myUid) {
    const q = query(collection(db, "calls"), where("receiverId", "==", myUid), where("status", "==", "offering"));
    onSnapshot(q, (snap) => {
        snap.docChanges().forEach((change) => {
            if (change.type === "added") {
                const data = change.doc.data();
                if ((Date.now() - data.timestamp.toMillis()) > 45000) return; // Игнор старых
                showIncomingCallModal(change.doc.id, data);
            }
        });
    });
}

function showIncomingCallModal(docId, data) {
    if (currentCall || activeCallDocId) return; 
    incomingCallData = { id: docId, ...data };
    activeCallDocId = docId;
    document.getElementById('incoming-call-modal').classList.add('active');
    document.getElementById('incoming-caller-name').innerText = data.callerName;
    document.getElementById('incoming-call-avatar').src = data.callerAvatar || DEFAULT_AVATAR;
}

// ИСХОДЯЩИЙ ЗВОНОК
if (btnCall) {
    btnCall.addEventListener('click', async () => {
        if (!currentChatId) return;
        const chatDoc = await getDoc(doc(db, "chats", currentChatId));
        const receiverId = chatDoc.data().participants.find(id => id !== auth.currentUser.uid);
        startVoiceCall(receiverId);
    });
}

async function startVoiceCall(receiverId) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
    } catch(e) { return alert("MIC ERROR"); }

    showActiveCallScreen(currentUserData.nickname, "ВЫЗОВ..."); 
    
    // 1. Создаем сигнал в базе
    const callDocRef = await addDoc(collection(db, "calls"), {
        callerId: auth.currentUser.uid, callerName: currentUserData.nickname, callerAvatar: currentUserData.avatarBase64,
        receiverId: receiverId, chatId: currentChatId, status: "offering", timestamp: serverTimestamp()
    });
    activeCallDocId = callDocRef.id;

    // 2. Ждем ответа в базе
    const unsub = onSnapshot(doc(db, "calls", activeCallDocId), async (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        
        if (data.status === "answered") {
            document.getElementById('call-status-text').innerText = "СОЕДИНЕНИЕ...";
            // 3. Как только ответили в базе - звоним по WebRTC
            if (!currentCall) {
                console.log("📞 Dialing Peer:", receiverId);
                setTimeout(() => initiatePeerConnection(receiverId), 1000); 
            }
        } 
        else if (data.status === "rejected") {
            document.getElementById('call-status-text').innerText = "ЗАНЯТО";
            setTimeout(endCallLocal, 1000); unsub();
        }
        else if (data.status === "ended") {
             document.getElementById('call-status-text').innerText = "ЗАВЕРШЕН";
             setTimeout(endCallLocal, 1000); unsub();
        }
    });
}

function initiatePeerConnection(targetPeerId) {
    if (!peer || peer.destroyed) return alert("ОШИБКА СЕТИ (Peer Dead)");
    
    const call = peer.call(targetPeerId, localStream);
    
    // Если call == null, значит PeerJS не смог найти маршрут сразу
    if (!call) {
        document.getElementById('call-status-text').innerText = "RETRYING...";
        setTimeout(() => initiatePeerConnection(targetPeerId), 2000);
        return;
    }

    call.on('stream', (remoteStream) => {
        console.log("✅ Outgoing Connected!");
        setupRemoteAudio(remoteStream);
        startCallTimer();
        document.getElementById('call-status-text').innerText = "В РАЗГОВОРЕ";
        document.getElementById('call-status-text').style.color = "#33ff33";
    });
    call.on('close', () => endCallLocal());
    call.on('error', (e) => {
        console.error("Call Err:", e);
        document.getElementById('call-status-text').innerText = "СБОЙ СВЯЗИ";
    });
    currentCall = call;
}

// ОТВЕТ НА ЗВОНОК
document.getElementById('btn-answer-call').addEventListener('click', async () => {
    document.getElementById('incoming-call-modal').classList.remove('active');
    
    // Разблокировка аудио для iOS/Android
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    try {
        showActiveCallScreen(incomingCallData.callerName, "ПОДКЛЮЧЕНИЕ...");
        // 1. Получаем микрофон
        // Примечание: Мы НЕ вызываем peer.answer здесь, это сделает автоматический слушатель 'call' выше
        // Мы просто обновляем статус в базе, чтобы звонящий начал процедуру соединения
        
        // Но нам нужен стрим заранее
        if(!localStream) {
             localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
        }
        
        // 2. Сигнализируем звонящему "Я готов"
        await updateDoc(doc(db, "calls", activeCallDocId), { status: "answered" });

        // Слушаем конец
        const unsub = onSnapshot(doc(db, "calls", activeCallDocId), (snap) => {
            if (snap.exists() && snap.data().status === "ended") { unsub(); endCallLocal(); }
        });

    } catch(e) { alert("MIC ERROR"); rejectCall(); }
});

document.getElementById('btn-decline-call').addEventListener('click', rejectCall);
async function rejectCall() {
    document.getElementById('incoming-call-modal').classList.remove('active');
    if (activeCallDocId) {
        await updateDoc(doc(db, "calls", activeCallDocId), { status: "rejected" });
        activeCallDocId = null;
        incomingCallData = null;
    }
}

document.getElementById('btn-hangup').addEventListener('click', async () => {
    if (activeCallDocId) {
        if (callSeconds > 0) logCallToChat(`📞 ЗВОНОК ЗАВЕРШЕН (${formatTime(callSeconds)})`);
        await updateDoc(doc(db, "calls", activeCallDocId), { status: "ended" });
    }
    endCallLocal();
});

function endCallLocal() {
    document.getElementById('active-call-screen').classList.remove('active');
    document.getElementById('incoming-call-modal').classList.remove('active');
    if (currentCall) { currentCall.close(); currentCall = null; }
    if (localStream) { localStream.getTracks().forEach(track => track.stop()); localStream = null; }
    const r = document.getElementById('remote-audio'); if(r) r.srcObject = null;
    stopCallTimer(); activeCallDocId = null; incomingCallData = null;
}

function setupRemoteAudio(stream) {
    const audioEl = document.getElementById('remote-audio');
    audioEl.srcObject = stream;
    audioEl.playsInline = true; audioEl.autoplay = true;
    audioEl.play().catch(e => {
        // Кнопка спасения если браузер заблочил звук
        const btn = document.createElement('button');
        btn.innerText = "🔊 ВКЛЮЧИТЬ ЗВУК";
        btn.style.position = "fixed"; btn.style.zIndex="9999"; btn.style.top="50%"; btn.style.left="50%"; btn.style.transform="translate(-50%,-50%)"; btn.style.padding="20px"; btn.style.background="red"; btn.style.color="white";
        btn.onclick = () => { audioEl.play(); btn.remove(); };
        document.body.appendChild(btn);
    });
}

document.getElementById('btn-mic-toggle').addEventListener('click', () => {
    if (!localStream) return;
    const t = localStream.getAudioTracks()[0];
    if (t) { isMicMuted = !isMicMuted; t.enabled = !isMicMuted; updateMicIcon(); }
});

function updateMicIcon() {
    const btn = document.getElementById('btn-mic-toggle');
    btn.classList.toggle('muted', isMicMuted);
}

function showActiveCallScreen(name, status) {
    document.getElementById('active-call-screen').classList.add('active');
    document.getElementById('call-partner-name').innerText = name;
    document.getElementById('call-status-text').innerText = status;
    callSeconds = 0; document.getElementById('call-timer').innerText = "00:00";
}

function startCallTimer() {
    stopCallTimer();
    callTimerInterval = setInterval(() => {
        callSeconds++;
        document.getElementById('call-timer').innerText = formatTime(callSeconds);
    }, 1000);
}
function stopCallTimer() { if (callTimerInterval) clearInterval(callTimerInterval); callTimerInterval = null; }
function formatTime(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

async function logCallToChat(text) {
    if (!currentChatId) return;
    try {
        await addDoc(collection(db, "chats", currentChatId, "messages"), {
            text, senderId: auth.currentUser.uid, senderNick: currentUserData.nickname,
            senderAvatar: currentUserData.avatarBase64, createdAt: serverTimestamp(), type: 'system'
        });
        await updateDoc(doc(db, "chats", currentChatId), { lastUpdated: serverTimestamp() });
    } catch(e) {}
}
