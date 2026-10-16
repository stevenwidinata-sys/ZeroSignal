//! Authoritative, deterministic physics simulation.
//!
//! The client sends only *shot inputs* (which bird, angle, power, and an
//! optional ability-tap time). The server re-simulates every shot here with a
//! fixed timestep and computes the real score. Because the client never sends a
//! score, and the simulation is server-side, scores cannot be forged.

use nalgebra::vector;
use rapier2d::prelude::*;
use serde::{Deserialize, Serialize};

use crate::birds::{self, Ability};
use crate::physics::level::Level;

/// Maximum launch speed (world units / second) at power = 1.0.
const MAX_LAUNCH_SPEED: f32 = 70.0;
/// Fixed simulation timestep.
const DT: f32 = 1.0 / 60.0;
/// Max steps simulated per shot (~8 seconds) to bound compute.
const MAX_STEPS_PER_SHOT: u32 = 480;
/// Speed below which a shot is considered "settled" and we stop early.
const SETTLE_SPEED: f32 = 0.6;

/// A single shot submitted by the client.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ShotInput {
    pub bird: String,
    /// Launch angle in radians (0 = +x, pi/2 = up).
    pub angle: f32,
    /// Launch power in [0, 1].
    pub power: f32,
    /// Optional time (seconds after launch) at which the ability is triggered.
    pub ability_tap: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SimResult {
    pub score: i32,
    pub pigs_destroyed: usize,
    pub blocks_destroyed: usize,
}

/// Points awarded.
const POINTS_PER_PIG: i32 = 1000;
const POINTS_PER_BLOCK: i32 = 150;
/// Bonus for unused birds would go here; single-shot scoring for v1.

struct Target {
    handle: RigidBodyHandle,
    hp: f32,
    destroyed: bool,
    is_pig: bool,
}

pub struct Simulation {
    level: Level,
}

impl Simulation {
    pub fn new(level: Level) -> Self {
        Self { level }
    }

    /// Replay all shots and return the authoritative score.
    pub fn run(&self, shots: &[ShotInput]) -> SimResult {
        let mut bodies = RigidBodySet::new();
        let mut colliders = ColliderSet::new();

        // Ground
        let ground = bodies.insert(RigidBodyBuilder::fixed().translation(vector![
            self.level.width / 2.0,
            -0.5
        ]));
        colliders.insert_with_parent(
            ColliderBuilder::cuboid(self.level.width, 0.5).restitution(0.1),
            ground,
            &mut bodies,
        );

        let mut targets: Vec<Target> = Vec::new();

        // Blocks (dynamic, destructible)
        for b in &self.level.blocks {
            let rb = bodies.insert(
                RigidBodyBuilder::dynamic().translation(vector![b.x, b.y + b.h / 2.0]),
            );
            colliders.insert_with_parent(
                ColliderBuilder::cuboid(b.w / 2.0, b.h / 2.0)
                    .density(1.0)
                    .restitution(0.05),
                rb,
                &mut bodies,
            );
            targets.push(Target {
                handle: rb,
                hp: b.hp,
                destroyed: false,
                is_pig: false,
            });
        }

        // Pigs (dynamic, destructible)
        for p in &self.level.pigs {
            let rb = bodies
                .insert(RigidBodyBuilder::dynamic().translation(vector![p.x, p.y]));
            colliders.insert_with_parent(
                ColliderBuilder::ball(p.r).density(0.6).restitution(0.1),
                rb,
                &mut bodies,
            );
            targets.push(Target {
                handle: rb,
                hp: p.hp,
                destroyed: false,
                is_pig: true,
            });
        }

        let gravity = vector![0.0, -9.81 * 2.0];
        let integration_parameters = IntegrationParameters {
            dt: DT,
            ..Default::default()
        };
        let mut physics_pipeline = PhysicsPipeline::new();
        let mut island_manager = IslandManager::new();
        let mut broad_phase = BroadPhase::new();
        let mut narrow_phase = NarrowPhase::new();
        let mut impulse_joints = ImpulseJointSet::new();
        let mut multibody_joints = MultibodyJointSet::new();
        let mut ccd_solver = CCDSolver::new();
        let mut query_pipeline = QueryPipeline::new();
        let physics_hooks = ();
        let event_handler = ();

        // Track prior velocities to estimate impact energy on targets.
        for shot in shots {
            self.simulate_shot(
                shot,
                &mut bodies,
                &mut colliders,
                &mut targets,
                &gravity,
                &integration_parameters,
                &mut physics_pipeline,
                &mut island_manager,
                &mut broad_phase,
                &mut narrow_phase,
                &mut impulse_joints,
                &mut multibody_joints,
                &mut ccd_solver,
                &mut query_pipeline,
                &physics_hooks,
                &event_handler,
            );
        }

        let pigs_destroyed = targets.iter().filter(|t| t.is_pig && t.destroyed).count();
        let blocks_destroyed =
            targets.iter().filter(|t| !t.is_pig && t.destroyed).count();

        let score = pigs_destroyed as i32 * POINTS_PER_PIG
            + blocks_destroyed as i32 * POINTS_PER_BLOCK;

        SimResult {
            score,
            pigs_destroyed,
            blocks_destroyed,
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn simulate_shot(
        &self,
        shot: &ShotInput,
        bodies: &mut RigidBodySet,
        colliders: &mut ColliderSet,
        targets: &mut [Target],
        gravity: &Vector<Real>,
        integration_parameters: &IntegrationParameters,
        physics_pipeline: &mut PhysicsPipeline,
        island_manager: &mut IslandManager,
        broad_phase: &mut BroadPhase,
        narrow_phase: &mut NarrowPhase,
        impulse_joints: &mut ImpulseJointSet,
        multibody_joints: &mut MultibodyJointSet,
        ccd_solver: &mut CCDSolver,
        query_pipeline: &mut QueryPipeline,
        physics_hooks: &dyn PhysicsHooks,
        event_handler: &dyn EventHandler,
    ) {
        let variant = birds::find(&shot.bird).unwrap_or(&birds::BIRDS[0]);
        let power = shot.power.clamp(0.0, 1.0);
        let speed = MAX_LAUNCH_SPEED * power * variant.power;
        let vx = speed * shot.angle.cos();
        let vy = speed * shot.angle.sin();

        // Spawn the bird at the slingshot.
        let bird_body = bodies.insert(
            RigidBodyBuilder::dynamic()
                .translation(vector![self.level.slingshot_x, self.level.slingshot_y])
                .linvel(vector![vx, vy])
                .ccd_enabled(true),
        );
        let bird_radius = 1.2;
        colliders.insert_with_parent(
            ColliderBuilder::ball(bird_radius)
                .density(variant.mass)
                .restitution(0.1),
            bird_body,
            bodies,
        );

        let mut ability_fired = false;

        for step in 0..MAX_STEPS_PER_SHOT {
            let elapsed = step as f32 * DT;

            // Trigger ability at the requested time (once).
            if !ability_fired {
                if let Some(tap) = shot.ability_tap {
                    if elapsed >= tap {
                        self.fire_ability(variant.ability, bird_body, bodies);
                        ability_fired = true;
                    }
                }
            }

            physics_pipeline.step(
                gravity,
                integration_parameters,
                island_manager,
                broad_phase,
                narrow_phase,
                bodies,
                colliders,
                impulse_joints,
                multibody_joints,
                ccd_solver,
                Some(query_pipeline),
                physics_hooks,
                event_handler,
            );

            // Apply damage to targets based on kinetic energy of the bird when
            // it is near them (simple, deterministic impact model).
            self.apply_impacts(bird_body, targets, bodies, colliders);

            // Early-out once the bird has settled.
            if let Some(b) = bodies.get(bird_body) {
                let v = b.linvel();
                let on_ground = b.translation().y <= 1.5;
                if v.norm() < SETTLE_SPEED && on_ground && elapsed > 0.5 {
                    break;
                }
                // Off-screen: stop simulating this shot.
                if b.translation().x > self.level.width + 10.0
                    || b.translation().x < -10.0
                {
                    break;
                }
            }
        }

        // Remove the bird before the next shot.
        bodies.remove(
            bird_body,
            island_manager,
            colliders,
            impulse_joints,
            multibody_joints,
            true,
        );
    }

    fn fire_ability(
        &self,
        ability: Ability,
        bird_body: RigidBodyHandle,
        bodies: &mut RigidBodySet,
    ) {
        let (vel, pos) = match bodies.get(bird_body) {
            Some(b) => (*b.linvel(), *b.translation()),
            None => return,
        };
        match ability {
            Ability::Dash => {
                if let Some(b) = bodies.get_mut(bird_body) {
                    let dir = if vel.norm() > 0.01 {
                        vel.normalize()
                    } else {
                        vector![1.0, 0.0]
                    };
                    let boosted = vel + dir * 40.0;
                    b.set_linvel(boosted, true);
                }
            }
            Ability::EggDrop => {
                if let Some(b) = bodies.get_mut(bird_body) {
                    let v = vector![vel.x, vel.y - 50.0];
                    b.set_linvel(v, true);
                }
            }
            Ability::Explode => {
                // Radial impulse to nearby dynamic bodies.
                let blast_radius = 10.0;
                let blast_strength = 220.0;
                let handles: Vec<RigidBodyHandle> =
                    bodies.iter().map(|(h, _)| h).collect();
                for h in handles {
                    if h == bird_body {
                        continue;
                    }
                    if let Some(body) = bodies.get_mut(h) {
                        if !body.is_dynamic() {
                            continue;
                        }
                        let d = body.translation() - pos;
                        let dist = d.norm();
                        if dist < blast_radius && dist > 0.001 {
                            let falloff = 1.0 - (dist / blast_radius);
                            let impulse = d.normalize() * blast_strength * falloff;
                            body.apply_impulse(impulse, true);
                        }
                    }
                }
            }
            Ability::Split => {
                // Nudge the bird upward to simulate a split spread. (Spawning
                // extra bodies mid-borrow is complex; the vertical spread plus
                // mass makes Split still effective and deterministic.)
                if let Some(b) = bodies.get_mut(bird_body) {
                    let v = vector![vel.x * 1.2, vel.y + 15.0];
                    b.set_linvel(v, true);
                }
            }
            Ability::None | Ability::Heavy => {}
        }
    }

    /// Deterministic impact model: when the bird overlaps a target, subtract
    /// kinetic energy from the target's hp. Destroyed targets are teleported
    /// far below the world so they stop participating (avoids mid-step collider
    /// removal, which would corrupt the island manager state).
    fn apply_impacts(
        &self,
        bird_body: RigidBodyHandle,
        targets: &mut [Target],
        bodies: &mut RigidBodySet,
        _colliders: &mut ColliderSet,
    ) {
        let (bird_pos, bird_vel, bird_mass) = match bodies.get(bird_body) {
            Some(b) => (*b.translation(), b.linvel().norm(), b.mass()),
            None => return,
        };

        for t in targets.iter_mut() {
            if t.destroyed {
                continue;
            }
            let tpos = match bodies.get(t.handle) {
                Some(b) => *b.translation(),
                None => continue,
            };
            let dist = (bird_pos - tpos).norm();
            // Proximity threshold scales with bird radius + typical target size.
            if dist < 3.0 {
                let impact = 0.5 * bird_mass * bird_vel * bird_vel * 0.02;
                if impact > 1.0 {
                    t.hp -= impact;
                    if t.hp <= 0.0 {
                        t.destroyed = true;
                        // Teleport out of play and freeze it.
                        if let Some(b) = bodies.get_mut(t.handle) {
                            b.set_translation(vector![-1000.0, -1000.0], true);
                            b.set_linvel(vector![0.0, 0.0], true);
                            b.set_angvel(0.0, true);
                        }
                    }
                }
            }
        }
    }
}

/// Convenience entry point used by handlers.
pub fn score_shots(level: Level, shots: &[ShotInput]) -> SimResult {
    Simulation::new(level).run(shots)
}
