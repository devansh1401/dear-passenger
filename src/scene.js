import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

// ---------- palette ----------
export const PALETTE = {
  cream: 0xf4ead9,
  creamDark: 0xe7d9c2,
  ink: 0x2b2b33,
  seatBlue: 0x5b7fd4,
  seatBlueDark: 0x4a6cbd,
  carpet: 0x4a5aa0,
  aisle: 0x5d6fb8,
  orange: 0xff7a30,
  steel: 0xc3cbd9,
}

// Cabin interior (trailer-style wide-body):
//   width 5.2 m (x ∈ ±2.6) · height 2.9 m · length 18 m (z ∈ ±9)
//   aisle: |x| < 1.15 → 2.3 m of walkable width between the seat blocks
//   galley: open floor, full width, z ∈ 6..8.2
// Nose is at -z, galley at +z.
export const CABIN = {
  halfW: 2.6,
  height: 2.9,
  ceil: 2.68, // visual interior ceiling (shell is sunk 0.22 below floor)
  halfL: 9,
  rowStart: -6.5,
  rowEnd: 5.0,
  rowPitch: 1.15,
  seatX: [-2.05, -1.45, 1.45, 2.05], // 2+2 layout hugging the walls
}

const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...opts })

function roundedRect(w, h, rBottom, rTop, y0 = 0) {
  const s = new THREE.Shape()
  const hw = w / 2
  s.moveTo(-hw + rBottom, y0)
  s.lineTo(hw - rBottom, y0)
  s.quadraticCurveTo(hw, y0, hw, y0 + rBottom)
  s.lineTo(hw, y0 + h - rTop)
  s.quadraticCurveTo(hw, y0 + h, hw - rTop, y0 + h)
  s.lineTo(-hw + rTop, y0 + h)
  s.quadraticCurveTo(-hw, y0 + h, -hw, y0 + h - rTop)
  s.lineTo(-hw, y0 + rBottom)
  s.quadraticCurveTo(-hw, y0, -hw + rBottom, y0)
  return s
}

// ---------- canvas textures ----------
function carpetTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 1024
  const g = c.getContext('2d')
  g.fillStyle = '#4a5aa0'
  g.fillRect(0, 0, 256, 1024)
  // wide aisle band down the middle (|x| < 1.15 of 5.2m width)
  g.fillStyle = '#5d6fb8'
  g.fillRect(71, 0, 114, 1024)
  // subtle speckle
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,20,0.05)'
    g.fillRect(Math.random() * 256, Math.random() * 1024, 2, 2)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function windowTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 384
  const g = c.getContext('2d')
  const rr = (x, y, w, h, r) => {
    g.beginPath()
    g.roundRect(x, y, w, h, r)
  }
  // frame
  g.fillStyle = '#e9dcc6'
  rr(0, 0, 256, 384, 120)
  g.fill()
  // golden-hour sky
  const sky = g.createLinearGradient(0, 24, 0, 360)
  sky.addColorStop(0, '#5aa9e8')
  sky.addColorStop(0.55, '#a5d5f5')
  sky.addColorStop(0.8, '#ffdf9e')
  sky.addColorStop(1, '#ffbe62')
  g.fillStyle = sky
  rr(20, 20, 216, 344, 104)
  g.fill()
  // puffy clouds
  g.fillStyle = 'rgba(255,255,255,0.85)'
  for (const [x, y, r] of [[70, 210, 26], [110, 222, 34], [155, 212, 24], [185, 260, 20], [60, 300, 22], [105, 306, 28]]) {
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// the official Traycer logo (vector SVG assets), recolored per placement
const traycerLogoImg = new Image()
traycerLogoImg.src = '/traycer-logo.svg' // full lockup: mark + wordmark
const traycerMarkOnlyImg = new Image()
traycerMarkOnlyImg.src = '/traycer-mark.svg'

function traycerLogoTexture(color = '#17171c', withWordmark = true) {
  const img = withWordmark ? traycerLogoImg : traycerMarkOnlyImg
  const c = document.createElement('canvas')
  c.width = withWordmark ? 1056 : 256
  c.height = 256
  const g = c.getContext('2d')
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8

  const draw = () => {
    g.clearRect(0, 0, c.width, c.height)
    g.drawImage(img, 0, 0, c.width, c.height) // 660:160 ≈ 1056:256
    // black ink on transparent — tint it to the requested color
    g.globalCompositeOperation = 'source-in'
    g.fillStyle = color
    g.fillRect(0, 0, c.width, c.height)
    g.globalCompositeOperation = 'source-over'
    tex.needsUpdate = true
  }
  if (img.complete && img.naturalWidth) draw()
  else img.addEventListener('load', draw)
  return tex
}

let seatDecal = null // shared texture/material/geometry for all 44 seat backs
function seatLogoDecal() {
  if (!seatDecal) {
    seatDecal = {
      geo: new THREE.PlaneGeometry(0.36, 0.09),
      mat: new THREE.MeshBasicMaterial({
        map: traycerLogoTexture('#31446f'),
        transparent: true,
        opacity: 0.85,
      }),
    }
  }
  return seatDecal
}

function labelTexture(text) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#efe3cd'
  g.beginPath()
  g.roundRect(0, 0, 512, 128, 28)
  g.fill()
  g.fillStyle = '#2b2b33'
  g.font = '700 52px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.letterSpacing = '8px'
  g.fillText(text, 256, 70)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// ---------- builders ----------
function buildShell(scene) {
  const outer = roundedRect(5.7, 3.42, 0.5, 1.4)
  const inner = roundedRect(5.2, 2.9, 0.35, 1.25)
  outer.holes.push(inner)
  const geo = new THREE.ExtrudeGeometry(outer, {
    depth: CABIN.halfL * 2,
    bevelEnabled: false,
    curveSegments: 24,
  })
  geo.translate(0, -0.22, -CABIN.halfL) // sink shell so interior floor sits at y=0
  const shell = new THREE.Mesh(geo, mat(PALETTE.cream, { roughness: 0.96 }))
  shell.castShadow = false // let the "sun" flood in through the walls
  shell.receiveShadow = true
  scene.add(shell)

  // solid bulkheads — the extrude caps only fill the wall ring, so the
  // interior cross-section is open at both ends without these
  const capGeo = new THREE.ExtrudeGeometry(roundedRect(5.2, 2.9, 0.35, 1.25), {
    depth: 0.08,
    bevelEnabled: false,
    curveSegments: 24,
  })
  for (const side of [-1, 1]) {
    const cap = new THREE.Mesh(capGeo, mat(PALETTE.creamDark, { roughness: 0.96 }))
    cap.position.set(0, -0.22, side * CABIN.halfL - (side > 0 ? 0 : 0.08))
    cap.receiveShadow = true
    scene.add(cap)
  }
}

// arched structural ribs, like the trailer's segmented fuselage look
function buildRibs(scene) {
  const ring = roundedRect(5.2, 2.9, 0.35, 1.25)
  ring.holes.push(roundedRect(5.04, 2.8, 0.33, 1.2, 0.02))
  const geo = new THREE.ExtrudeGeometry(ring, {
    depth: 0.07,
    bevelEnabled: false,
    curveSegments: 16,
  })
  const ribMat = mat(0xe6d7c1, { roughness: 0.94 })
  // between window columns
  for (let i = 0; i < 6; i++) {
    const rib = new THREE.Mesh(geo, ribMat)
    rib.position.set(0, -0.22, CABIN.rowStart + (i * 2 + 0.5) * CABIN.rowPitch)
    rib.receiveShadow = true
    scene.add(rib)
  }
}

function buildFloor(scene) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(CABIN.halfW * 2, CABIN.halfL * 2),
    mat(0xffffff, { map: carpetTexture(), roughness: 1 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0.001
  floor.receiveShadow = true
  scene.add(floor)

  // glowing aisle guide strips
  const stripGeo = new THREE.BoxGeometry(0.03, 0.012, CABIN.halfL * 2 - 1.2)
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffb36b })
  for (const x of [-1.18, 1.18]) {
    const strip = new THREE.Mesh(stripGeo, stripMat)
    strip.position.set(x, 0.006, 0)
    scene.add(strip)
  }
}

function buildWindows(scene) {
  const tex = windowTexture()
  const geo = new THREE.PlaneGeometry(0.55, 0.8)
  const winMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false })
  for (let side = 0; side < 2; side++) {
    const x = side === 0 ? -CABIN.halfW + 0.02 : CABIN.halfW - 0.02
    for (let i = 0; i < 12; i++) {
      const w = new THREE.Mesh(geo, winMat)
      w.position.set(x, 1.45, CABIN.rowStart + i * CABIN.rowPitch)
      w.rotation.y = side === 0 ? Math.PI / 2 : -Math.PI / 2
      scene.add(w)
    }
  }
}

function buildSeat(scene, physics, x, z, tint) {
  const g = new THREE.Group()
  const seatMat = mat(tint)
  const seatDark = mat(new THREE.Color(tint).multiplyScalar(0.82))

  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.46), seatDark)
  pedestal.position.y = 0.17
  const cushion = new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.16, 0.5, 3, 0.06), seatMat)
  cushion.position.y = 0.42
  const back = new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.78, 0.15, 3, 0.06), seatMat)
  back.position.set(0, 0.86, 0.24)
  back.rotation.x = -0.09
  const headrest = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.16, 0.14, 3, 0.05), seatDark)
  headrest.position.set(0, 1.3, 0.28)
  headrest.rotation.x = -0.09
  for (const m of [pedestal, cushion, back, headrest]) {
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
  }
  // Traycer "embroidery" on the seat back, facing the aisle traffic
  const decal = seatLogoDecal()
  const logo = new THREE.Mesh(decal.geo, decal.mat)
  logo.position.set(0, 1.02, 0.335)
  logo.rotation.set(0.09, Math.PI, 0)
  g.add(logo)
  g.position.set(x, 0, z)
  scene.add(g)

  // two simple colliders: base block + backrest
  physics.addStaticBox(0.28, 0.25, 0.25, x, 0.25, z)
  physics.addStaticBox(0.28, 0.42, 0.08, x, 0.92, z + 0.25)
}

function buildSeats(scene, physics) {
  const base = new THREE.Color(PALETTE.seatBlue)
  let row = 0
  for (let z = CABIN.rowStart; z <= CABIN.rowEnd + 0.001; z += CABIN.rowPitch, row++) {
    // gentle hue drift so rows aren't a flat wall of one blue
    const tint = base.clone().offsetHSL(0, 0, (row % 3) * 0.02 - 0.02)
    for (const x of CABIN.seatX) buildSeat(scene, physics, x, z, tint.getHex())
  }
}

// open overhead racks piled with colorful luggage (trailer look)
function buildRacks(scene, physics) {
  const len = CABIN.rowEnd - CABIN.rowStart + 1.6
  const zMid = (CABIN.rowStart + CABIN.rowEnd) / 2
  const shelfMat = mat(0xded0c2, { roughness: 0.85 })
  const railMat = mat(PALETTE.steel, { roughness: 0.5, metalness: 0.4 })
  const LUGGAGE = [0x67b56b, 0xe886a8, 0xf2a13c, 0x4fa8d8, 0xc94f4f, 0x8a6cc9, 0xf2d34c]
  let li = 0
  for (const side of [-1, 1]) {
    const shelf = new THREE.Mesh(new RoundedBoxGeometry(1.05, 0.07, len, 3, 0.03), shelfMat)
    shelf.position.set(side * 2.0, 2.12, zMid)
    shelf.rotation.z = side * 0.09 // tip toward the wall so bags lean in
    shelf.castShadow = true
    shelf.receiveShadow = true
    scene.add(shelf)
    physics.addStaticBox(0.52, 0.035, len / 2, side * 2.0, 2.13, zMid)

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, len), railMat)
    rail.position.set(side * 1.52, 2.2, zMid)
    scene.add(rail)

    // luggage — static dressing, packed loosely along the shelf
    for (let z = zMid - len / 2 + 0.5; z < zMid + len / 2 - 0.4; z += 0.55 + ((li * 37) % 23) / 100) {
      const w = 0.45 + ((li * 53) % 20) / 100
      const h = 0.26 + ((li * 71) % 22) / 100
      const bag = new THREE.Mesh(
        new RoundedBoxGeometry(0.6, h, w, 2, 0.05),
        mat(LUGGAGE[li % LUGGAGE.length], { roughness: 0.8 }),
      )
      bag.position.set(side * 2.02, 2.17 + h / 2, z)
      bag.rotation.y = (((li * 13) % 10) - 5) / 40
      bag.rotation.z = side * 0.09
      bag.castShadow = true
      scene.add(bag)
      li++
    }
  }
}

function buildCeilingLights(scene) {
  const geo = new THREE.BoxGeometry(0.16, 0.03, 16.5)
  const glow = new THREE.MeshBasicMaterial({ color: 0xfff0d8 })
  for (const x of [-0.9, 0.9]) {
    const strip = new THREE.Mesh(geo, glow)
    strip.position.set(x, CABIN.ceil - 0.06, -0.4)
    scene.add(strip)
  }
}

function buildGalley(scene, physics) {
  // rear counter, full width
  const counter = new THREE.Mesh(new RoundedBoxGeometry(4.9, 0.92, 0.6, 4, 0.08), mat(PALETTE.creamDark))
  counter.position.set(0, 0.46, 8.5)
  counter.castShadow = true
  counter.receiveShadow = true
  scene.add(counter)
  physics.addStaticBox(2.45, 0.46, 0.3, 0, 0.46, 8.5)

  const top = new THREE.Mesh(new THREE.BoxGeometry(4.94, 0.04, 0.64), mat(PALETTE.steel, { roughness: 0.4, metalness: 0.5 }))
  top.position.set(0, 0.94, 8.5)
  top.receiveShadow = true
  scene.add(top)
  physics.addStaticBox(2.47, 0.02, 0.32, 0, 0.94, 8.5)

  // service cart parked mid-galley
  const cart = new THREE.Group()
  const bodyMesh = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.82, 0.78, 4, 0.06), mat(PALETTE.steel, { roughness: 0.5, metalness: 0.4 }))
  bodyMesh.position.y = 0.47
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), mat(PALETTE.orange, { roughness: 0.5 }))
  handle.position.set(0, 0.98, -0.34)
  const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.02), mat(0xaab3c6))
  drawer.position.set(0, 0.5, 0.4)
  for (const m of [bodyMesh, handle, drawer]) {
    m.castShadow = true
    m.receiveShadow = true
    cart.add(m)
  }
  // sponsor sticker on the cart
  const sticker = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.1),
    new THREE.MeshBasicMaterial({ map: traycerLogoTexture('#17171c'), transparent: true }),
  )
  sticker.position.set(0, 0.6, 0.412)
  cart.add(sticker)
  cart.position.set(-1.5, 0, 7.2)
  scene.add(cart)
  physics.addStaticBox(0.26, 0.44, 0.39, -1.5, 0.44, 7.2)
}

// Traycer Air branding on the walls the player faces most
function buildBranding(scene) {
  const logoMat = new THREE.MeshBasicMaterial({ map: traycerLogoTexture('#17171c'), transparent: true })

  // front bulkhead, above the cockpit door — in view for the whole flight
  const front = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.475), logoMat)
  front.position.set(0, 2.32, -8.87)
  scene.add(front)

  // rear galley wall, above the counter — greets you at the restock point
  const rear = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), logoMat)
  rear.position.set(0, 2.0, 8.93)
  rear.rotation.y = Math.PI
  scene.add(rear)
}

function buildCockpitDoor(scene) {
  const door = new THREE.Mesh(new RoundedBoxGeometry(1.0, 2.05, 0.1, 4, 0.05), mat(0xe5d7c2))
  door.position.set(0, 1.02, -8.88)
  door.receiveShadow = true
  scene.add(door)
  const handle = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.05, 0.06, 2, 0.02), mat(PALETTE.orange, { roughness: 0.5 }))
  handle.position.set(0.34, 1.0, -8.81)
  scene.add(handle)
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.15),
    new THREE.MeshBasicMaterial({ map: labelTexture('COCKPIT'), transparent: true }),
  )
  sign.position.set(0, 1.82, -8.81)
  scene.add(sign)
}

function buildStaticColliders(physics) {
  const { halfW, height, ceil, halfL } = CABIN
  physics.addStaticBox(halfW, 0.2, halfL, 0, -0.2, 0) // floor
  physics.addStaticBox(halfW, 0.2, halfL, 0, ceil + 0.2, 0) // ceiling
  physics.addStaticBox(0.2, height / 2 + 0.4, halfL, -halfW - 0.18, height / 2, 0) // walls
  physics.addStaticBox(0.2, height / 2 + 0.4, halfL, halfW + 0.18, height / 2, 0)
  physics.addStaticBox(halfW, height / 2 + 0.4, 0.2, 0, height / 2, -halfL - 0.18) // bulkheads
  physics.addStaticBox(halfW, height / 2 + 0.4, 0.2, 0, height / 2, halfL + 0.18)
  // angled "shoulders" so props follow the curved ceiling corners
  for (const side of [-1, 1]) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side * 0.7)
    physics.addStaticBox(0.65, 0.1, halfL, side * 2.2, 2.4, 0, {
      rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
    })
  }
}

function seatbeltSignTexture(on) {
  const c = document.createElement('canvas')
  c.width = 320
  c.height = 112
  const g = c.getContext('2d')
  g.fillStyle = on ? '#3a2617' : '#26262e'
  g.beginPath()
  g.roundRect(0, 0, 320, 112, 22)
  g.fill()
  g.fillStyle = on ? '#ffb36b' : '#63636c'
  g.font = '700 34px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('🔔 FASTEN', 160, 36)
  g.fillText('SEATBELTS', 160, 76)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// hanging cabin signs the game toggles during turbulence warnings
export function buildSeatbeltSigns(scene) {
  const texOn = seatbeltSignTexture(true)
  const texOff = seatbeltSignTexture(false)
  const mats = []
  const geo = new THREE.PlaneGeometry(0.62, 0.22)
  const stemGeo = new THREE.BoxGeometry(0.04, 0.1, 0.04)
  const stemMat = mat(PALETTE.creamDark)
  for (const z of [-5, -0.8, 3.4]) {
    const stem = new THREE.Mesh(stemGeo, stemMat)
    stem.position.set(0, CABIN.ceil - 0.05, z)
    scene.add(stem)
    for (const dir of [0, Math.PI]) {
      const m = new THREE.MeshBasicMaterial({ map: texOff, transparent: true })
      const sign = new THREE.Mesh(geo, m)
      sign.position.set(0, CABIN.ceil - 0.21, z + (dir === 0 ? 0.008 : -0.008))
      sign.rotation.y = dir
      scene.add(sign)
      mats.push(m)
    }
  }
  let state = false
  return {
    setOn(b) {
      if (b === state) return
      state = b
      for (const m of mats) m.map = b ? texOn : texOff
    },
  }
}

// ---------- entry ----------
export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.12
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x9fc7ef)
  scene.fog = new THREE.Fog(0xf0e0c8, 14, 36)

  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 60)

  // golden-hour key light pouring in from the right side
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.6)
  sun.position.set(7, 5, -4)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -11
  sun.shadow.camera.right = 11
  sun.shadow.camera.top = 11
  sun.shadow.camera.bottom = -11
  sun.shadow.camera.far = 40
  sun.shadow.bias = -0.0004
  scene.add(sun)

  const hemi = new THREE.HemisphereLight(0xbcd7f5, 0xcaa87c, 0.85)
  scene.add(hemi)

  for (const z of [-5, 0, 5]) {
    const p = new THREE.PointLight(0xffe6c4, 2.8, 8, 2)
    p.position.set(0, CABIN.ceil - 0.2, z)
    scene.add(p)
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  return { renderer, scene, camera }
}

export function buildCabin(scene, physics) {
  buildShell(scene)
  buildRibs(scene)
  buildFloor(scene)
  buildWindows(scene)
  buildSeats(scene, physics)
  buildRacks(scene, physics)
  buildCeilingLights(scene)
  buildGalley(scene, physics)
  buildCockpitDoor(scene)
  buildBranding(scene)
  buildStaticColliders(physics)
}
