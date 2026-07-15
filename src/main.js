import * as THREE from 'three'
import { createScene, buildCabin, buildSeatbeltSigns } from './scene.js'
import { createPhysics } from './physics.js'
import { Player } from './player.js'
import { Grabber } from './grab.js'
import { spawnProps } from './props.js'
import { Game } from './game.js'
import { ExitDoor } from './door.js'
import { AudioEngine } from './audio.js'

const app = document.getElementById('app')
const overlay = document.getElementById('overlay')
const hud = document.getElementById('hud')
const crosshair = document.getElementById('crosshair')
const hint = document.getElementById('hint')

const { renderer, scene, camera } = createScene(app)
const physics = await createPhysics()

buildCabin(scene, physics)
const props = spawnProps(scene, physics)
const player = new Player(physics, camera)
const grabber = new Grabber(camera, props.grabbables)
const game = new Game(scene, physics, props, grabber, {
  satfill: document.getElementById('satfill'),
  timerchip: document.getElementById('timerchip'),
  endOverlay: document.getElementById('endOverlay'),
  endStars: document.getElementById('endStars'),
  endVerdict: document.getElementById('endVerdict'),
  statServed: document.getElementById('statServed'),
  statMissed: document.getElementById('statMissed'),
  statSat: document.getElementById('statSat'),
  endSub: document.getElementById('endSub'),
})
const audio = new AudioEngine()
game.audio = audio
document.getElementById('endCard').addEventListener('click', () => location.reload())
game.signs = buildSeatbeltSigns(scene)
const door = new ExitDoor(scene)
game.door = door

const doorRay = new THREE.Raycaster()
doorRay.far = 2.6
function aimingAtDoor() {
  doorRay.setFromCamera({ x: 0, y: 0 }, camera)
  return doorRay.intersectObject(door.group, true).length > 0
}

// ---------- pointer lock / overlay ----------
// dev flag: open with #peek (or #peek=x,z,yaw,pitch) to hide the overlay for screenshots
const peekMode = location.hash.startsWith('#peek')
if (peekMode) {
  overlay.classList.add('hidden')
  hud.classList.add('visible')
  crosshair.classList.add('visible')
  const params = location.hash.split('=')[1]
  if (params) {
    const [x = 0, z = 6.3, yaw = 0, pitch = 0] = params.split(',').map(Number)
    player.body.setTranslation({ x, y: 0.9, z }, true)
    player.yaw = yaw
    player.pitch = pitch
  }
  // flight-dependent test flags skip the boarding phase
  if (/rush|hit|warn|deliver|fast|land|belt|jolt/.test(location.hash)) game.takeoff(true)
  if (location.hash.includes('jolt')) setTimeout(() => physics.jolt(1), 3000)
  if (location.hash.includes('fast')) game.duration = 0.6 // near-instant landing, for testing
  if (location.hash.includes('land')) setTimeout(() => game.land(), 1000)
  if (location.hash.includes('door'))
    setTimeout(() => {
      door.toggle()
      const target = props.passengers.find((pp) => pp.userData.unruly)
      target?.userData.body.setTranslation({ x: -1.9, y: 1.2, z: 6.6 }, true)
    }, 700)
  if (location.hash.includes('belt'))
    setTimeout(() => {
      props.passengers.forEach((p, i) => i % 2 === 0 && props.buckle(p))
      setTimeout(() => physics.jolt(0.55), 900)
    }, 600)
  if (location.hash.includes('warn')) {
    game.turb.state = 'warning'
    game.turb.stateUntil = 4
    game.turb.intensity = 1
  }
  if (location.hash.includes('hit')) {
    game.turb.state = 'active'
    game.turb.stateUntil = 9
    game.turb.intensity = 1.3
    game.turb.nextJolt = 0.2
    game.signs?.setOn(true)
  }
  if (location.hash.includes('deliver'))
    setTimeout(() => {
      const r = game.requests.find((x) => x.state === 'pending')
      const item = props.grabbables.find((g) => g.userData.kind === r?.kind)
      if (!r || !item) return
      const p = r.passenger.userData.body.translation()
      item.userData.body.setTranslation({ x: p.x, y: p.y + 0.4, z: p.z - 0.3 }, true)
    }, 1200)
  if (location.hash.includes('rush'))
    setTimeout(() => {
      for (let i = 0; i < 3; i++) game.trySpawnRequest()
    }, 400)
}
overlay.addEventListener('click', () => {
  audio.ensure() // WebAudio needs a user gesture
  renderer.domElement.requestPointerLock()
})
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement
  overlay.classList.toggle('hidden', locked)
  hud.classList.toggle('visible', locked)
  crosshair.classList.toggle('visible', locked)
  if (audio.ctx && !game.ended) locked ? audio.ctx.resume() : audio.ctx.suspend()
})
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === renderer.domElement) player.onMouseMove(e)
})

// ---------- turbulence test (phase-4 preview) ----------
let shake = 0
let hintTimer = 0
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' && document.pointerLockElement) {
    const root = grabber.hovered
    if (root && props.canBuckle(root) && props.buckle(root)) {
      audio.click()
      hint.textContent = '🔗 Seatbelt fastened!'
      hint.classList.remove('flash')
      hint.dataset.state = 'manual'
      hintTimer = 1.2
    } else if (aimingAtDoor()) {
      door.toggle()
      audio.click()
      hint.textContent = door.open ? '🚪 DOOR OPEN — mind the suction!' : '🚪 Door closed. Phew.'
      hint.classList.remove('flash')
      hint.dataset.state = 'manual'
      hintTimer = 1.4
    }
  }
  if (e.code === 'KeyM') {
    const muted = audio.toggleMute()
    hint.textContent = muted ? '🔇 Sound muted' : '🔊 Sound on'
    hint.classList.remove('flash')
    hint.dataset.state = 'manual'
    hintTimer = 1.2
  }
  if (e.code === 'KeyT' && document.pointerLockElement) {
    physics.jolt(1)
    audio.thud(1)
    shake = 1
    hint.textContent = '✈ TURBULENCE — hold on to something!'
    hint.classList.add('flash')
    hint.dataset.state = 'manual'
    hintTimer = 2.5
  }
})
const defaultHint = hint.innerHTML

// ---------- loop ----------
const STEP = 1 / 60
const clock = new THREE.Clock()
let accumulator = 0

function frame() {
  requestAnimationFrame(frame)
  const dt = Math.min(clock.getDelta(), 0.05)
  const time = clock.elapsedTime

  accumulator += dt
  while (accumulator >= STEP) {
    player.fixedUpdate(STEP)
    grabber.fixedUpdate()
    props.fixedUpdate(STEP, grabber.held?.root ?? null)
    physics.world.step()
    accumulator -= STEP
  }

  physics.sync()
  props.update(time)

  // the flight only progresses while you're actually in the cabin
  if (document.pointerLockElement === renderer.domElement || peekMode) game.update(dt, time)

  door.update(dt)
  audio.setWind(door.anim)
  audio.setRumble(Math.min(1, Math.max(shake, game.shake)))
  shake = Math.max(0, shake - dt / 1.4)
  player.updateCamera(dt, time, Math.max(shake, game.shake))

  const state = grabber.updateHover()
  const doorAim = state !== 'holding' && aimingAtDoor()
  crosshair.classList.toggle('hover', state === 'hover' || doorAim)
  crosshair.classList.toggle('holding', state === 'holding')

  // hint bar priority: turbulence notice > manual flash > context > default
  if (hintTimer > 0) hintTimer -= dt
  const buckleTarget = state === 'hover' && grabber.hovered && props.canBuckle(grabber.hovered)
  const doorTarget = !buckleTarget && doorAim
  if (game.notice) {
    if (hint.textContent !== game.notice.text) hint.textContent = game.notice.text
    hint.classList.add('flash')
    hint.dataset.state = 'notice'
  } else if (hintTimer > 0) {
    // manual flash already on screen
  } else if (buckleTarget || doorTarget) {
    const txt = buckleTarget ? '🔗 E — fasten seatbelt' : door.open ? '🚪 E — close the door' : '🚪 E — open the exit door'
    if (hint.textContent !== txt) {
      hint.textContent = txt
      hint.classList.remove('flash')
      hint.dataset.state = 'ctx'
    }
  } else if (hint.dataset.state !== 'default') {
    hint.innerHTML = defaultHint
    hint.classList.remove('flash')
    hint.dataset.state = 'default'
  }

  renderer.render(scene, camera)
}
frame()
