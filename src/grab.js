import * as THREE from 'three'

const REACH = 3.0
const HOVER_EMISSIVE = new THREE.Color(0x552d00)

// Gravity-gun-lite: raycast from the camera, hold a body on a velocity
// spring in front of you, right-click to hurl it.
export class Grabber {
  constructor(camera, grabbables) {
    this.camera = camera
    this.grabbables = grabbables // root Groups with userData.body + userData.mats
    this.raycaster = new THREE.Raycaster()
    this.raycaster.far = REACH
    this.held = null // { root, body, dist }
    this.hovered = null
    this._dir = new THREE.Vector3()

    window.addEventListener('mousedown', (e) => {
      if (!document.pointerLockElement) return
      if (e.button === 0) this.tryGrab()
      if (e.button === 2 && this.held) this.throwHeld()
    })
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.release()
    })
    window.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  rootOf(obj) {
    let o = obj
    while (o && !o.userData.body) o = o.parent
    return o
  }

  raycast() {
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera)
    const hits = this.raycaster.intersectObjects(this.grabbables, true)
    if (!hits.length) return null
    const root = this.rootOf(hits[0].object)
    return root ? { root, dist: hits[0].distance } : null
  }

  setHover(root) {
    if (this.hovered === root) return
    if (this.hovered) for (const m of this.hovered.userData.mats) m.emissive.set(0x000000)
    this.hovered = root
    if (root) for (const m of root.userData.mats) m.emissive.copy(HOVER_EMISSIVE)
  }

  // per render frame — drives the crosshair state too
  updateHover() {
    if (this.held) {
      this.setHover(null)
      return 'holding'
    }
    const hit = this.raycast()
    this.setHover(hit?.root ?? null)
    return hit ? 'hover' : 'idle'
  }

  tryGrab() {
    const hit = this.raycast()
    if (!hit) return
    this.setHover(null)
    this.held = {
      root: hit.root,
      body: hit.root.userData.body,
      dist: THREE.MathUtils.clamp(hit.dist, 1.0, 1.7),
    }
  }

  release() {
    this.held = null
  }

  throwHeld() {
    const { body } = this.held
    this.camera.getWorldDirection(this._dir)
    const m = body.mass()
    body.applyImpulse(
      { x: this._dir.x * m * 7, y: this._dir.y * m * 7 + m * 1.2, z: this._dir.z * m * 7 },
      true,
    )
    this.held = null
  }

  fixedUpdate() {
    if (!this.held) return
    const { body, dist } = this.held
    body.wakeUp()
    this.camera.getWorldDirection(this._dir)
    const target = {
      x: this.camera.position.x + this._dir.x * dist,
      y: this.camera.position.y + this._dir.y * dist,
      z: this.camera.position.z + this._dir.z * dist,
    }
    const p = body.translation()
    let vx = (target.x - p.x) * 14
    let vy = (target.y - p.y) * 14
    let vz = (target.z - p.z) * 14
    const speed = Math.hypot(vx, vy, vz)
    if (speed > 9) {
      vx = (vx / speed) * 9
      vy = (vy / speed) * 9
      vz = (vz / speed) * 9
    }
    body.setLinvel({ x: vx, y: vy, z: vz }, true)
    const av = body.angvel()
    body.setAngvel({ x: av.x * 0.85, y: av.y * 0.85, z: av.z * 0.85 }, true)
  }
}
