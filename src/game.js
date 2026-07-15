import * as THREE from 'three'

// Phase 3 — the flight loop: passengers raise requests, you deliver matching
// items, a shared satisfaction meter decides your star rating at landing.

// passengers only ever ask for these two things
const REQUESTS = [
  { kind: 'drink', emoji: '🥤' },
  { kind: 'meal', emoji: '🍗' },
]

const FLIGHT_SECONDS = 180
const MAX_PENDING = 3
const PATIENCE = 26 // seconds before a request sours
const DELIVER_RADIUS = 0.85

function bubbleTexture(emoji, bg, fg) {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')
  // bubble + tail
  g.fillStyle = bg
  g.beginPath()
  g.roundRect(8, 8, 112, 88, 30)
  g.fill()
  g.beginPath()
  g.moveTo(52, 92)
  g.lineTo(64, 122)
  g.lineTo(76, 92)
  g.fill()
  g.fillStyle = fg
  g.font = '56px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(emoji, 64, 54)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export class Game {
  constructor(scene, physics, props, grabber, hud) {
    this.scene = scene
    this.physics = physics
    this.props = props
    this.grabber = grabber
    this.hud = hud // { satfill, timerchip, endOverlay, endStars, endVerdict, statServed, statMissed, statSat }

    this.textures = {}
    for (const r of REQUESTS) this.textures[r.kind] = bubbleTexture(r.emoji, '#ffffff', '#000')
    this.textures.done = bubbleTexture('✓', '#7bc47f', '#ffffff')
    this.textures.angry = bubbleTexture('✗', '#e8635a', '#ffffff')
    this.textures.mad = bubbleTexture('😡', '#ffe3e0', '#000')

    this.satisfaction = 80
    this.phase = 'boarding' // buckle everyone in before takeoff
    this.boardingLeft = 40
    this.elapsed = 0
    this.duration = FLIGHT_SECONDS
    this.served = 0
    this.missed = 0
    this.requests = [] // { passenger, kind, sprite, age, state, fade }
    this.respawns = [] // { kind, t }
    this.nextRequestIn = 5
    this.stockCheckIn = 1
    this.ended = false

    // turbulence scheduler: idle -> warning (countdown) -> active -> idle,
    // with a mandatory "final descent" episode just before landing
    this.turb = { state: 'idle', nextAt: 18 + Math.random() * 8, stateUntil: 0, intensity: 0, isFinal: false, finalDone: false, nextJolt: 0 }
    this.signs = null // set by main once the cabin is built
    this.door = null // set by main
    this.shake = 0 // camera shake the game wants this frame
    this.notice = null // { text } shown in the hint bar while set
    this.turbNotice = null
    this.tempNotice = null // short-lived messages (ejections etc.)
    this.ejections = [] // meshes flying away outside the plane
    this.particles = [] // confetti pops at the door
    this.angryBubbles = new Map() // unruly passenger -> 😡 sprite
    this.audio = null // set by main
  }

  say(text, seconds = 2.4) {
    this.tempNotice = { text, t: seconds }
  }

  // fling something out of the plane: remove its body, animate the mesh away
  eject(root) {
    if (this.grabber.held?.root === root) this.grabber.release()
    this.physics.removeDynamic(root.userData.body)
    const gi = this.props.grabbables.indexOf(root)
    if (gi >= 0) this.props.grabbables.splice(gi, 1)

    if (root.userData.kind === 'passenger') {
      const pi = this.props.passengers.indexOf(root)
      if (pi >= 0) this.props.passengers.splice(pi, 1)
      // drop any pending request they had
      for (const r of this.requests) {
        if (r.passenger === root && r.state === 'pending') {
          this.scene.remove(r.sprite)
          r.dead = true
        }
      }
      const bubble = this.angryBubbles.get(root)
      if (bubble) {
        this.scene.remove(bubble)
        this.angryBubbles.delete(root)
      }
      if (root.userData.unruly) {
        this.satisfaction = Math.min(100, this.satisfaction + 15)
        this.say('😡→☁ Good riddance! The cabin applauds.')
      } else {
        this.satisfaction -= 20
        this.say('😱 That was a PAYING CUSTOMER!')
      }
      this.requests = this.requests.filter((r) => !r.dead)
    } else {
      this.respawns.push({ kind: root.userData.kind, t: 3 })
    }

    this.audio?.whee()
    if (root.userData.kind === 'passenger' && root.userData.unruly) this.audio?.fanfare(0.9)
    this.shake = Math.max(this.shake, 0.3)
    this.spawnBurst(this.door?.pos ?? root.position)
    // draw the departing mesh over the fuselage so the whole tumble is
    // visible "outside" against the doorway sky
    root.traverse((o) => {
      if (o.isMesh) {
        o.renderOrder = 6
        o.material.depthTest = false
      }
    })
    this.ejections.push({
      mesh: root,
      t: 0,
      // pop out of the hatch, then the slipstream drags them backward as they fall
      vel: new THREE.Vector3(-4.5 - Math.random() * 1.5, 1.6, 1.0 + Math.random()),
      spin: new THREE.Vector3(Math.random() * 5 - 2.5, Math.random() * 5 - 2.5, Math.random() * 5 - 2.5),
    })
  }

  // a quick confetti pop inside the cabin at the doorway
  spawnBurst(pos) {
    const colors = [0xff7a30, 0xf4ead9, 0x5b7fd4, 0x7bc47f]
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ color: colors[i % colors.length], transparent: true }))
      m.scale.setScalar(0.05 + Math.random() * 0.05)
      m.position.set(pos.x + 0.25, pos.y + 0.2, pos.z)
      this.scene.add(m)
      this.particles.push({
        m,
        t: 0,
        vel: new THREE.Vector3(0.5 + Math.random() * 2, Math.random() * 2.6, (Math.random() - 0.5) * 2.6),
      })
    }
  }

  updateDoor(dt) {
    const door = this.door
    // suction only once the hatch has actually slid up
    if (door?.open && door.anim > 0.6 && !this.ended) {
      this.satisfaction -= 0.5 * dt // cabin pressure is a suggestion
      this.shake = Math.max(this.shake, 0.12)
      const c = door.pos
      for (const item of [...this.props.grabbables]) {
        const body = item.userData.body
        const t = body.translation()
        const dx = c.x - t.x
        const dy = c.y - t.y
        const dz = c.z - t.z
        const dist = Math.hypot(dx, dy, dz)
        if (dist < 0.78) {
          this.eject(item)
          continue
        }
        if (dist < 3.0) {
          const m = body.mass()
          const pull = (10 / Math.max(dist, 0.6)) * m * dt
          body.applyImpulse({ x: (dx / dist) * pull, y: (dy / dist) * pull, z: (dz / dist) * pull }, true)
        }
      }
    }
    // fling ejected things off into the sky: out, then backward and down,
    // tumbling — kept slow enough to watch through the doorway
    for (const e of this.ejections) {
      e.t += dt
      e.vel.y -= 4 * dt // gravity
      e.vel.z += 3.5 * dt // slipstream drags them toward the tail
      e.vel.x -= 0.6 * dt
      e.mesh.position.addScaledVector(e.vel, dt)
      e.mesh.rotation.x += e.spin.x * dt
      e.mesh.rotation.y += e.spin.y * dt
      e.mesh.rotation.z += e.spin.z * dt
      const s = Math.max(0.03, 1 - e.t * 0.28)
      e.mesh.scale.setScalar(s)
      if (e.t > 3.2) {
        this.scene.remove(e.mesh)
        e.dead = true
      }
    }
    this.ejections = this.ejections.filter((e) => !e.dead)

    // confetti pop
    for (const c of this.particles) {
      c.t += dt
      c.vel.y -= 4.5 * dt
      c.m.position.addScaledVector(c.vel, dt)
      c.m.material.opacity = Math.max(0, 1 - c.t / 0.9)
      if (c.t > 0.9) {
        this.scene.remove(c.m)
        c.m.material.dispose()
        c.dead = true
      }
    }
    this.particles = this.particles.filter((c) => !c.dead)
  }

  takeoff(silent = false) {
    if (this.phase !== 'boarding') return
    this.phase = 'flight'
    this.signs?.setOn(false)
    if (silent) return
    this.physics.jolt(0.35)
    this.shake = Math.max(this.shake, 0.5)
    this.audio?.roar()
    const unbuckled = this.props.passengers.filter((p) => !p.userData.buckled).length
    if (unbuckled === 0) {
      this.satisfaction = Math.min(100, this.satisfaction + 5)
      this.say('🛫 TAKEOFF — cabin fully secured, nice work!', 3)
    } else {
      this.satisfaction -= unbuckled * 2
      this.say(`🛫 TAKEOFF — ${unbuckled} passenger${unbuckled > 1 ? 's' : ''} not buckled in!`, 3)
    }
  }

  updateTurbulence(dt) {
    const T = this.turb
    const progress = this.elapsed / this.duration
    const remaining = this.duration - this.elapsed
    switch (T.state) {
      case 'idle':
        this.turbNotice = null
        this.shake = Math.max(0, this.shake - dt)
        if (!T.finalDone && remaining <= 14) {
          this.audio?.ding()
          T.state = 'warning'
          T.stateUntil = this.elapsed + 4
          T.intensity = 1.6
          T.isFinal = true
        } else if (this.elapsed >= T.nextAt - 5 && remaining > 22) {
          this.audio?.ding()
          T.state = 'warning'
          T.stateUntil = this.elapsed + 5
          T.intensity = 0.6 + progress // escalates over the flight
          T.isFinal = false
        }
        break
      case 'warning': {
        this.signs?.setOn(true)
        const left = Math.max(0, T.stateUntil - this.elapsed)
        this.turbNotice = {
          text: T.isFinal
            ? `🛬 FINAL DESCENT in ${Math.ceil(left)}s — BRACE!`
            : `⚠ Turbulence in ${Math.ceil(left)}s — buckle everyone up!`,
        }
        if (left <= 0) {
          T.state = 'active'
          T.stateUntil = T.isFinal
            ? Math.max(this.elapsed + 2, this.duration - 1.5) // shake until just before touchdown
            : this.elapsed + 2.5 + progress * 1.8
          T.nextJolt = 0
          this.physics.jolt(0.7 * T.intensity)
          this.audio?.thud(1)
        }
        break
      }
      case 'active': {
        this.turbNotice = { text: T.isFinal ? '🛬 FINAL DESCENT — HOLD ON!' : '✈ TURBULENCE — hold on to something!' }
        this.shake = Math.min(1.2, 0.35 * T.intensity + (T.isFinal ? 0.35 : 0))
        T.nextJolt -= dt
        if (T.nextJolt <= 0) {
          this.physics.jolt((T.isFinal ? 0.55 : 0.4) * T.intensity)
          this.audio?.thud(0.35)
          T.nextJolt = 0.55
        }
        if (this.elapsed >= T.stateUntil) {
          T.state = 'idle'
          if (T.isFinal) T.finalDone = true
          T.nextAt = this.elapsed + 20 - 9 * progress + Math.random() * 12
          this.turbNotice = null
          this.signs?.setOn(false)
        }
        break
      }
    }
  }

  makeSprite(kind) {
    const mat = new THREE.SpriteMaterial({ map: this.textures[kind], transparent: true, depthTest: false })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(0.5, 0.5, 1)
    sprite.renderOrder = 10
    this.scene.add(sprite)
    return sprite
  }

  trySpawnRequest() {
    const pending = this.requests.filter((r) => r.state === 'pending')
    if (pending.length >= MAX_PENDING) return
    const busy = new Set(pending.map((r) => r.passenger))
    const candidates = this.props.passengers.filter(
      (p) => !busy.has(p) && !p.userData.unruly && (p.userData.requestCooldown ?? 0) <= this.elapsed,
    )
    if (!candidates.length) return
    const passenger = candidates[Math.floor(Math.random() * candidates.length)]
    const { kind } = REQUESTS[Math.floor(Math.random() * REQUESTS.length)]
    // guarantee the asked-for item exists in the cabin: keep at least one
    // free item of this kind per pending request, topping up from the galley
    const demand = pending.filter((r) => r.kind === kind).length + 1
    const stock = this.props.grabbables.filter((g) => g.userData.kind === kind).length
    if (stock < demand) this.props.spawnItem(kind)
    this.requests.push({ passenger, kind, sprite: this.makeSprite(kind), age: 0, state: 'pending', fade: 0 })
    this.audio?.ding()
  }

  resolve(request, state) {
    if (state === 'served') this.audio?.serve()
    else this.audio?.expire()
    request.state = state
    request.fade = state === 'served' ? 1.0 : 1.4
    request.sprite.material.map = this.textures[state === 'served' ? 'done' : 'angry']
    request.passenger.userData.requestCooldown = this.elapsed + 9
  }

  consume(item) {
    if (this.grabber.held?.root === item) this.grabber.release()
    this.physics.removeDynamic(item.userData.body)
    this.scene.remove(item)
    const i = this.props.grabbables.indexOf(item)
    if (i >= 0) this.props.grabbables.splice(i, 1)
    this.respawns.push({ kind: item.userData.kind, t: 2.5 })
  }

  checkDeliveries() {
    for (const r of this.requests) {
      if (r.state !== 'pending') continue
      const pp = r.passenger.userData.body.translation()
      for (const item of this.props.grabbables) {
        if (item.userData.kind !== r.kind) continue
        const ip = item.userData.body.translation()
        const d = Math.hypot(ip.x - pp.x, ip.y - pp.y, ip.z - pp.z)
        if (d < DELIVER_RADIUS) {
          this.consume(item)
          this.resolve(r, 'served')
          this.served++
          this.satisfaction = Math.min(100, this.satisfaction + 8)
          break
        }
      }
    }
  }

  updateHud() {
    const remaining = Math.max(0, this.duration - this.elapsed)
    const m = Math.floor(remaining / 60)
    const s = Math.floor(remaining % 60)
    this.hud.timerchip.textContent = `🛬 ${m}:${String(s).padStart(2, '0')}`
    const sat = this.satisfaction
    this.hud.satfill.style.width = `${sat}%`
    this.hud.satfill.style.background = sat > 60 ? '#7bc47f' : sat > 30 ? '#f2b63c' : '#e8635a'
  }

  land() {
    this.ended = true
    this.notice = null
    this.turbNotice = null
    this.tempNotice = null
    this.shake = 0
    this.signs?.setOn(false)
    const sat = Math.round(this.satisfaction)
    const stars = sat >= 90 ? 5 : sat >= 72 ? 4 : sat >= 52 ? 3 : sat >= 32 ? 2 : 1
    this.hud.endStars.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars)
    this.hud.endVerdict.textContent = stars >= 4 ? 'HERO' : stars >= 3 ? 'LANDED' : stars >= 2 ? 'SHAKEN' : 'CHAOS'
    this.hud.statServed.textContent = this.served
    this.hud.statMissed.textContent = this.missed
    this.hud.statSat.textContent = `${sat}%`
    this.audio?.chime()
    // remember the best run on this machine
    const best = Math.max(sat, Number(localStorage.getItem('turbulence-best') ?? 0))
    localStorage.setItem('turbulence-best', best)
    if (this.hud.endSub) this.hud.endSub.textContent = `FLIGHT TB-042 COMPLETE · PERSONAL BEST ${best}%`
    document.exitPointerLock?.()
    this.hud.endOverlay.classList.remove('hidden')
  }

  update(dt, time) {
    if (this.ended) return
    if (this.tempNotice && (this.tempNotice.t -= dt) <= 0) this.tempNotice = null

    // unruly 😡 markers float in every phase so you know who to deal with
    for (const p of this.props.passengers) {
      if (!p.userData.unruly) continue
      let bubble = this.angryBubbles.get(p)
      if (!bubble) {
        bubble = this.makeSprite('mad')
        bubble.scale.set(0.42, 0.42, 1)
        this.angryBubbles.set(p, bubble)
      }
      const bt = p.userData.body.translation()
      bubble.position.set(bt.x, bt.y + 1.0 + Math.sin(time * 4 + bt.x * 3) * 0.03, bt.z)
    }

    // pre-flight boarding: fasten all seatbelts before the clock starts
    if (this.phase === 'boarding') {
      this.updateDoor(dt)
      this.boardingLeft -= dt
      const total = this.props.passengers.length
      const buckled = this.props.passengers.filter((p) => p.userData.buckled).length
      if (buckled >= total || this.boardingLeft <= 0) {
        this.takeoff()
      } else {
        this.signs?.setOn(true)
        this.notice =
          this.tempNotice ??
          { text: `🔗 PRE-FLIGHT — fasten seatbelts! ${buckled}/${total} · takeoff in ${Math.ceil(this.boardingLeft)}s` }
      }
      const bs = Math.max(0, Math.ceil(this.boardingLeft))
      this.hud.timerchip.textContent = `🛫 ${Math.floor(bs / 60)}:${String(bs % 60).padStart(2, '0')}`
      const sat = this.satisfaction
      this.hud.satfill.style.width = `${sat}%`
      this.hud.satfill.style.background = sat > 60 ? '#7bc47f' : sat > 30 ? '#f2b63c' : '#e8635a'
      return
    }

    this.elapsed += dt
    const progress = this.elapsed / this.duration

    // new requests come faster as the flight goes on
    this.nextRequestIn -= dt
    if (this.nextRequestIn <= 0) {
      this.trySpawnRequest()
      this.nextRequestIn = (7 + Math.random() * 6) * (1 - 0.45 * progress)
    }

    // request lifecycle + bubble tracking
    for (const r of this.requests) {
      const p = r.passenger.userData.body.translation()
      r.sprite.position.set(p.x, p.y + 1.05 + Math.sin(time * 3 + p.x * 7) * 0.03, p.z)
      if (r.state === 'pending') {
        r.age += dt
        this.satisfaction -= 0.55 * dt // waiting hurts
        if (r.age > PATIENCE) {
          this.resolve(r, 'expired')
          this.missed++
          this.satisfaction -= 10
        }
      } else {
        r.fade -= dt
        r.sprite.material.opacity = Math.min(1, r.fade * 2)
        if (r.fade <= 0) {
          this.scene.remove(r.sprite)
          r.sprite.material.dispose()
          r.dead = true
        }
      }
    }
    this.requests = this.requests.filter((r) => !r.dead)

    // passengers knocked out of their seats drain the meter until re-seated;
    // unruly ones drain a flat rate just by being on board
    for (const p of this.props.passengers) {
      if (p.userData.unruly) {
        this.satisfaction -= 0.22 * dt
        continue
      }
      const home = p.userData.home
      const t = p.userData.body.translation()
      if (Math.hypot(t.x - home.x, t.z - home.z) > 0.85 || t.y < 0.45) {
        this.satisfaction -= 0.3 * dt
      }
    }

    this.checkDeliveries()
    this.updateTurbulence(dt)
    this.updateDoor(dt)

    // hint-bar notice priority: turbulence > recent event > door standing warning
    this.notice =
      this.turbNotice ??
      this.tempNotice ??
      (this.door?.open ? { text: '🚪 CABIN DOOR OPEN — mind the suction!' } : null)

    // hard invariant: every pending request has a matching free item somewhere
    // in the cabin (counting replacements already queued at the galley)
    this.stockCheckIn -= dt
    if (this.stockCheckIn <= 0) {
      this.stockCheckIn = 1
      const need = {}
      for (const r of this.requests) if (r.state === 'pending') need[r.kind] = (need[r.kind] || 0) + 1
      const queued = {}
      for (const r of this.respawns) queued[r.kind] = (queued[r.kind] || 0) + 1
      for (const kind of Object.keys(need)) {
        const stock = this.props.grabbables.filter((g) => g.userData.kind === kind).length + (queued[kind] || 0)
        for (let i = stock; i < need[kind]; i++) this.props.spawnItem(kind)
      }
    }

    // galley restock
    for (const r of this.respawns) {
      r.t -= dt
      if (r.t <= 0) this.props.spawnItem(r.kind)
    }
    this.respawns = this.respawns.filter((r) => r.t > 0)

    this.satisfaction = THREE.MathUtils.clamp(this.satisfaction, 0, 100)
    this.updateHud()

    if (this.elapsed >= this.duration) this.land()
  }
}
