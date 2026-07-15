import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const mat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...opts })

function doorSkyTexture(wide = false) {
  const c = document.createElement('canvas')
  c.width = wide ? 1024 : 256
  c.height = 512
  const g = c.getContext('2d')
  const sky = g.createLinearGradient(0, 0, 0, 512)
  sky.addColorStop(0, '#4fa3e8')
  sky.addColorStop(0.6, '#a5d5f5')
  sky.addColorStop(0.85, '#ffdf9e')
  sky.addColorStop(1, '#ffbe62')
  g.fillStyle = sky
  g.fillRect(0, 0, c.width, 512)
  g.fillStyle = 'rgba(255,255,255,0.85)'
  const clouds = wide
    ? [[80, 330, 34], [150, 350, 48], [240, 335, 30], [420, 300, 40], [500, 320, 55], [590, 306, 36], [780, 360, 44], [860, 380, 32], [940, 340, 26], [300, 420, 28], [680, 430, 34]]
    : [[60, 340, 30], [110, 355, 42], [170, 342, 28], [210, 420, 24], [40, 440, 26]]
  for (const [x, y, r] of clouds) {
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  if (wide) tex.wrapS = THREE.RepeatWrapping
  return tex
}

function exitSignTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 96
  const g = c.getContext('2d')
  g.fillStyle = '#1f5c34'
  g.beginPath()
  g.roundRect(0, 0, 256, 96, 20)
  g.fill()
  g.fillStyle = '#7bf59a'
  g.font = '800 58px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.letterSpacing = '10px'
  g.fillText('EXIT', 128, 52)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// Rear service door on the left wall of the galley. Open it (E) and the
// slipstream sucks nearby loose things — and passengers — out of the plane.
export class ExitDoor {
  constructor(scene) {
    this.open = false
    this.anim = 0 // 0 closed → 1 open
    this.pos = { x: -2.45, y: 1.0, z: 6.9 } // suction focus, just inside the wall

    this.group = new THREE.Group()

    // sky filling the doorway — wide texture with clouds drifting past,
    // the backdrop ejected passengers tumble against
    this.skyTex = doorSkyTexture(true)
    this.skyTex.repeat.set(0.22, 1)
    const skyPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 1.68),
      new THREE.MeshBasicMaterial({ map: this.skyTex, fog: false }),
    )
    skyPlane.position.set(-2.57, 1.02, 6.9)
    skyPlane.rotation.y = Math.PI / 2
    this.group.add(skyPlane)


    // frame — four border strips so the sky shows through the opening
    const frameMat = mat(0xd8c9b2)
    const top = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.14, 1.14, 2, 0.03), frameMat)
    top.position.set(-2.55, 1.94, 6.9)
    const bottom = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.14, 1.14, 2, 0.03), frameMat)
    bottom.position.set(-2.55, 0.1, 6.9)
    const left = new THREE.Mesh(new RoundedBoxGeometry(0.08, 1.9, 0.12, 2, 0.03), frameMat)
    left.position.set(-2.55, 1.02, 6.9 - 0.51)
    const right = new THREE.Mesh(new RoundedBoxGeometry(0.08, 1.9, 0.12, 2, 0.03), frameMat)
    right.position.set(-2.55, 1.02, 6.9 + 0.51)
    this.group.add(top, bottom, left, right)

    // sliding panel (the door itself)
    this.panel = new THREE.Group()
    const slab = new THREE.Mesh(new RoundedBoxGeometry(0.09, 1.72, 0.94, 3, 0.04), mat(0xe5d7c2))
    const porthole = new THREE.Mesh(
      new THREE.CircleGeometry(0.14, 24),
      new THREE.MeshBasicMaterial({ map: doorSkyTexture(), fog: false }),
    )
    porthole.position.set(0.05, 0.35, 0)
    porthole.rotation.y = Math.PI / 2
    const handle = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.3, 0.08, 2, 0.02), mat(0xff7a30, { roughness: 0.5 }))
    handle.position.set(0.06, 0, 0.3)
    for (const m of [slab, porthole, handle]) this.panel.add(m)
    this.panel.position.set(-2.5, 1.02, 6.9)
    slab.castShadow = true
    this.group.add(this.panel)

    // EXIT sign
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.44, 0.165),
      new THREE.MeshBasicMaterial({ map: exitSignTexture(), transparent: true, fog: false }),
    )
    sign.position.set(-2.51, 2.12, 6.9)
    sign.rotation.y = Math.PI / 2
    this.group.add(sign)

    scene.add(this.group)
  }

  toggle() {
    this.open = !this.open
  }

  update(dt) {
    const target = this.open ? 1 : 0
    this.anim += (target - this.anim) * Math.min(1, dt * 6)
    // hatch slides up and tucks slightly inward
    this.panel.position.y = 1.02 + this.anim * 1.58
    this.panel.position.x = -2.5 + this.anim * 0.18
    // clouds drift backward — sells that the plane is really moving
    this.skyTex.offset.x = (this.skyTex.offset.x - dt * 0.02) % 1
  }
}
