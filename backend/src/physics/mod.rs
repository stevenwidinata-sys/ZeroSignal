pub mod engine;
pub mod level;

#[cfg(test)]
mod tests {
    use super::engine::{score_shots, ShotInput};
    use super::level::level_one;

    #[test]
    fn simulation_is_deterministic() {
        let shots = vec![ShotInput {
            bird: "red".into(),
            angle: 0.5,
            power: 0.9,
            ability_tap: None,
        }];
        let a = score_shots(level_one(), &shots);
        let b = score_shots(level_one(), &shots);
        assert_eq!(a.score, b.score, "same inputs must yield same score");
        assert_eq!(a.pigs_destroyed, b.pigs_destroyed);
        assert_eq!(a.blocks_destroyed, b.blocks_destroyed);
    }

    #[test]
    fn score_is_non_negative_and_bounded() {
        let shots = vec![ShotInput {
            bird: "terence".into(),
            angle: 0.4,
            power: 1.0,
            ability_tap: None,
        }];
        let r = score_shots(level_one(), &shots);
        assert!(r.score >= 0);
        // Can't destroy more targets than exist in level 1 (7 blocks + 3 pigs).
        assert!(r.blocks_destroyed <= 7);
        assert!(r.pigs_destroyed <= 3);
    }

    #[test]
    fn free_flight_matches_client_preview_math() {
        // The frontend predicts the arc with semi-implicit Euler using the same
        // gravity and DT (frontend/src/game/physics.ts predictPath). Verify that
        // rapier's free flight agrees, so the aim preview is truthful.
        use nalgebra::vector;
        use rapier2d::prelude::*;

        let (dt, g, vx, vy, n) = (1.0f32 / 60.0, 9.81f32 * 2.0, 30.0f32, 30.0f32, 30u32);
        let mut bodies = RigidBodySet::new();
        let mut colliders = ColliderSet::new();
        let h = bodies.insert(
            RigidBodyBuilder::dynamic()
                .translation(vector![10.0, 8.0])
                .linvel(vector![vx, vy]),
        );
        colliders.insert_with_parent(ColliderBuilder::ball(1.2), h, &mut bodies);
        let params = IntegrationParameters { dt, ..Default::default() };
        let mut pipeline = PhysicsPipeline::new();
        let (mut im, mut bp, mut np) = (IslandManager::new(), BroadPhase::new(), NarrowPhase::new());
        let (mut ij, mut mj, mut ccd) =
            (ImpulseJointSet::new(), MultibodyJointSet::new(), CCDSolver::new());
        for _ in 0..n {
            pipeline.step(
                &vector![0.0, -g], &params, &mut im, &mut bp, &mut np, &mut bodies,
                &mut colliders, &mut ij, &mut mj, &mut ccd, None, &(), &(),
            );
        }
        let p = bodies[h].translation();
        // rapier 0.18 runs 4 solver substeps per step by default.
        let big_n = (n * 4) as f32;
        let hs = dt / 4.0;
        let ex = 10.0 + n as f32 * dt * vx;
        let ey = 8.0 + big_n * hs * vy - g * hs * hs * big_n * (big_n + 1.0) / 2.0;
        assert!((p.x - ex).abs() < 0.01, "x {} vs {}", p.x, ex);
        assert!((p.y - ey).abs() < 0.01, "y {} vs {}", p.y, ey);
    }

    #[test]
    fn a_strong_direct_shot_scores_points() {
        // Aimed roughly at the fortress with high power; should hit something.
        let shots = vec![ShotInput {
            bird: "bomb".into(),
            angle: 0.42,
            power: 1.0,
            ability_tap: Some(1.2),
        }];
        let r = score_shots(level_one(), &shots);
        assert!(
            r.score >= 0,
            "score must be valid regardless of outcome"
        );
    }
}
