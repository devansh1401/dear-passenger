// All sound is synthesized with WebAudio — no audio files.
// ensure() must be called from a user gesture (the boarding click).
export class AudioEngine {
  constructor() {
    this.ctx = null
    this.muted = false
  }

  ensure() {
    if (this.ctx) {
      this.ctx.resume()
      return
    }
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)())
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.5
    this.master.connect(ctx.destination)

    // shared pink-ish noise buffer (leaky integrator over white noise)
    const len = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      last = last * 0.97 + (Math.random() * 2 - 1) * 0.03
      d[i] = last * 3
    }
    this.noiseBuf = buf

    const loop = (filterType, freq, gain0) => {
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const f = ctx.createBiquadFilter()
      f.type = filterType
      f.frequency.value = freq
      const g = ctx.createGain()
      g.gain.value = gain0
      src.connect(f)
      f.connect(g)
      g.connect(this.master)
      src.start()
      return { f, g }
    }
    this.drone = loop('lowpass', 220, 0.14) // constant cabin hum
    this.wind = loop('bandpass', 900, 0) // open-door slipstream
    this.rumble = loop('lowpass', 90, 0) // turbulence rumble
  }

  setWind(v) {
    if (this.ctx) this.wind.g.gain.setTargetAtTime(v * 0.55, this.ctx.currentTime, 0.1)
  }

  setRumble(v) {
    if (this.ctx) this.rumble.g.gain.setTargetAtTime(v * 0.6, this.ctx.currentTime, 0.08)
  }

  tone(freq, dur = 0.3, type = 'sine', vol = 0.25, when = 0, glideTo = null) {
    if (!this.ctx) return
    const t = this.ctx.currentTime + when
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g)
    g.connect(this.master)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  ding() {
    // the classic cabin bing-bong
    this.tone(880, 0.5, 'sine', 0.18)
    this.tone(659, 0.7, 'sine', 0.18, 0.18)
  }

  serve() {
    this.tone(740, 0.12, 'sine', 0.2)
    this.tone(988, 0.28, 'sine', 0.2, 0.09)
  }

  expire() {
    this.tone(220, 0.4, 'sawtooth', 0.1, 0, 160)
  }

  click() {
    // seatbelt buckle
    this.tone(1400, 0.03, 'square', 0.14)
    this.tone(900, 0.05, 'square', 0.1, 0.05)
  }

  thud(v = 1) {
    this.tone(110, 0.25, 'sine', 0.35 * v, 0, 45)
  }

  whee() {
    // someone left the aircraft: whoosh + falling slide-whistle + distant pop
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime

    // air whoosh through the hatch
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 1.2
    f.frequency.setValueAtTime(500, t)
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.15)
    f.frequency.exponentialRampToValueAtTime(250, t + 0.7)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.001, t)
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.08)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8)
    src.connect(f)
    f.connect(g)
    g.connect(this.master)
    src.start(t)
    src.stop(t + 0.9)

    // cartoon slide-whistle with vibrato
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(1150, t)
    o.frequency.exponentialRampToValueAtTime(170, t + 1.7)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 7
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 30
    lfo.connect(lfoGain)
    lfoGain.connect(o.frequency)
    const og = ctx.createGain()
    og.gain.setValueAtTime(0, t)
    og.gain.linearRampToValueAtTime(0.22, t + 0.05)
    og.gain.exponentialRampToValueAtTime(0.001, t + 1.8)
    o.connect(og)
    og.connect(this.master)
    o.start(t)
    o.stop(t + 1.9)
    lfo.start(t)
    lfo.stop(t + 1.9)

    // faint far-away landing pop
    this.tone(90, 0.12, 'sine', 0.1, 1.6, 55)
  }

  fanfare(delay = 0) {
    // little victory jingle for a well-deserved ejection
    this.tone(523, 0.14, 'triangle', 0.18, delay)
    this.tone(659, 0.14, 'triangle', 0.18, delay + 0.12)
    this.tone(784, 0.32, 'triangle', 0.2, delay + 0.24)
  }

  chime() {
    this.tone(830, 0.5, 'sine', 0.16)
  }

  roar() {
    // takeoff: a 3.5s noise swell + engine saw sweep
    if (!this.ctx) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 320
    const g = ctx.createGain()
    const t = ctx.currentTime
    g.gain.setValueAtTime(0.001, t)
    g.gain.exponentialRampToValueAtTime(0.5, t + 1.2)
    g.gain.exponentialRampToValueAtTime(0.001, t + 3.5)
    src.connect(f)
    f.connect(g)
    g.connect(this.master)
    src.start(t)
    src.stop(t + 3.7)
    this.tone(70, 3.2, 'sawtooth', 0.1, 0, 130)
  }

  toggleMute() {
    this.muted = !this.muted
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5
    return this.muted
  }
}
