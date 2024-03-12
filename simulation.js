import {defs, tiny} from './examples/common.js';

const {
    Vector, Vector3, vec, vec3, vec4, color, hex_color, Shader, Matrix, Mat4, Light, Shape, Material, Texture, Scene,
} = tiny;

import { Body } from './examples/collisions-demo.js';



// class that encapsulates all simulation objects and logic
export class Simulation extends Scene {
    // **Simulation** manages the stepping of simulation time.  Subclass it when making
    // a Scene that is a physics demo.  This technique is careful to totally decouple
    // the simulation from the frame rate (see below).
    constructor() {
        super();

        setInterval(() => {
            if (this.user_sphere != null) {
                console.log("Ball center:", this.user_sphere.center);
            }
        }, 3000); // Log every 3 seconds
        Object.assign(this, {time_accumulator: 0, time_scale: 1, t: 0, dt: 1 / 100, user_sphere: null, steps_taken: 0, bodies : [], boosts: []});
        
        // Make simpler dummy shapes for representing all other shapes during collisions:
        this.colliders = [
            {intersect_test: Body.intersect_sphere, points: new defs.Subdivision_Sphere(2), leeway: .1},
            {intersect_test: Body.intersect_cube, points: new defs.Cube(), leeway: .1}
        ];
        this.collider_selection = 0;
    }

    simulate(frame_time) {
        // simulate(): Carefully advance time according to Glenn Fiedler's
        // "Fix Your Timestep" blog post.
        // This line gives ourselves a way to trick the simulator into thinking
        // that the display framerate is running fast or slow:
        frame_time = this.time_scale * frame_time;

        // Avoid the spiral of death; limit the amount of time we will spend
        // computing during this timestep if display lags:
        this.time_accumulator += Math.min(frame_time, 0.1);
        // Repeatedly step the simulation until we're caught up with this frame:
        while (Math.abs(this.time_accumulator) >= this.dt) {
            // Single step of the simulation for all bodies:
            this.update_state(this.dt);
            if (this.user_sphere != null)
                this.user_sphere.advance(this.dt);
            // Following the advice of the article, de-couple
            // our simulation time from our frame rate:
            this.t += Math.sign(frame_time) * this.dt;
            this.time_accumulator -= Math.sign(frame_time) * this.dt;
            this.steps_taken++;
        }
        // Store an interpolation factor for how close our frame fell in between
        // the two latest simulation time steps, so we can correctly blend the
        // two latest states and display the result.
        let alpha = this.time_accumulator / this.dt;
        if (this.user_sphere != null)
            this.user_sphere.blend_state(alpha);
    }

    display(context, program_state) {
        // display(): advance the time and state of our whole simulation.
        this.program_state = program_state;

        if (program_state.animate)
            this.simulate(program_state.animation_delta_time);
    }

    // objects that aren't blurred
    // IMPORTANT: Anything black will be clipped out. If you want, black, use color(.01,.01,.01,1) or something
    render_scene_normal(context, program_state) {
        if (this.user_sphere != null)
            this.user_sphere.shape.draw(context, program_state, this.user_sphere.drawn_location, this.user_sphere.material);

        for (let a of this.bodies)
            a.shape.draw(context, program_state, a.drawn_location, a.material);
        
        for (let a of this.boosts)
            a.shape.draw(context, program_state, a.drawn_location, a.material);
    }

    // objects to be blurred. note some objects are drawn both blurred and not blurred
    render_scene_blurred(context, program_state) {
        if (this.user_sphere != null)
            this.user_sphere.shape.draw(context, program_state, this.user_sphere.drawn_location, this.user_sphere.material);

        for (let a of this.bodies)
            a.shape.draw(context, program_state, a.drawn_location, a.material);

        for (let a of this.boosts)
            a.shape.draw(context, program_state, a.drawn_location, a.material);
    }

    update_state(dt)      // update_state(): Your subclass of Simulation has to override this abstract function.
    {
        throw "Override this"
    }
}