import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { CABIN, PALETTE } from './scene.js'

// deterministic layout so every boarding looks the same
let seed = 1337
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647

const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts })

function finalize(root, scene) {
  const mats = []
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true
      o.receiveShadow = true
      if (o.material.isMeshStandardMaterial) mats.push(o.material)
    }
  })
  root.userData.mats = mats
  scene.add(root)
  return root
}

function setYaw(body, yaw) {
  body.setRotation(
    { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
    true,
  )
}

// ---------- props ----------
function suitcase(color) {
  const g = new THREE.Group()
  const shellMat = mat(color, { roughness: 0.7 })
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.58, 0.22, 3, 0.06), shellMat)
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.09, 0.23), mat(0xf4ead9))
  strap.position.y = 0.06
  const handle = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.05, 0.05, 2, 0.02), mat(0x3a3a42, { roughness: 0.6 }))
  handle.position.y = 0.33
  g.add(body, strap, handle)
  return g
}

function sodaCan(color) {
  const g = new THREE.Group()
  const can = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 0.16, 20),
    mat(color, { roughness: 0.35, metalness: 0.5 }),
  )
  const lid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.05, 0.012, 20),
    mat(0xd7dce4, { roughness: 0.3, metalness: 0.8 }),
  )
  lid.position.y = 0.085
  g.add(can, lid)
  return g
}

// a proper chicken drumstick — matches the 🍗 request bubble at a glance
function chickenLeg() {
  const g = new THREE.Group()
  const meatM = mat(0xc9803e, { roughness: 0.65 })
  const boneM = mat(0xf3ede0, { roughness: 0.5 })
  const meat = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 14), meatM)
  meat.scale.set(1, 0.92, 1.35)
  const taper = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 12), meatM)
  taper.scale.set(1, 0.9, 1.2)
  taper.position.z = -0.1
  const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 10), boneM)
  bone.rotation.x = Math.PI / 2
  bone.position.z = -0.2
  const knobGeo = new THREE.SphereGeometry(0.032, 10, 8)
  const knob1 = new THREE.Mesh(knobGeo, boneM)
  knob1.position.set(-0.02, 0.012, -0.26)
  const knob2 = new THREE.Mesh(knobGeo, boneM)
  knob2.position.set(0.02, -0.012, -0.26)
  g.add(meat, taper, bone, knob1, knob2)
  return g
}

function pillow() {
  const g = new THREE.Group()
  g.add(new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.13, 0.26, 3, 0.06), mat(0xf7f3ec, { roughness: 1 })))
  return g
}

function rubberDuck() {
  const g = new THREE.Group()
  const yellow = mat(0xf7c948, { roughness: 0.4 })
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 16), yellow)
  body.scale.set(1.15, 0.85, 1.3)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 16), yellow)
  head.position.set(0, 0.09, 0.07)
  const beak = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.025, 0.05, 2, 0.01), mat(PALETTE.orange, { roughness: 0.5 }))
  beak.position.set(0, 0.085, 0.13)
  g.add(body, head, beak)
  return g
}

// ---------- passengers (trailer-style: huge googly eyes, outfits, hair, seatbelts) ----------
const SHIRTS = [0xe8635a, 0x4fa8d8, 0xf2b63c, 0x7bc47f, 0x9a7bd0, 0xd8778f, 0xf7f3ec, 0x2f6f8f]
const JACKETS = [0xf4ead9, 0x3a3f4a, 0x7a9e7e, 0xc96f4a, 0x5b7fd4, 0x8a6cc9]
const PANTS = [0x46589e, 0x3a3f4a, 0x8a7c66, 0x4a6cbd, 0x555c66]
const SHOES = [0x8d5f3d, 0x2f2f36, 0xe8e4da, 0xc94f4f]
const SKINS = [0xf5c69a, 0xe8b183, 0xc98d5e, 0x8d5f3d]
const HAIRS = [0x5b4230, 0x2e2620, 0xd9a441, 0xb5502e, 0x9aa0a8, 0x3d2b1f]
const BEANIES = [0x6fbf73, 0xe8635a, 0x2f6f8f, 0xf2b63c]

const pick = (arr) => arr[Math.floor(rand() * arr.length)]

function passenger() {
  const g = new THREE.Group()
  const shirt = mat(pick(SHIRTS), { roughness: 0.95 })
  const skin = mat(pick(SKINS), { roughness: 0.8 })
  const pants = mat(pick(PANTS), { roughness: 0.95 })
  const shoeM = mat(pick(SHOES), { roughness: 0.85 })

  // torso + optional open-front jacket over the shirt
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.55, 6, 18), shirt)
  g.add(torso)
  let sleeve = shirt // arms match the outermost layer
  if (rand() < 0.72) {
    const jacketM = mat(pick(JACKETS), { roughness: 0.95, side: THREE.DoubleSide })
    const jacket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.265, 0.285, 0.5, 18, 1, true, Math.PI + 0.7, Math.PI * 2 - 1.4),
      jacketM,
    )
    jacket.position.y = 0.0
    g.add(jacket)
    sleeve = mat(jacketM.color.getHex(), { roughness: 0.95 })
  }

  // stubby arms with hands, resting on the lap
  const armGeo = new THREE.CapsuleGeometry(0.055, 0.2, 4, 10)
  const handGeo = new THREE.SphereGeometry(0.055, 12, 10)
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, sleeve)
    arm.position.set(sx * 0.26, 0.02, -0.06)
    arm.rotation.set(0.5, 0, sx * -0.35)
    const hand = new THREE.Mesh(handGeo, skin)
    hand.position.set(sx * 0.2, -0.17, -0.2)
    g.add(arm, hand)
  }

  // seated legs: thighs forward, shins down, shoes dangling
  for (const sx of [-1, 1]) {
    const thigh = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.11, 0.3, 2, 0.04), pants)
    thigh.position.set(sx * 0.1, -0.42, -0.16)
    const shin = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.22, 0.1, 2, 0.03), pants)
    shin.position.set(sx * 0.1, -0.55, -0.29)
    const shoe = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.08, 0.19, 2, 0.03), shoeM)
    shoe.position.set(sx * 0.1, -0.68, -0.32)
    g.add(thigh, shin, shoe)
  }

  // lap seatbelt — hidden until the player fastens it (E)
  const belt = new THREE.Mesh(
    new THREE.TorusGeometry(0.285, 0.028, 8, 24, Math.PI),
    mat(0x4a4a52, { roughness: 0.7 }),
  )
  belt.position.y = -0.26
  belt.rotation.set(Math.PI / 2, Math.PI, 0)
  const buckle = new THREE.Mesh(
    new RoundedBoxGeometry(0.08, 0.055, 0.03, 2, 0.01),
    mat(0xd7dce4, { roughness: 0.3, metalness: 0.7 }),
  )
  buckle.position.set(0, -0.26, -0.29)
  belt.visible = buckle.visible = false
  g.add(belt, buckle)
  g.userData.beltParts = [belt, buckle]

  // big head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 18), skin)
  head.position.y = 0.66
  g.add(head)

  // HUGE googly eyes — the whole personality budget lives here
  const eyeGeo = new THREE.SphereGeometry(0.085, 16, 14)
  const pupilGeo = new THREE.SphereGeometry(0.038, 10, 8)
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 })
  const black = new THREE.MeshStandardMaterial({ color: 0x111116, roughness: 0.3 })
  const pupils = []
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, white)
    eye.scale.set(1, 1.12, 0.55)
    eye.position.set(sx * 0.08, 0.71, -0.155)
    const pupil = new THREE.Mesh(pupilGeo, black)
    // slight per-eye divergence = instant derp
    pupil.position.set(sx * 0.08 + (rand() - 0.5) * 0.018, 0.71 + (rand() - 0.5) * 0.014, -0.213)
    pupil.userData.base = pupil.position.clone()
    g.add(eye, pupil)
    pupils.push(pupil)
  }

  // small mouth on most faces
  if (rand() < 0.65) {
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), mat(0x6b4438, { roughness: 0.6 }))
    mouth.scale.set(1.5, 0.6, 0.5)
    mouth.position.set(0, 0.57, -0.185)
    g.add(mouth)
  }

  // hair: mop / bob / beanie / buzz / bald
  const style = rand()
  if (style < 0.28) {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.165, 18, 14), mat(pick(HAIRS), { roughness: 1 }))
    hair.scale.set(1.12, 0.72, 1.1)
    hair.position.set(0, 0.79, 0.03)
    g.add(hair)
  } else if (style < 0.52) {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.175, 18, 14), mat(pick(HAIRS), { roughness: 1 }))
    hair.scale.set(1.15, 0.95, 1.05)
    hair.position.set(0, 0.77, 0.055)
    g.add(hair)
  } else if (style < 0.72) {
    const beanie = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), mat(pick(BEANIES), { roughness: 1 }))
    beanie.scale.set(1.05, 0.62, 1.05)
    beanie.position.set(0, 0.815, 0)
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat(0xf7f3ec, { roughness: 1 }))
    pom.position.set(0, 0.92, 0)
    g.add(beanie, pom)
  } else if (style < 0.9) {
    const buzz = new THREE.Mesh(new THREE.SphereGeometry(0.185, 18, 14), mat(pick(HAIRS), { roughness: 1 }))
    buzz.scale.set(1.03, 0.6, 1.03)
    buzz.position.set(0, 0.76, 0.02)
    g.add(buzz)
  } // else: proudly bald

  g.userData.pupils = pupils
  g.userData.phase = rand() * Math.PI * 2
  return g
}

// ---------- spawning ----------
export function spawnProps(scene, physics) {
  const { RAPIER } = physics
  const grabbables = []
  const passengers = []

  const addProp = (root, colliderDesc, pos, opts = {}) => {
    finalize(root, scene)
    const body = physics.addDynamic(root, colliderDesc, pos, opts)
    if (opts.yaw) setYaw(body, opts.yaw)
    if (opts.kind) root.userData.kind = opts.kind
    grabbables.push(root)
    return body
  }

  // suitcases
  const caseColors = [PALETTE.orange, 0x3f9e8f, 0xc94f4f]
  const casePos = [
    { x: 1.2, y: 0.35, z: 7.6 },
    { x: 0.3, y: 0.35, z: 7.9 },
    { x: 0, y: 0.35, z: 1.4 }, // one abandoned in the aisle
  ]
  casePos.forEach((p, i) =>
    addProp(suitcase(caseColors[i]), RAPIER.ColliderDesc.cuboid(0.22, 0.29, 0.11).setDensity(38), p, {
      yaw: rand() * Math.PI,
      angularDamping: 0.8,
      kind: 'case',
    }),
  )

  // soda cans
  const canColors = [0xe8543f, 0x4fa8d8, 0xf2b63c, 0xe8543f, 0x7bc47f, 0x4fa8d8, 0xf2b63c]
  const canPos = [
    { x: -1.55, y: 0.98, z: 6.95 }, // on the cart
    { x: -1.9, y: 1.06, z: 8.45 },
    { x: 0.6, y: 1.06, z: 8.4 },
    { x: 0.75, y: 1.06, z: 8.5 },
    { x: 1.6, y: 1.06, z: 8.4 },
    { x: 0.2, y: 0.09, z: -2.4 }, // in-flight litter, mid-aisle so nobody can reach it
    { x: -0.3, y: 0.09, z: 3.3 },
  ]
  canPos.forEach((p, i) =>
    addProp(sodaCan(canColors[i]), RAPIER.ColliderDesc.cylinder(0.08, 0.055).setDensity(260), p, {
      restitution: 0.3,
      angularDamping: 1.2,
      kind: 'drink',
    }),
  )

  // chicken legs laid out on the galley counter, plus one on the cart
  const chickenPos = [
    { x: -0.25, y: 1.03, z: 8.45 },
    { x: 0.0, y: 1.03, z: 8.38 },
    { x: 1.35, y: 1.03, z: 8.45 },
    { x: -1.45, y: 0.96, z: 7.05 },
  ]
  chickenPos.forEach((p, i) =>
    addProp(chickenLeg(), RAPIER.ColliderDesc.cuboid(0.085, 0.075, 0.15).setDensity(160), p, {
      friction: 0.9,
      kind: 'meal',
      yaw: rand() * Math.PI * 2,
    }),
  )

  // pillows on two empty seats (kept clear of passengers below)
  const pillowSeats = [
    { x: 2.05, z: -3.05 },
    { x: -1.45, z: 0.4 },
  ]
  for (const s of pillowSeats) {
    addProp(pillow(), RAPIER.ColliderDesc.cuboid(0.18, 0.06, 0.13).setDensity(45), { x: s.x, y: 0.58, z: s.z }, { friction: 1.0, kind: 'pillow' })
  }

  // one rubber duck on the galley counter, as a treat
  addProp(rubberDuck(), RAPIER.ColliderDesc.ball(0.1).setDensity(30), { x: -0.9, y: 1.08, z: 8.4 }, { angularDamping: 1.5, kind: 'duck' })

  // passengers — fill ~a third of the seats; keep pillow seats AND their
  // neighbours empty so a starting pillow can't auto-fulfil a request
  const skip = new Set(pillowSeats.map((s) => `${s.x}|${s.z}`))
  skip.add(`${1.45}|${-3.05}`)
  skip.add(`${-2.05}|${0.4}`)
  let count = 0
  for (let z = CABIN.rowStart; z <= CABIN.rowEnd + 0.001; z += CABIN.rowPitch) {
    for (const x of CABIN.seatX) {
      if (count >= 16 || skip.has(`${x}|${z}`) || rand() > 0.36) continue
      const p = passenger()
      const body = addProp(
        p,
        RAPIER.ColliderDesc.capsule(0.3, 0.26).setTranslation(0, 0.12, 0).setDensity(45),
        { x, y: 0.95, z: z - 0.04 },
        { linearDamping: 0.7, angularDamping: 2.5, friction: 1.0, restitution: 0.08, kind: 'passenger' },
      )
      setYaw(body, (rand() - 0.5) * 0.5)
      p.userData.home = { x, y: 0.95, z: z - 0.04 }
      p.userData.buckled = false // the player fastens belts by hand (E)
      passengers.push(p)
      count++
    }
  }
  // two of them are trouble
  for (const i of [2, 9]) if (passengers[i]) makeUnruly(passengers[i])

  // galley restock — replacements for consumed request items appear here
  const RESTOCK = {
    drink: { make: () => sodaCan(canColors[Math.floor(rand() * canColors.length)]), collider: () => RAPIER.ColliderDesc.cylinder(0.08, 0.055).setDensity(260), at: { x: 1.2, y: 1.06, z: 8.35 }, opts: { restitution: 0.3, angularDamping: 1.2 } },
    meal: { make: chickenLeg, collider: () => RAPIER.ColliderDesc.cuboid(0.085, 0.075, 0.15).setDensity(160), at: { x: 0.3, y: 1.05, z: 8.42 }, opts: { friction: 0.9 } },
    pillow: { make: pillow, collider: () => RAPIER.ColliderDesc.cuboid(0.18, 0.06, 0.13).setDensity(45), at: { x: -0.5, y: 1.1, z: 8.4 }, opts: { friction: 1.0 } },
  }

  function spawnItem(kind) {
    const r = RESTOCK[kind]
    if (!r) return null
    const pos = {
      x: r.at.x + (rand() - 0.5) * 0.12,
      y: r.at.y,
      z: r.at.z + (rand() - 0.5) * 0.12,
    }
    const root = r.make()
    addProp(root, r.collider(), pos, { ...r.opts, kind })
    return root
  }

  // a troublemaker: red shirt, angry brows, drains the mood until dealt with
  function makeUnruly(p) {
    p.userData.unruly = true
    const torso = p.children[0]
    torso.material.color.set(0xc94f4f)
    for (const sx of [-1, 1]) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.028, 0.03), mat(0x2e2620))
      brow.position.set(sx * 0.08, 0.795, -0.17)
      brow.rotation.z = sx * 0.45
      p.add(brow)
    }
  }

  function setBelt(p, on) {
    p.userData.buckled = on
    for (const m of p.userData.beltParts) m.visible = on
  }

  function seatState(p) {
    const u = p.userData
    const t = u.body.translation()
    const v = u.body.linvel()
    return {
      dist: Math.hypot(u.home.x - t.x, u.home.y - t.y, u.home.z - t.z),
      speed: Math.hypot(v.x, v.y, v.z),
    }
  }

  // can the player fasten this one right now? (near their seat, calm, unbuckled)
  function canBuckle(p) {
    if (p.userData.kind !== 'passenger' || p.userData.buckled) return false
    const s = seatState(p)
    return s.dist < 0.75 && s.speed < 1.5
  }

  function buckle(p) {
    if (!canBuckle(p)) return false
    // click into place: snap to the proper seated pose no matter how
    // sloppily they were dumped on the seat
    const body = p.userData.body
    body.setTranslation(p.userData.home, true)
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    setBelt(p, true)
    return true
  }

  // Seat anchoring, two tiers:
  //  - buckled (player fastened the belt): strong spring — holds through
  //    turbulence until a hard fling (> 2.6 m/s) or a big displacement.
  //  - merely seated: weak courtesy hold so nobody slumps over in calm air,
  //    but ANY real jolt (> 1.0 m/s) breaks it — unbelted passengers fly.
  function fixedUpdate(dt, heldRoot) {
    for (const p of passengers) {
      const u = p.userData
      const body = u.body
      if (p === heldRoot) {
        if (u.buckled) setBelt(p, false)
        continue
      }
      const t = body.translation()
      if (!Number.isFinite(t.x + t.y + t.z)) {
        // solver blew up — snap them home rather than hang the world
        body.setTranslation(u.home, true)
        body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        body.setAngvel({ x: 0, y: 0, z: 0 }, true)
        body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
        continue
      }
      const dx = u.home.x - t.x
      const dy = u.home.y - t.y
      const dz = u.home.z - t.z
      const dist = Math.hypot(dx, dy, dz)
      const v = body.linvel()
      const speed = Math.hypot(v.x, v.y, v.z)

      let hold = 0 // spring strength multiplier
      if (u.buckled) {
        if (dist > 0.9 || speed > 2.6) {
          setBelt(p, false) // the belt gives way
        } else {
          hold = 1
        }
      } else if (dist < 0.5 && speed < 1.0) {
        hold = 0.3
      }
      if (!hold) continue

      const m = body.mass()
      body.applyImpulse(
        {
          x: (dx * 25 - v.x * 5) * hold * m * dt,
          y: (dy * 25 - v.y * 5) * hold * m * dt,
          z: (dz * 25 - v.z * 5) * hold * m * dt,
        },
        true,
      )
      // gentle upright torque, scaled by approximate capsule inertia (~0.12·m)
      const q = body.rotation()
      const upX = 2 * (q.x * q.y - q.w * q.z)
      const upZ = 2 * (q.y * q.z + q.w * q.x)
      const av = body.angvel()
      const im = m * 0.12 * hold
      body.applyTorqueImpulse(
        { x: (-upZ * 18 - av.x * 5) * im * dt, y: -av.y * 5 * im * dt, z: (upX * 18 - av.z * 5) * im * dt },
        true,
      )
    }
  }

  // googly-eye jiggle: pupils chase velocity, wander when calm
  function update(time) {
    for (const p of passengers) {
      const v = p.userData.body.linvel()
      const phase = p.userData.phase
      for (const pupil of p.userData.pupils) {
        const b = pupil.userData.base
        pupil.position.x = b.x + THREE.MathUtils.clamp(-v.x * 0.014, -0.032, 0.032) + Math.sin(time * 1.1 + phase) * 0.011
        pupil.position.y = b.y + THREE.MathUtils.clamp(-v.y * 0.014, -0.032, 0.032) + Math.cos(time * 0.7 + phase) * 0.008
      }
    }
  }

  return { grabbables, passengers, update, fixedUpdate, spawnItem, buckle, canBuckle }
}
