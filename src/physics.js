import RAPIER from '@dimforge/rapier3d-compat'

// Thin wrapper around a Rapier world: static box helpers, dynamic body
// registration, and mesh<->body syncing after each step.
export async function createPhysics() {
  await RAPIER.init()

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  world.timestep = 1 / 60

  const dynamics = [] // { mesh, body }

  function addStaticBox(hx, hy, hz, x, y, z, opts = {}) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z),
    )
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setFriction(opts.friction ?? 0.9)
      .setRestitution(opts.restitution ?? 0.05)
    if (opts.rotation) desc.setRotation(opts.rotation)
    world.createCollider(desc, body)
    return body
  }

  // colliderDesc offset/density should already be set by the caller.
  function addDynamic(mesh, colliderDesc, pos, opts = {}) {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(opts.linearDamping ?? 0.05)
      .setAngularDamping(opts.angularDamping ?? 0.4)
    const body = world.createRigidBody(bodyDesc)
    colliderDesc
      .setFriction(opts.friction ?? 0.8)
      .setRestitution(opts.restitution ?? 0.15)
    world.createCollider(colliderDesc, body)
    dynamics.push({ mesh, body })
    mesh.userData.body = body
    return body
  }

  function removeDynamic(body) {
    const i = dynamics.findIndex((d) => d.body === body)
    if (i >= 0) dynamics.splice(i, 1)
    world.removeRigidBody(body)
  }

  function sync() {
    for (const { mesh, body } of dynamics) {
      const t = body.translation()
      const r = body.rotation()
      mesh.position.set(t.x, t.y, t.z)
      mesh.quaternion.set(r.x, r.y, r.z, r.w)
    }
  }

  // Comedy switch: fling every dynamic body. strength ~1 = a good jolt.
  function jolt(strength = 1) {
    for (const { body } of dynamics) {
      const m = body.mass()
      body.applyImpulse(
        {
          x: (Math.random() - 0.5) * 3.2 * m * strength,
          y: (2.2 + Math.random() * 2.2) * m * strength,
          z: (Math.random() - 0.5) * 3.2 * m * strength,
        },
        true,
      )
      body.applyTorqueImpulse(
        {
          x: (Math.random() - 0.5) * 0.6 * m * strength,
          y: (Math.random() - 0.5) * 0.6 * m * strength,
          z: (Math.random() - 0.5) * 0.6 * m * strength,
        },
        true,
      )
    }
  }

  return { RAPIER, world, dynamics, addStaticBox, addDynamic, removeDynamic, sync, jolt }
}
