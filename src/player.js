import * as THREE from 'three'

// First-person kinematic capsule driven by Rapier's character controller.
export class Player {
  constructor(physics, camera) {
    const { RAPIER, world } = physics
    this.camera = camera
    this.speed = 3.5
    this.yaw = 0 // facing the nose (-z)
    this.pitch = 0
    this.vy = 0
    this.bobPhase = 0
    this.moving = false

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.9, 6.3),
    )
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.28), this.body)

    this.controller = world.createCharacterController(0.02)
    this.controller.enableAutostep(0.3, 0.15, true)
    this.controller.enableSnapToGround(0.4)
    this.controller.setApplyImpulsesToDynamicBodies(true)
    this.controller.setCharacterMass(75)

    this.keys = new Set()
    window.addEventListener('keydown', (e) => this.keys.add(e.code))
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
  }

  onMouseMove(e) {
    this.yaw -= e.movementX * 0.0022
    this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.35, 1.35)
  }

  fixedUpdate(dt) {
    const k = this.keys
    const inX = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0)
    const inZ = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0)

    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    // forward at yaw=0 is -z
    let dx = (-sin * inZ + cos * inX) * this.speed
    let dz = (-cos * inZ - sin * inX) * this.speed
    const len = Math.hypot(dx, dz)
    if (len > this.speed) {
      dx = (dx / len) * this.speed
      dz = (dz / len) * this.speed
    }
    this.moving = len > 0.1

    this.vy -= 9.81 * dt
    const move = { x: dx * dt, y: this.vy * dt, z: dz * dt }
    this.controller.computeColliderMovement(this.collider, move)
    const corrected = this.controller.computedMovement()
    const t = this.body.translation()
    this.body.setNextKinematicTranslation({
      x: t.x + corrected.x,
      y: t.y + corrected.y,
      z: t.z + corrected.z,
    })
    if (this.controller.computedGrounded()) this.vy = -0.5
  }

  // called every render frame; sway/shake come from main
  updateCamera(dt, time, shake) {
    const t = this.body.translation()
    this.bobPhase += dt * (this.moving ? 9 : 2)
    const bob = this.moving ? Math.sin(this.bobPhase) * 0.028 : Math.sin(this.bobPhase) * 0.006

    // constant gentle "in flight" sway + turbulence shake
    const swayRoll = Math.sin(time * 0.6) * 0.006 + Math.sin(time * 1.7) * 0.002
    const jx = (Math.random() - 0.5) * 0.06 * shake
    const jy = (Math.random() - 0.5) * 0.06 * shake
    const jroll = (Math.random() - 0.5) * 0.02 * shake

    this.camera.position.set(t.x + jx, t.y + 0.62 + bob + jy, t.z)
    this.camera.quaternion.setFromEuler(
      new THREE.Euler(this.pitch, this.yaw, swayRoll + jroll, 'YXZ'),
    )
  }
}
