// js/voice.js — WebRTC proximity voice chat
// Server relays: voice_offer, voice_answer, voice_ice
'use strict';

const Voice = {
  enabled:false, muted:false,
  localStream:null, peers:{}, socket:null,

  init(socket) {
    this.socket=socket;

    // ── server → client (relay) ──
    socket.on('voice_offer',  async({fromId,offer})     =>{ if(!this.enabled)return; await this._handleOffer(fromId,offer); });
    socket.on('voice_answer', async({fromId,answer})    =>{ const p=this.peers[fromId]; if(p?.pc)await p.pc.setRemoteDescription(answer); });
    socket.on('voice_ice',    async({fromId,candidate}) =>{ const p=this.peers[fromId]; if(p?.pc)await p.pc.addIceCandidate(candidate).catch(()=>{}); });

    socket.on('player_joined',({id})=>{ if(this.enabled)this._callPeer(id); });
    socket.on('player_left',  ({id})=>{ this._closePeer(id); });
  },

  async enable() {
    try {
      this.localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      this.enabled=true;
      this.muted=false;
      document.getElementById('mic-btn').textContent='MIC ON';
      document.getElementById('mic-btn').classList.add('active');
      // Call all existing remote players
      Object.keys(Game.remote).forEach(id=>this._callPeer(id));
    } catch(e) {
      document.getElementById('mic-btn').textContent='MIC ERR';
      document.getElementById('voice-status').textContent='mic blocked';
    }
  },

  toggleMic() {
    if (!this.enabled) { this.enable(); return; }
    this.muted=!this.muted;
    if (this.localStream) this.localStream.getAudioTracks().forEach(t=>{t.enabled=!this.muted;});
    const btn=document.getElementById('mic-btn');
    if (btn) btn.textContent=this.muted?'MIC MUTED':'MIC ON';
    btn.className=this.muted?'muted':'active';
  },

  toggleMutePeer(peerId, btn) {
    const peer=this.peers[peerId];
    if (!peer) return;
    peer.muted=!peer.muted;
    if (peer.audioEl) peer.audioEl.muted=peer.muted;
    if (btn) { btn.textContent=peer.muted?'UNMUTE':'MUTE'; btn.classList.toggle('muted',peer.muted); }
  },

  async _callPeer(peerId) {
    if (!this.enabled||!this.localStream||this.peers[peerId]) return;
    const pc=this._createPC(peerId);
    this.localStream.getTracks().forEach(t=>pc.addTrack(t,this.localStream));
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.socket.emit('voice_offer',{toId:peerId,offer});
  },

  async _handleOffer(fromId, offer) {
    if (!this.localStream) return;
    const pc=this._createPC(fromId);
    this.localStream.getTracks().forEach(t=>pc.addTrack(t,this.localStream));
    await pc.setRemoteDescription(offer);
    const answer=await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.socket.emit('voice_answer',{toId:fromId,answer});
  },

  _createPC(peerId) {
    const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    this.peers[peerId]={pc,audioEl:null,muted:false};
    pc.onicecandidate=e=>{ if(e.candidate)this.socket.emit('voice_ice',{toId:peerId,candidate:e.candidate}); };
    pc.ontrack=e=>{
      const el=new Audio();
      el.srcObject=e.streams[0];
      el.play().catch(()=>{});
      this.peers[peerId].audioEl=el;
    };
    pc.onconnectionstatechange=()=>{ if(pc.connectionState==='failed'||pc.connectionState==='closed')this._closePeer(peerId); };
    return pc;
  },

  _closePeer(peerId) {
    const p=this.peers[peerId];
    if (!p) return;
    if (p.pc) p.pc.close();
    if (p.audioEl) { p.audioEl.pause(); p.audioEl.srcObject=null; }
    delete this.peers[peerId];
  },
};

function toggleMic() { Voice.toggleMic(); }
